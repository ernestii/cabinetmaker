import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { produce } from 'immer';
import type { Cabinet, Material, Opening, Project, WallElement, Zone } from '../domain/types';
import { seedProject, newProject, defaultPricing, defaultMaterials, projectDefaults, DEMOS } from '../domain/seed';
import { getFixture, getFrontType, getSelectionCommand } from '../domain/plugins';
import { wallMetrics } from '../domain/geometry/metrics';
import { elementVertical, defaultDoorCount } from '../domain/elements';
import { allWalls, activeWall, wallContaining, getElement } from '../domain/project';
import { applyWidth, applyWidthClamped, maxWidthFor, clampElementX, freeXForZone, normalizeElement, defaultHingeSide, resizeLeftEdge, moveSeamBetween, freesUpperBand, elementsOverlapX } from '../domain/layout';
import { CABINET_TARGET_WIDTH, MIN_CABINET_WIDTH, MIN_ELEMENT_WIDTH, MIN_UPPER_HEIGHT } from '../domain/constants';
import { snapTo } from '../domain/format';
import { createResilientStorage } from './persistStorage';

/**
 * Make a loaded/partial project safe for the current schema: backfill the fields
 * the geometry/cut-list pipelines dereference (defaults, materials, units) so an
 * imported file that's missing them can't crash a downstream render, and repair
 * any element whose field combination is illegal (e.g. a base-zone fridge).
 */
function normalizeProject(p: Project): Project {
  if (!Array.isArray(p.rooms)) p.rooms = [];
  if (!Array.isArray(p.materials) || p.materials.length === 0) p.materials = defaultMaterials();
  for (const m of p.materials) {
    const legacy = (m as Material & { role?: Material['roles'][number] }).role;
    if (!Array.isArray(m.roles)) m.roles = legacy ? [legacy] : [];
  }
  // Merge over the canonical defaults so a missing/partial block is filled in.
  p.defaults = { ...projectDefaults(), ...(p.defaults ?? {}) };
  p.pricing = { ...defaultPricing(), ...(p.pricing ?? {}) };
  if (p.units !== 'in') p.units = 'in';
  for (const w of allWalls(p)) for (const el of w.elements ?? []) normalizeElement(el);
  return p;
}

export type ViewKey = 'layout' | '3d' | 'cutlist' | 'shopping' | 'assembly' | 'materials' | 'settings';

export { MIN_ELEMENT_WIDTH, MIN_CABINET_WIDTH };

function genId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.floor(Math.random() * 1e9).toString(36);
  return `${prefix}-${rnd}`;
}

function newCabinet(front: Opening[], widthIn = 24): Cabinet {
  return { id: genId('cab'), widthIn, front };
}
function defaultFrontDoor(widthIn = 24): Opening[] {
  // Wide cabinets get a pair of doors by default (best-practice split).
  return [{ id: genId('op'), type: 'door', doorCount: defaultDoorCount(widthIn), hingeSide: 'left', heightIn: 'auto' }];
}

/** A fresh cabinet element of the given zone. */
function defaultCabinetElement(zone: Zone, xIn: number, widthIn: number): WallElement {
  return { id: genId('el'), xIn, widthIn, zone, cabinet: newCabinet(defaultFrontDoor(widthIn), widthIn) };
}

/** The exclusive kinds the Inspector's "Section type" picker offers. */
export type SectionType = 'cabinet' | 'appliance' | 'workbench' | 'empty';

/** The stock standalone appliance to seed for a band when the user picks "Appliance". */
const ZONE_DEFAULT_FIXTURE: Record<Zone, string> = { base: 'dishwasher', upper: 'hood', tall: 'fridge' };

/**
 * Turn `el` into a standalone appliance: clears any carcass/workbench, picks the
 * fixture (an explicit `fixtureId`, else the band's stock fixture), locks it to a
 * standard size, and adopts the fixture's natural zone. Shared by `addElement`
 * and `setElementType`.
 */
function makeAppliance(el: WallElement, fixtureId?: string): void {
  const fid = fixtureId ?? ZONE_DEFAULT_FIXTURE[el.zone] ?? 'dishwasher';
  el.cabinet = undefined;
  el.workbench = undefined;
  el.fixtureId = fid;
  el.fixture = { widthLocked: true };
  const def = getFixture(fid);
  if (def) {
    el.zone = def.zone;
    if (def.standardWidthsIn?.length) applyWidth(el, def.defaultWidthIn);
  }
}

interface UIState {
  view: ViewKey;
  selectedWallId?: string;
  /** The "primary" selected element — drives the single-element Inspector. */
  selectedElementId?: string;
  /**
   * Every selected element (for multi-select bulk commands). Mirrors
   * `selectedElementId` for a single pick; carries the whole set when the user
   * Ctrl/Cmd/Shift-clicks to extend the selection. Empty ⇒ nothing selected.
   */
  selectedElementIds?: string[];
  selectedOpeningId?: string;
  /** The Room/Project node is selected — the Inspector shows project settings. */
  roomSelected?: boolean;
}

interface StoreState {
  project: Project;
  ui: UIState;
  /** Undo/redo timeline of whole-project snapshots (not persisted). */
  past: Project[];
  future: Project[];
  /** Tag of the last coalescable commit, so a drag is one undo step, not 40. */
  _coalesce?: string;

  setProject: (p: Project) => void;
  loadJSON: (json: string) => boolean;
  exportJSON: () => string;
  resetToSeed: () => void;
  resetToBlank: () => void;
  loadDemo: (key: string) => void;
  /**
   * The single mutation seam: produces the next project and records it on the
   * undo stack. Pass a `coalesceKey` (e.g. `move:<id>`) to fold a run of rapid
   * edits — a drag or arrow-nudge — into one undoable step.
   */
  updateProject: (fn: (draft: Project) => void, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;

  setView: (v: ViewKey) => void;
  select: (elementId?: string) => void;
  /** Add/remove an element from the multi-selection (Ctrl/Cmd/Shift-click). */
  toggleSelect: (elementId: string) => void;
  selectOpening: (openingId?: string) => void;
  selectWall: (wallId: string) => void;
  /** Select the Room/Project node — the Inspector shows project-wide settings. */
  selectRoom: () => void;
  addWall: () => void;
  removeWall: (wallId: string) => void;

  /** Add an element to the active wall (at `xIn` if given, else after the zone's last). */
  addElement: (
    zone: Zone,
    opts?: { xIn?: number; widthIn?: number; kind?: 'cabinet' | 'appliance' | 'workbench' | 'empty'; fixtureId?: string },
  ) => void;
  updateElement: (id: string, patch: Partial<WallElement>) => void;
  removeElement: (id: string) => void;
  /** Clone an element (fresh ids) and drop it into the next free spot to its right. */
  duplicateElement: (id: string) => void;
  /** Move an element's left edge along the wall. */
  moveElement: (id: string, newX: number) => void;
  /** Resize an element's width (snaps locked appliances to standard sizes). */
  resizeElement: (id: string, newWidth: number) => void;
  /** Resize an element by dragging its LEFT edge (its right edge stays put). */
  resizeElementLeft: (id: string, newLeftX: number) => void;
  /** Move the shared seam between two abutting same-band elements (resize both). */
  moveSeam: (leftId: string, rightId: string, newSeamX: number) => void;
  /** Set the element's exclusive kind (cabinet / appliance / workbench / empty). */
  setElementType: (id: string, type: SectionType) => void;
  /** Toggle a drop-in cooktop integrated over a base cabinet. */
  setDropInCooktop: (id: string, on: boolean) => void;
  /** Add or remove the carcass cabinet on an element. */
  setElementCabinet: (id: string, on: boolean) => void;
  /** Choose the integrated/standalone fixture ('' clears it). */
  setElementFixture: (id: string, fixtureId: string) => void;
  /** Toggle the workbench (counter-on-legs) flag. */
  setElementWorkbench: (id: string, on: boolean) => void;

  updateCabinet: (elementId: string, patch: Partial<Cabinet>) => void;
  /** Run a front-type plugin command (a layout suggestion/transform) on an opening. */
  runFrontCommand: (elementId: string, openingId: string, commandId: string) => void;
  /** Run a multi-select bulk command (Axis 6) over the current `selectedElementIds`. */
  runSelectionCommand: (commandId: string) => void;
  addOpening: (elementId: string) => void;
  updateOpening: (elementId: string, openingId: string, patch: Partial<Opening>) => void;
  /** Set custom shelf heights for an opening (coalesced so a drag is one undo step). */
  setShelfOffsets: (elementId: string, openingId: string, offsetsIn: number[]) => void;
  removeOpening: (elementId: string, openingId: string) => void;
  moveOpening: (elementId: string, openingId: string, dir: -1 | 1) => void;
}

const initial = seedProject();

/** Cap on undo depth — deep enough to feel forgiving, bounded so memory stays flat. */
const HISTORY_LIMIT = 50;
/** Loading/replacing the whole document starts a fresh timeline. */
const FRESH_HISTORY = { past: [] as Project[], future: [] as Project[], _coalesce: undefined };

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      project: initial,
      ui: { view: 'layout' },
      past: [],
      future: [],

      setProject: (p) => set({ project: p, ...FRESH_HISTORY }),
      loadJSON: (json) => {
        try {
          const p = JSON.parse(json) as Project;
          if (!p || !Array.isArray(p.rooms)) return false;
          set({ project: normalizeProject(p), ui: { view: get().ui.view }, ...FRESH_HISTORY });
          return true;
        } catch {
          return false;
        }
      },
      exportJSON: () => JSON.stringify(get().project, null, 2),
      resetToSeed: () => set({ project: seedProject(), ui: { view: 'layout' }, ...FRESH_HISTORY }),
      resetToBlank: () => set({ project: newProject(), ui: { view: 'layout' }, ...FRESH_HISTORY }),
      loadDemo: (key) => {
        const demo = DEMOS.find((d) => d.key === key);
        if (demo) set({ project: demo.build(), ui: { view: 'layout' }, ...FRESH_HISTORY });
      },
      // Immer's structural sharing clones only the touched paths (vs a full
      // structuredClone of the whole project) while keeping the mutate-the-draft
      // ergonomics every action relies on. Immer returns the SAME reference when
      // the recipe changes nothing, so a no-op edit never lands on the undo stack.
      updateProject: (fn, coalesceKey) => {
        const prev = get().project;
        const next = produce(prev, fn);
        if (next === prev) return;
        const { past, _coalesce } = get();
        // Same coalesce tag as the previous commit → keep the snapshot we already
        // pushed (the pre-gesture state) instead of stacking a new one.
        const coalesced = coalesceKey != null && coalesceKey === _coalesce;
        set({
          project: next,
          past: coalesced ? past : [...past, prev].slice(-HISTORY_LIMIT),
          future: [],
          _coalesce: coalesceKey,
        });
      },
      undo: () => {
        const { past, future, project } = get();
        if (past.length === 0) return;
        set({
          project: past[past.length - 1],
          past: past.slice(0, -1),
          future: [project, ...future].slice(0, HISTORY_LIMIT),
          _coalesce: undefined,
        });
      },
      redo: () => {
        const { past, future, project } = get();
        if (future.length === 0) return;
        set({
          project: future[0],
          past: [...past, project].slice(-HISTORY_LIMIT),
          future: future.slice(1),
          _coalesce: undefined,
        });
      },

      setView: (v) => set({ ui: { ...get().ui, view: v } }),
      select: (elementId) => set({ ui: { ...get().ui, selectedElementId: elementId, selectedElementIds: elementId ? [elementId] : [], selectedOpeningId: undefined, roomSelected: false } }),
      toggleSelect: (elementId) =>
        set((s) => {
          const cur = s.ui.selectedElementIds ?? (s.ui.selectedElementId ? [s.ui.selectedElementId] : []);
          const has = cur.includes(elementId);
          const next = has ? cur.filter((id) => id !== elementId) : [...cur, elementId];
          // The primary follows the click: the just-added id, or — if we removed the
          // current primary — whatever's left (last), so the Inspector never points
          // at a deselected section.
          const primary = has ? (s.ui.selectedElementId === elementId ? next[next.length - 1] : s.ui.selectedElementId) : elementId;
          return { ui: { ...s.ui, selectedElementIds: next, selectedElementId: next.length ? primary : undefined, selectedOpeningId: undefined, roomSelected: false } };
        }),
      selectOpening: (openingId) => set({ ui: { ...get().ui, selectedOpeningId: openingId, roomSelected: false } }),
      selectWall: (wallId) => set({ ui: { ...get().ui, selectedWallId: wallId, selectedElementId: undefined, selectedElementIds: [], selectedOpeningId: undefined, roomSelected: false } }),
      selectRoom: () => set({ ui: { ...get().ui, roomSelected: true, selectedElementId: undefined, selectedElementIds: [], selectedOpeningId: undefined } }),
      addWall: () =>
        get().updateProject((p) => {
          const room = p.rooms[0];
          if (!room) return;
          const prev = room.walls[room.walls.length - 1];
          const id = genId('wall');
          const turning = room.walls.length > 0;
          // A turning wall starts with a dead-corner gap so its cabinets clear the
          // run on the previous wall — sized to that run's depth.
          const cornerWidth = Math.round(p.defaults.baseDepthIn ?? 24);
          const len = prev?.lengthIn ?? 120;
          const startW = Math.min(36, Math.max(18, len - (turning ? cornerWidth : 0)));
          // Seed the wall with a starter base cabinet so it's never blank.
          const elements: WallElement[] = [defaultCabinetElement('base', turning ? cornerWidth : 0, startW)];
          // New walls turn 90° into the room by default (an L); straighten to 0 to extend.
          room.walls.push({ id, name: `Wall ${String.fromCharCode(65 + room.walls.length)}`, lengthIn: prev?.lengthIn ?? 120, ceilingHeightIn: prev?.ceilingHeightIn ?? 96, turnDeg: turning ? 90 : 0, elements });
          set({ ui: { ...get().ui, selectedWallId: id, selectedElementId: undefined, selectedElementIds: [] } });
        }),
      removeWall: (wallId) =>
        get().updateProject((p) => {
          const room = p.rooms[0];
          if (!room || room.walls.length <= 1) return; // keep at least one wall
          room.walls = room.walls.filter((w) => w.id !== wallId);
          if (get().ui.selectedWallId === wallId) set({ ui: { ...get().ui, selectedWallId: room.walls[0]?.id, selectedElementId: undefined, selectedElementIds: [] } });
        }),

      addElement: (zone, opts) =>
        get().updateProject((p) => {
          const wall = activeWall(p, get().ui.selectedWallId);
          if (!wall) return;
          const width = opts?.widthIn ?? CABINET_TARGET_WIDTH;
          const xIn = opts?.xIn ?? Math.min(freeXForZone(wall, zone), Math.max(0, wall.lengthIn - width));
          const kind = opts?.kind ?? 'cabinet';
          const el: WallElement = { id: genId('el'), xIn: Math.max(0, snapTo(xIn)), widthIn: width, zone };
          if (kind === 'cabinet') el.cabinet = newCabinet(defaultFrontDoor(width), width);
          else if (kind === 'workbench') el.workbench = true;
          else if (kind === 'appliance') makeAppliance(el, opts?.fixtureId);
          (wall.elements ??= []).push(el);
          // Now that the element sits in the wall, point single doors' hinges at the
          // nearer neighbour/wall so they open into the room (best-practice default).
          if (el.cabinet) {
            const hinge = defaultHingeSide(wall, el);
            for (const op of el.cabinet.front) if (op.type === 'door' && (op.doorCount ?? 1) === 1) op.hingeSide = hinge;
          }
          // An over-fridge upper: if this new upper hangs above a fridge (a tall
          // fixture that frees the band), shrink it to the gap above the fridge
          // body so it lands on top of the appliance instead of crashing into it.
          if (el.cabinet && zone === 'upper') {
            const fridgeBelow = (wall.elements ?? []).find((o) => o.id !== el.id && freesUpperBand(o) && elementsOverlapX(o, el));
            const def = fridgeBelow?.fixtureId ? getFixture(fridgeBelow.fixtureId) : undefined;
            const fridgeTop = def?.occupiedHeightIn?.({ element: fridgeBelow!, config: fridgeBelow!.fixture, metrics: wallMetrics(p, wall) });
            if (fridgeTop != null) {
              const avail = snapTo(wall.ceilingHeightIn - p.defaults.upperCeilingGapIn - fridgeTop);
              if (avail >= MIN_UPPER_HEIGHT && avail < p.defaults.upperHeightIn) el.heightOverrideIn = avail;
            }
          }
          set({ ui: { ...get().ui, selectedElementId: el.id, selectedElementIds: [el.id], selectedOpeningId: undefined } });
        }),
      updateElement: (id, patch) =>
        get().updateProject((p) => {
          const el = getElement(p, id);
          if (!el) return;
          if (patch.widthIn != null) {
            const w = wallContaining(p, id);
            applyWidthClamped(el, patch.widthIn, w ? maxWidthFor(w, el) : Infinity);
            patch = { ...patch };
            delete patch.widthIn;
          }
          Object.assign(el, patch);
        }),
      removeElement: (id) =>
        get().updateProject((p) => {
          const w = wallContaining(p, id);
          if (w) w.elements = (w.elements ?? []).filter((e) => e.id !== id);
        }),
      duplicateElement: (id) => {
        const cloneId = genId('el');
        get().updateProject((p) => {
          const w = wallContaining(p, id);
          const el = getElement(p, id);
          if (!w || !el) return;
          const clone: WallElement = structuredClone(el);
          clone.id = cloneId;
          // Fresh ids for the carcass + its fronts so selection/keys stay unique.
          if (clone.cabinet) {
            clone.cabinet.id = genId('cab');
            clone.cabinet.front = clone.cabinet.front.map((o) => ({ ...o, id: genId('op') }));
          }
          // Drop it directly to the right, clamped off any neighbour / the wall end.
          clone.xIn = clampElementX(w, clone, el.xIn + el.widthIn);
          (w.elements ??= []).push(clone);
        });
        set({ ui: { ...get().ui, selectedElementId: cloneId, selectedElementIds: [cloneId], selectedOpeningId: undefined } });
      },
      moveElement: (id, newX) =>
        get().updateProject((p) => {
          const w = wallContaining(p, id);
          const el = getElement(p, id);
          if (!w || !el) return;
          // Clamp to the wall AND against any element sharing its vertical band,
          // so a section can't be dragged on top of a neighbour.
          el.xIn = clampElementX(w, el, Math.max(0, snapTo(newX)));
        }, `move:${id}`),
      resizeElement: (id, newWidth) =>
        get().updateProject((p) => {
          const w = wallContaining(p, id);
          const el = getElement(p, id);
          if (!el) return;
          // Cap growth at the next band neighbour so a resize can't create an overlap.
          applyWidthClamped(el, newWidth, w ? maxWidthFor(w, el) : Infinity);
        }, `resize:${id}`),
      resizeElementLeft: (id, newLeftX) =>
        get().updateProject((p) => {
          const w = wallContaining(p, id);
          const el = getElement(p, id);
          if (!w || !el) return;
          // Drag the left edge; the right edge is pinned and growth clamps at the
          // nearest left band neighbour (so the pair can't overlap).
          resizeLeftEdge(w, el, newLeftX);
        }, `resizeL:${id}`),
      moveSeam: (leftId, rightId, newSeamX) =>
        get().updateProject((p) => {
          const w = wallContaining(p, leftId);
          const left = getElement(p, leftId);
          const right = getElement(p, rightId);
          if (!w || !left || !right) return;
          // Outer edges stay put; the seam (and both inner widths) move together.
          moveSeamBetween(left, right, newSeamX);
        }, `seam:${leftId}`),
      setElementCabinet: (id, on) =>
        get().updateProject((p) => {
          const el = getElement(p, id);
          if (!el) return;
          if (on) {
            el.cabinet = el.cabinet ?? newCabinet(defaultFrontDoor(el.widthIn), el.widthIn);
            el.workbench = undefined;
            // A full appliance owns its whole section — adding a cabinet clears it
            // (only integratable fixtures, e.g. a cooktop, may share the section).
            const def = getFixture(el.fixtureId);
            if (def && !def.integratable) { el.fixtureId = undefined; el.fixture = undefined; }
          } else el.cabinet = undefined;
        }),
      setElementFixture: (id, fixtureId) =>
        get().updateProject((p) => {
          const el = getElement(p, id);
          if (!el) return;
          if (!fixtureId) { el.fixtureId = undefined; el.fixture = undefined; return; }
          const def = getFixture(fixtureId);
          // A standalone (non-integratable) appliance takes over the whole
          // section: drop any cabinet/workbench so it's never "cabinet AND fridge".
          if (def && !def.integratable) { el.cabinet = undefined; el.workbench = undefined; }
          el.fixtureId = fixtureId;
          el.fixture = el.fixture ?? {};
          if (def?.standardWidthsIn?.length) {
            el.fixture.widthLocked = el.fixture.widthLocked ?? true;
            applyWidth(el, el.widthIn);
          }
          // A standalone fixture adopts the fixture's natural band (e.g. fridge → tall).
          if (!el.cabinet && !el.workbench && def) el.zone = def.zone;
        }),
      setElementWorkbench: (id, on) =>
        get().updateProject((p) => {
          const el = getElement(p, id);
          if (!el) return;
          if (on) {
            el.workbench = true;
            el.cabinet = undefined;
            el.zone = 'base';
            const def = getFixture(el.fixtureId);
            if (def && !def.integratable) { el.fixtureId = undefined; el.fixture = undefined; }
          } else el.workbench = undefined;
        }),
      setElementType: (id, type) =>
        get().updateProject((p) => {
          const el = getElement(p, id);
          if (!el) return;
          // Each branch sets one exclusive kind; normalizeElement at the end
          // guarantees a legal field combination (no cabinet+standalone-fixture, …).
          if (type === 'cabinet') {
            el.cabinet = el.cabinet ?? newCabinet(defaultFrontDoor(el.widthIn), el.widthIn);
            el.workbench = undefined;
            // Drop a standalone appliance, but keep an integrated drop-in (cooktop).
            const def = getFixture(el.fixtureId);
            if (def && !def.integratable) { el.fixtureId = undefined; el.fixture = undefined; }
          } else if (type === 'appliance') {
            makeAppliance(el);
          } else if (type === 'workbench') {
            el.workbench = true;
            el.cabinet = undefined;
            el.zone = 'base';
            el.fixtureId = undefined;
            el.fixture = undefined;
          } else {
            el.cabinet = undefined;
            el.workbench = undefined;
            el.fixtureId = undefined;
            el.fixture = undefined;
          }
          normalizeElement(el);
        }),
      setDropInCooktop: (id, on) =>
        get().updateProject((p) => {
          const el = getElement(p, id);
          if (!el) return;
          if (on) {
            // The cooktop is integratable, so the base cabinet stays. Leave the
            // shared width unlocked so it isn't snapped to cooktop standard sizes.
            el.fixtureId = 'cooktop';
            el.fixture = { ...el.fixture, widthLocked: false };
          } else if (el.fixtureId === 'cooktop') {
            el.fixtureId = undefined;
            el.fixture = undefined;
          }
          normalizeElement(el);
        }),

      updateCabinet: (elementId, patch) =>
        get().updateProject((p) => { const el = getElement(p, elementId); if (el?.cabinet) Object.assign(el.cabinet, patch); }),
      runFrontCommand: (elementId, openingId, commandId) =>
        get().updateProject((p) => {
          const wall = wallContaining(p, elementId);
          const el = getElement(p, elementId);
          const cab = el?.cabinet;
          if (!wall || !el || !cab) return;
          const op = cab.front.find((o) => o.id === openingId);
          if (!op) return;
          const cmd = getFrontType(op.type)?.commands?.find((c) => c.id === commandId);
          if (!cmd) return;
          const m = wallMetrics(p, wall);
          const v = elementVertical(el, wall, m, p.defaults);
          const depthIn = cab.depthOverrideIn ?? v.depthDefault;
          const result = cmd.run({ opening: op, cabinet: cab, widthIn: cab.widthIn, carcassHeightIn: v.carcassH, depthIn, defaults: p.defaults, newId: genId });
          if ('front' in result) cab.front = result.front;
          else Object.assign(op, result.opening);
        }),
      runSelectionCommand: (commandId) =>
        get().updateProject((p) => {
          const ids = get().ui.selectedElementIds ?? [];
          const cmd = getSelectionCommand(commandId);
          if (!cmd || ids.length < (cmd.minElements ?? 2)) return;
          // Multi-select is always within the active wall (the elevation shows one
          // wall at a time), so resolve the selection against it.
          const wall = activeWall(p, get().ui.selectedWallId);
          if (!wall) return;
          const selected = (wall.elements ?? []).filter((e) => ids.includes(e.id)).sort((a, b) => a.xIn - b.xIn);
          if (selected.length < (cmd.minElements ?? 2)) return;
          const result = cmd.run({ elements: selected, wall, project: p, defaults: p.defaults });
          for (const { id, patch } of result.elements ?? []) {
            const el = (wall.elements ?? []).find((e) => e.id === id);
            if (!el) continue;
            // Position/width go through the same snap + width rules as a manual edit;
            // any other field the command sets is applied verbatim.
            const { xIn, widthIn, ...rest } = patch;
            if (widthIn != null) applyWidth(el, widthIn);
            if (xIn != null) el.xIn = Math.max(0, snapTo(xIn));
            Object.assign(el, rest);
          }
        }),
      addOpening: (elementId) =>
        get().updateProject((p) => { const c = getElement(p, elementId)?.cabinet; if (c) c.front.push({ id: genId('op'), type: 'drawer', heightIn: 'auto' }); }),
      updateOpening: (elementId, openingId, patch) =>
        get().updateProject((p) => { const c = getElement(p, elementId)?.cabinet; const o = c?.front.find((x) => x.id === openingId); if (o) Object.assign(o, patch); }),
      setShelfOffsets: (elementId, openingId, offsetsIn) =>
        get().updateProject((p) => {
          const o = getElement(p, elementId)?.cabinet?.front.find((x) => x.id === openingId);
          if (o) o.shelfOffsetsIn = offsetsIn;
        }, `shelf:${openingId}`),
      removeOpening: (elementId, openingId) =>
        get().updateProject((p) => { const c = getElement(p, elementId)?.cabinet; if (c) c.front = c.front.filter((x) => x.id !== openingId); }),
      moveOpening: (elementId, openingId, dir) =>
        get().updateProject((p) => {
          const c = getElement(p, elementId)?.cabinet;
          if (!c) return;
          const i = c.front.findIndex((x) => x.id === openingId);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= c.front.length) return;
          [c.front[i], c.front[j]] = [c.front[j], c.front[i]];
        }),
    }),
    {
      name: 'cabinetmaker-project',
      version: 4,
      // Resilient storage: backup mirror + corruption recovery + quota-safe writes.
      storage: createJSONStorage(() => createResilientStorage()),
      partialize: (s) => ({ project: s.project }),
      // Only element-model projects are valid; anything else (older/corrupt) reseeds.
      migrate: (persisted): { project: Project } => {
        const p = persisted as Partial<StoreState> | undefined;
        const wall = p?.project?.rooms?.[0]?.walls?.[0];
        if (!p?.project || !Array.isArray(wall?.elements)) return { project: seedProject() };
        return { project: normalizeProject(p.project) };
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<StoreState> | undefined;
        const wall = p?.project?.rooms?.[0]?.walls?.[0];
        const valid = Array.isArray(wall?.elements);
        return { ...current, project: valid ? normalizeProject(p!.project!) : current.project, ui: { ...current.ui } };
      },
    },
  ),
);

// Re-export the pure project queries so existing imports from the store keep working.
export { genId };
export { getElement, wallContaining, firstWall, allWalls, activeWall } from '../domain/project';
