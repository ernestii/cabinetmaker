import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Menu, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconArrowsHorizontal } from '@tabler/icons-react';
import { toFraction } from '../../domain/format';
import { CABINET_TARGET_WIDTH, DRAG_SNAP_IN, MIN_CABINET_WIDTH, RESIZE_SNAP_IN, SYSTEM_32_IN } from '../../domain/constants';
import { useStore, getElement } from '../../state/store';
import { listFixtures, getFrontType, listSelectionCommands } from '../../domain/plugins';
import type { ElevationShape } from '../../domain/plugins';
import { effectiveHandle } from '../../domain/geometry/handles';
import { lockedSizes } from '../../domain/layout';
import { buildWallModel, type AddZone, type ElementRect, type FrontRect } from './elevationModel';
import type { HandleType, Wall, Zone } from '../../domain/types';

/** One choice in the click-to-add popover. A disabled option stays visible with a
 *  hint (e.g. an appliance too wide for the gap) rather than vanishing. */
type PickerOption = { label: string; hint: string; run: () => void; disabled?: boolean };
/** The open creation popover: anchored at a viewport point, with band-aware options. */
type Picker = { x: number; y: number; options: PickerOption[] };

const BAND_LABEL: Record<Zone, string> = { base: 'Base', upper: 'Upper', tall: 'Tall' };
const BAND_HINT: Record<Zone, string> = {
  base: 'carcass on legs, under the counter',
  upper: 'hangs below the ceiling',
  tall: 'full-height pantry',
};

/**
 * A live drag: an element body (move), its right edge (resize), its left edge
 * (resize-left), or the shared seam between two abutting sections (resizes both).
 */
type Drag =
  | { id: string; mode: 'move'; grabDx: number }
  | { id: string; mode: 'resize' }
  | { id: string; mode: 'resize-left' }
  | { mode: 'seam'; leftId: string; rightId: string };

/** A seam between two abutting, freely-resizable sections in the same band. */
type Seam = { key: string; leftId: string; rightId: string; x: number; yTop: number; yBottom: number };

/** A live vertical drag of one shelf within an opening. `ys` are world heights of
 *  all the opening's shelves; only `index` moves. */
type ShelfDrag = { elementId: string; openingId: string; index: number; y0: number; h: number; count: number; ys: number[] };

/** World heights (up from the floor) of an opening's shelves — custom or even. */
function shelfYsFor(fr: FrontRect): number[] {
  const n = fr.opening.shelves ?? 0;
  const offs = fr.opening.shelfOffsetsIn;
  if (offs && offs.length === n) return offs.map((o) => fr.y + o);
  const ys: number[] = [];
  for (let i = 1; i <= n; i++) ys.push(fr.y + (fr.h * i) / (n + 1));
  return ys;
}

export function Elevation({ wall, xray = false, zoom = 1 }: { wall: Wall; xray?: boolean; zoom?: number }) {
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const select = useStore((s) => s.select);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const selectOpening = useStore((s) => s.selectOpening);
  const addElement = useStore((s) => s.addElement);
  const removeElement = useStore((s) => s.removeElement);
  const duplicateElement = useStore((s) => s.duplicateElement);
  const runSelectionCommand = useStore((s) => s.runSelectionCommand);
  const svgRef = useRef<SVGSVGElement>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  // Bumped on scroll/resize while a multi-selection is up, so the floating
  // command toolbar re-projects to stay glued over the selection.
  const [tick, setTick] = useState(0);
  // The bulk-command toolbar is positioned imperatively (projecting world→screen
  // needs the live SVG ref, which can't be read during render).
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Live placement preview: which add-zone the cursor is over + the snapped x/width
  // of the section that a click would drop there.
  const [ghost, setGhost] = useState<{ i: number; x: number; w: number } | null>(null);
  // Right-click context menu for a section: { screen point, element id }.
  const [ctx, setCtx] = useState<{ x: number; y: number; elementId: string } | null>(null);
  // The seam (between two abutting sections) the cursor is over, so its three
  // resize buttons (an HTML overlay) show only on hover.
  const [hoverSeam, setHoverSeam] = useState<string | null>(null);
  const seamBtnsRef = useRef<HTMLDivElement>(null);
  // The overlay sits over the seam line, so moving onto it fires a leave on the
  // SVG seam — a short close delay lets the pointer cross the gap without flicker.
  const seamCloseTimer = useRef<number | null>(null);
  function openSeam(key: string) {
    if (seamCloseTimer.current) { clearTimeout(seamCloseTimer.current); seamCloseTimer.current = null; }
    setHoverSeam(key);
  }
  function closeSeamSoon() {
    if (drag.current) return; // never auto-close mid-drag
    if (seamCloseTimer.current) clearTimeout(seamCloseTimer.current);
    seamCloseTimer.current = window.setTimeout(() => { if (!drag.current) setHoverSeam(null); }, 100);
  }
  // Remembered width for a section about to be placed — the scroll wheel / [ ]
  // keys nudge it while the add-zone preview ghost is up. null = the default.
  const [addWidth, setAddWidth] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const shelfDrag = useRef<ShelfDrag | null>(null);

  /** Open the section context menu at the cursor (and select the section). */
  function onElementContext(e: React.MouseEvent, elementId: string) {
    e.preventDefault();
    e.stopPropagation();
    select(elementId);
    setCtx({ x: e.clientX, y: e.clientY, elementId });
  }
  /** A modifier (Ctrl/Cmd/Shift) extends the multi-selection; a plain click replaces it. */
  const isMultiPick = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => e.metaKey || e.ctrlKey || e.shiftKey;
  /** Select a section, or toggle it in/out of the selection when a modifier is held. */
  function pick(e: React.MouseEvent, elementId: string) {
    e.stopPropagation();
    if (isMultiPick(e)) toggleSelect(elementId);
    else select(elementId);
  }
  function deleteSection(id: string) {
    removeElement(id);
    select(undefined);
  }

  // Memoized so unrelated store updates (selection, hover, view state) don't
  // re-run the layout pass — only actual project/wall edits do.
  const model = useMemo(() => buildWallModel(project, wall), [project, wall]);
  const ceiling = model.ceilingHeight;
  const length = model.length;
  const SY = (wy: number) => ceiling - wy;
  const { doorHandle, drawerHandle } = project.defaults;

  // The current selection (set of element ids). A single pick mirrors into the
  // set, so this is the one source of truth for highlighting + the bulk toolbar.
  const selectedIds = ui.selectedElementIds?.length ? ui.selectedElementIds : ui.selectedElementId ? [ui.selectedElementId] : [];
  const selectedSet = new Set(selectedIds);

  // Seams between two abutting, freely-resizable sections in the same band.
  // Hovering one reveals three grips: resize the left section, move the shared
  // seam (resize both), or resize the right section. Locked-size appliances (and
  // gaps) are skipped — there's nothing to slide there.
  const seams = collectSeams(model.elements);

  // Live mirror for the wheel/keyboard handlers (which run from listeners bound
  // once) — synced after each render so they read the current values without
  // re-binding the listeners.
  const live = useRef<{ addZones: AddZone[]; ghostI: number | null; addWidth: number | null }>({ addZones: [], ghostI: null, addWidth: null });
  useEffect(() => {
    live.current.addZones = model.addZones;
    live.current.ghostI = ghost?.i ?? null;
    live.current.addWidth = addWidth;
  });

  // Floating bulk-command toolbar: when ≥2 sections are selected, offer the
  // registered selection commands (Axis 6) that apply, anchored over the top
  // centre of the selection's combined footprint. New plugins surface here with
  // no edits — exactly like the other registry-driven dropdowns.
  const selRects = model.elements.filter((er) => selectedSet.has(er.element.id));
  const selEls = selRects.map((er) => er.element).sort((a, b) => a.xIn - b.xIn);
  const selCmds =
    selEls.length >= 2
      ? listSelectionCommands().filter(
          (c) => selEls.length >= (c.minElements ?? 2) && (!c.enabledFor || c.enabledFor({ elements: selEls, wall, project, defaults: project.defaults })),
        )
      : [];
  // Anchor (world coords) for the toolbar: top centre of the selection's footprint.
  const showToolbar = selCmds.length > 0 && selRects.length > 0;
  const anchorWX = showToolbar ? (Math.min(...selRects.map((er) => er.x)) + Math.max(...selRects.map((er) => er.x + er.width))) / 2 : 0;
  const anchorTop = showToolbar ? Math.max(...selRects.map(elTop)) : 0;

  function clientToWorldX(clientX: number, clientY: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()).x : 0;
  }
  /** Where a default-width section lands for a given cursor: centred on the
   *  cursor, snapped to 1", clamped so it fits the zone's free span. */
  function placeX(z: AddZone, defW: number, clientX: number, clientY: number): number {
    const wx = clientToWorldX(clientX, clientY);
    const x = Math.round(wx - defW / 2);
    return Math.max(z.x, Math.min(x, z.x + z.w - defW));
  }
  /** World (x along wall, y up from floor) → screen client px, for anchoring HTML overlays. */
  function worldToClient(wx: number, wy: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = wx; pt.y = SY(wy);
    const p = pt.matrixTransform(ctm);
    return { x: p.x, y: p.y };
  }
  /** Screen Y → world height (inches up from the floor). */
  function clientToWorldY(clientX: number, clientY: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    return ceiling - (ctm ? pt.matrixTransform(ctm.inverse()).y : 0);
  }

  /** Begin dragging one shelf within a front (vertical only). */
  function onShelfDown(e: React.PointerEvent, fr: FrontRect, index: number, ys: number[]) {
    e.stopPropagation();
    shelfDrag.current = { elementId: fr.elementId, openingId: fr.opening.id, index, y0: fr.y, h: fr.h, count: fr.opening.shelves ?? 0, ys: [...ys] };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  /** Render an opening's shelves as draggable lines (a wide invisible grab line per shelf). */
  function shelves(fr: FrontRect) {
    if ((fr.opening.shelves ?? 0) <= 0) return null;
    const ys = shelfYsFor(fr);
    return (
      <g>
        {ys.map((wy, i) => (
          <g key={i}>
            <line x1={fr.x + 0.4} y1={SY(wy)} x2={fr.x + fr.w - 0.4} y2={SY(wy)} className="shelf" />
            <line x1={fr.x + 0.4} y1={SY(wy)} x2={fr.x + fr.w - 0.4} y2={SY(wy)} className="shelf-hit"
              onPointerDown={(e) => onShelfDown(e, fr, i, ys)} />
          </g>
        ))}
      </g>
    );
  }

  /**
   * Open the creation popover for a clicked empty band. The band itself is fixed
   * by where you clicked (zone is chosen at creation, never edited after), so the
   * menu offers that band's cabinet + appliances, plus a full-height Tall section
   * when the whole column under the click is also clear.
   */
  function openPicker(e: React.MouseEvent, z: AddZone) {
    e.stopPropagation();
    // A created cabinet fills the WHOLE gap (left edge → next neighbour), not just
    // from the cursor — so a click never leaves a sliver. An appliance keeps its
    // stock width at the gap's left edge.
    const bandAvail = z.w;
    const tall = model.tallZones.find((g) => z.x >= g.x - 1e-6 && z.x < g.x + g.w - 1e-6);

    const options: PickerOption[] = [];
    const add = (zone: Zone, label: string, hint: string, opts: NonNullable<Parameters<typeof addElement>[1]>) =>
      options.push({ label, hint, run: () => addElement(zone, opts) });
    // An appliance that doesn't fit the gap stays in the list but disabled, with a
    // hint explaining the shortfall (rather than silently disappearing).
    const addFixtures = (zone: Zone, avail: number, x: number) => {
      for (const f of listFixtures().filter((d) => d.zone === zone && !d.integratable && d.selectable !== false)) {
        const fits = f.defaultWidthIn <= avail + 1e-6;
        if (fits) add(zone, f.label, 'appliance', { xIn: x, kind: 'appliance', fixtureId: f.id });
        else options.push({ label: f.label, hint: `needs ${dim(f.defaultWidthIn)}" · only ${dim(avail)}" free`, run: () => {}, disabled: true });
      }
    };

    // New sections take the remembered scroll/keyboard width (clamped to the free
    // space) and land where the cursor points (the same snapped x as the hover
    // ghost) — not spanning the whole band.
    const defW = ghostWidthFor(z, addWidth);
    const px = placeX(z, defW, e.clientX, e.clientY);
    add(z.zone, `${BAND_LABEL[z.zone]} cabinet`, BAND_HINT[z.zone], { xIn: px, widthIn: defW, kind: 'cabinet' });
    if (z.zone === 'base') add('base', 'Workbench', 'counter on legs, no carcass', { xIn: px, widthIn: defW, kind: 'workbench' });
    addFixtures(z.zone, bandAvail, z.x);

    // A tall column needs the base AND upper bands clear here (see model.tallZones).
    if (tall && tall.w >= MIN_CABINET_WIDTH) {
      const tw = Math.min(tall.w, CABINET_TARGET_WIDTH);
      add('tall', 'Tall cabinet', BAND_HINT.tall, { xIn: placeX(tall, tw, e.clientX, e.clientY), widthIn: tw, kind: 'cabinet' });
      addFixtures('tall', tall.w, tall.x);
    }

    setPicker({ x: e.clientX, y: e.clientY, options });
  }

  /** Begin dragging an element — body grab moves it, an edge grab resizes it from that side. */
  function onElementDown(e: React.PointerEvent, er: ElementRect, mode: 'move' | 'resize' | 'resize-left') {
    e.stopPropagation();
    const worldX = clientToWorldX(e.clientX, e.clientY);
    drag.current = mode === 'move' ? { id: er.element.id, mode, grabDx: worldX - er.x } : { id: er.element.id, mode };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  /**
   * Begin a seam drag. Pointer capture goes on the SVG root (not the grip), so the
   * drag survives the grips/seam unmounting the instant a gap opens up under the
   * one-sided grips. `seam` moves both edges; `left`/`right` resize one section.
   */
  function onSeamDown(e: React.PointerEvent, kind: 'left' | 'seam' | 'right', s: Seam) {
    e.stopPropagation();
    drag.current =
      kind === 'left' ? { id: s.leftId, mode: 'resize' }
      : kind === 'right' ? { id: s.rightId, mode: 'resize-left' }
      : { mode: 'seam', leftId: s.leftId, rightId: s.rightId };
    openSeam(s.key);
    svgRef.current?.setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    // A shelf drag (vertical) takes precedence — reposition just that shelf,
    // clamped between its neighbours (or the opening's ends) with a small gap.
    if (shelfDrag.current) {
      const sd = shelfDrag.current;
      const GAP = 1;
      const lo = (sd.index > 0 ? sd.ys[sd.index - 1] : sd.y0) + GAP;
      const hi = (sd.index < sd.count - 1 ? sd.ys[sd.index + 1] : sd.y0 + sd.h) - GAP;
      // Snap to the System-32 boring pitch (32 mm steps) measured up from the
      // carcass bottom, so adjustable shelves land on real shelf-pin holes.
      const raw = clientToWorldY(e.clientX, e.clientY);
      const snapped = sd.y0 + Math.round((raw - sd.y0) / SYSTEM_32_IN) * SYSTEM_32_IN;
      sd.ys[sd.index] = Math.min(Math.max(snapped, lo), Math.max(lo, hi));
      useStore.getState().setShelfOffsets(sd.elementId, sd.openingId, sd.ys.map((y) => Math.round((y - sd.y0) * 16) / 16));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const worldX = clientToWorldX(e.clientX, e.clientY);
    const snap = (v: number, step: number) => Math.round(v / step) * step;
    const st = useStore.getState();
    // Resizes snap to whole inches (cabinet widths are sized in inches); a body move is finer.
    if (d.mode === 'move') {
      st.moveElement(d.id, snap(worldX - d.grabDx, DRAG_SNAP_IN));
    } else if (d.mode === 'resize') {
      const el = model.elements.find((r) => r.element.id === d.id);
      if (el) st.resizeElement(d.id, snap(worldX - el.x, RESIZE_SNAP_IN));
    } else if (d.mode === 'resize-left') {
      st.resizeElementLeft(d.id, snap(worldX, RESIZE_SNAP_IN));
    } else {
      st.moveSeam(d.leftId, d.rightId, snap(worldX, RESIZE_SNAP_IN));
    }
  }
  function onUp(e: React.PointerEvent) {
    if (drag.current || shelfDrag.current) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (svgRef.current?.hasPointerCapture?.(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    shelfDrag.current = null;
    setHoverSeam(null);
  }
  /** Grow/shrink the to-be-placed section's width by one inch, re-snapping the
   *  preview ghost. `client` (from the wheel) re-centres on the cursor. */
  function nudgeAddWidth(z: AddZone, dir: 1 | -1, client?: { x: number; y: number }) {
    const next = Math.max(MIN_CABINET_WIDTH, Math.min(z.w, ghostWidthFor(z, live.current.addWidth) + dir * RESIZE_SNAP_IN));
    setAddWidth(next);
    setGhost((g) => {
      const i = live.current.ghostI;
      if (i == null) return g;
      const x = client ? placeX(z, next, client.x, client.y) : Math.max(z.x, Math.min(g?.x ?? z.x, z.x + z.w - next));
      return { i, x, w: next };
    });
  }

  // Keyboard editing for the selected section: Delete removes it (with an Undo
  // toast), arrows nudge it (Shift = coarser), Escape deselects. Ignored while a
  // form field has focus so typing dimensions isn't hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      // While the add-zone preview is up, [ and ] nudge the new section's width.
      if (live.current.ghostI != null && (e.key === '[' || e.key === ']')) {
        const z = live.current.addZones[live.current.ghostI];
        if (z) { e.preventDefault(); nudgeAddWidth(z, e.key === ']' ? 1 : -1); }
        return;
      }
      const st = useStore.getState();
      const ids = st.ui.selectedElementIds?.length ? st.ui.selectedElementIds : st.ui.selectedElementId ? [st.ui.selectedElementId] : [];
      if (ids.length === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        ids.forEach((id) => st.removeElement(id));
        st.select(undefined);
      } else if (e.key === 'Escape') {
        st.select(undefined);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = (e.shiftKey ? DRAG_SNAP_IN * 4 : DRAG_SNAP_IN) * (e.key === 'ArrowLeft' ? -1 : 1);
        // Nudge the whole selection together (each element clamps to its own neighbours).
        ids.forEach((id) => { const sec = getElement(st.project, id); if (sec) st.moveElement(id, sec.xIn + step); });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // nudgeAddWidth reads only refs + stable setters; bind once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll wheel over the add-zone preview resizes the section to be placed. A
  // native, non-passive listener (React's onWheel is passive, so it can't
  // preventDefault) so the page doesn't scroll while sizing.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const i = live.current.ghostI;
      if (i == null) return;
      const z = live.current.addZones[i];
      if (!z) return;
      e.preventDefault();
      nudgeAddWidth(z, e.deltaY < 0 ? 1 : -1, { x: e.clientX, y: e.clientY });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // Reads only refs + stable setters; bind once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-project the floating selection toolbar when the page scrolls or resizes
  // (the elevation itself re-renders on every store change, so that path is covered).
  const multiCount = (ui.selectedElementIds ?? (ui.selectedElementId ? [ui.selectedElementId] : [])).length;
  useEffect(() => {
    if (multiCount < 2) return;
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('scroll', bump, true);
    window.addEventListener('resize', bump);
    return () => { window.removeEventListener('scroll', bump, true); window.removeEventListener('resize', bump); };
  }, [multiCount]);

  // Project the toolbar anchor (world inches) to screen px after layout, then
  // place the toolbar imperatively (DOM write, not state). Runs before paint so
  // there's no flicker, and re-runs on selection/geometry/zoom changes + the tick.
  useLayoutEffect(() => {
    const tb = toolbarRef.current;
    if (!tb || !showToolbar) return;
    const pos = worldToClient(anchorWX, anchorTop);
    if (pos) { tb.style.left = `${pos.x}px`; tb.style.top = `${pos.y}px`; }
    // worldToClient reads the SVG ref; the geometry inputs below are what actually drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToolbar, anchorWX, anchorTop, zoom, length, ceiling, tick]);

  // Place the seam-button overlay (HTML, so it never scales with the SVG) over
  // the centre of the hovered seam, projected world→screen after layout.
  const hoveredSeam = seams.find((s) => s.key === hoverSeam) ?? null;
  useLayoutEffect(() => {
    const el = seamBtnsRef.current;
    if (!el || !hoveredSeam) return;
    const pos = worldToClient(hoveredSeam.x, hoveredSeam.yBottom + (hoveredSeam.yTop - hoveredSeam.yBottom) / 2);
    if (pos) { el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredSeam, zoom, length, ceiling, tick]);

  return (
    <>
    <svg
      ref={svgRef}
      className="elevation"
      // Extra headroom up top so upper-cabinet width labels sit above the ceiling
      // (base/tall labels go below the floor) — the two rows never collide.
      viewBox={`-20 -11 ${length + 32} ${ceiling + 39}`}
      // Zoom by widening the SVG past its wrap (which scrolls). At fit (1) keep
      // the CSS-driven layout so nothing regresses for the common case.
      style={zoom !== 1 ? { width: `${zoom * 100}%`, maxWidth: 'none', maxHeight: 'none', flex: 'none' } : undefined}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onClick={() => select(undefined)}
    >
      <rect x={0} y={SY(ceiling)} width={length} height={ceiling} className="room-bg" style={wall.color ? { fill: wall.color } : undefined} />
      <line x1={0} y1={SY(0)} x2={length} y2={SY(0)} className="floor-line" />
      <line x1={0} y1={SY(ceiling)} x2={length} y2={SY(ceiling)} className="ceiling-line" />

      {/* Clickable "add here" gaps in the base + upper bands — a click opens the
          creation picker (cabinet / appliance, plus tall when the column is free). */}
      {model.addZones.map((z, i) => (
        <g key={`az${i}`} className="add-zone-g" onClick={(e) => openPicker(e, z)}
          onPointerMove={(e) => { const defW = ghostWidthFor(z, addWidth); setGhost({ i, x: placeX(z, defW, e.clientX, e.clientY), w: defW }); }}
          onPointerLeave={() => setGhost((g) => (g?.i === i ? null : g))}>
          <rect x={z.x} y={SY(z.y + z.h)} width={z.w} height={z.h} className={z.zone === 'upper' ? 'add-upper' : 'add-zone'} />
          {ghost?.i === i ? (
            <>
              {/* Live preview: the default-width section follows the cursor, showing where a click lands. */}
              <rect className="add-ghost" x={ghost.x} y={SY(z.y + z.h)} width={ghost.w} height={z.h} />
              {/* Centred caption: the current width + how to change it. */}
              {ghost.w > 9 && (
                <text className="add-ghost-cap" textAnchor="middle" pointerEvents="none">
                  <tspan x={ghost.x + ghost.w / 2} y={SY(z.y + z.h / 2) - 0.4}>{toFraction(ghost.w)}</tspan>
                  <tspan className="add-ghost-hint" x={ghost.x + ghost.w / 2} y={SY(z.y + z.h / 2) + 2.4}>scroll / [ ] to resize</tspan>
                </text>
              )}
            </>
          ) : (
            z.w > 8 && (
              <text x={z.x + z.w / 2} y={SY(z.y + z.h / 2)} className={z.zone === 'upper' ? 'add-upper-label' : 'add-zone-label'} textAnchor="middle">
                + {addLabel(z.zone)}
              </text>
            )
          )}
        </g>
      ))}

      {/* Merged toekick runs: one continuous strip per run of abutting cabinets
          (the small end inset suggests the recess; no seams inside a run). */}
      {model.toekicks.map((tk, i) => (
        <rect key={`tk${i}`} x={tk.x + 0.75} y={SY(tk.y + tk.h)} width={tk.w - 1.5} height={tk.h} className="toekick" />
      ))}

      {model.elements.map((er) => {
        const selected = selectedSet.has(er.element.id);
        return (
          <g key={er.element.id}>
            {er.counter && <rect x={er.counter.x} y={SY(er.counter.y + er.counter.h)} width={er.counter.w} height={er.counter.h} className="counter" />}
            {er.legs?.map((leg, i) => <rect key={`l${i}`} x={leg.x} y={SY(leg.y + leg.h)} width={leg.w} height={leg.h} className="wb-leg" />)}
            {er.workbenchEnds?.map((p, i) => <rect key={`we${i}`} x={p.x} y={SY(p.y + p.h)} width={p.w} height={p.h} className="wb-leg" />)}
            {er.stretchers && <rect x={er.stretchers.x} y={SY(er.stretchers.y + er.stretchers.h)} width={er.stretchers.w} height={er.stretchers.h} className="wb-stretcher" />}
            {er.workbenchDrawers?.map((dr, i) => (
              <g key={`wbd${i}`}>
                <rect x={dr.x} y={SY(dr.y + dr.h)} width={dr.w} height={dr.h} className="front drawer" />
                <line x1={dr.x + dr.w * 0.3} y1={SY(dr.y + dr.h * 0.62)} x2={dr.x + dr.w * 0.7} y2={SY(dr.y + dr.h * 0.62)} className="hw-bar" />
              </g>
            ))}

            {/* A workbench has only a thin counter + legs (no carcass/ghost), so add
                an invisible hit rect over its footprint to make it selectable/draggable. */}
            {er.element.workbench && er.counter && (
              <rect x={er.x} y={SY(er.counter.y + er.counter.h)} width={er.width} height={er.counter.y + er.counter.h}
                className={`wb-hit${selected ? ' selected' : ''}`} pointerEvents="all"
                onPointerDown={(e) => onElementDown(e, er, 'move')}
                onClick={(e) => pick(e, er.element.id)}
                onContextMenu={(e) => onElementContext(e, er.element.id)} />
            )}

            {/* An appliance or empty element draws a labelled ghost (it has no
                carcass). An appliance reads as a solid unit so the fridge/oven/etc.
                are clearly visible, not an empty dashed gap. */}
            {er.ghost && (
              <g onPointerDown={(e) => onElementDown(e, er, 'move')}
                onClick={(e) => pick(e, er.element.id)}
                onContextMenu={(e) => onElementContext(e, er.element.id)}>
                <rect x={er.ghost.x} y={SY(er.ghost.y + er.ghost.h)} width={er.ghost.w} height={er.ghost.h}
                  className={`ghost${er.ghostAppliance ? ' appliance' : ''}${er.ghostShapes?.length ? ' shaped' : ''}${selected ? ' selected' : ''}${er.overflow ? ' overflow' : ''}`} />
                {/* A fixture's own schematic (oven window, fridge doors, washer
                    porthole, …); falls back to a single door-seam line. */}
                {er.ghostShapes?.length
                  ? applianceShapes(er.ghostShapes, SY)
                  : er.ghostAppliance && er.ghost.w > 6 && (
                      <line x1={er.ghost.x + er.ghost.w / 2} y1={SY(er.ghost.y + er.ghost.h) + 1} x2={er.ghost.x + er.ghost.w / 2} y2={SY(er.ghost.y) - 1} className="appliance-seam" />
                    )}
                {/* No caption on appliances — the schematic speaks for itself. */}
                {!er.ghostAppliance && (
                  <text x={er.ghost.x + er.ghost.w / 2} y={SY(er.ghost.y + er.ghost.h / 2)}
                    className="ghost-label" textAnchor="middle">{er.ghostLabel ?? 'open'}</text>
                )}
              </g>
            )}

            {/* A cabinet element: carcass + its fronts (the body drags/moves it). */}
            {er.cab && (
              <g onContextMenu={(e) => onElementContext(e, er.element.id)}>
                <rect x={er.cab.x} y={SY(er.cab.y + er.cab.h)} width={er.cab.w} height={er.cab.h}
                  className={`carcass${selected ? ' selected' : ''}${er.overflow ? ' overflow' : ''}`}
                  onPointerDown={(e) => onElementDown(e, er, 'move')}
                  onClick={(e) => pick(e, er.element.id)} />
                {er.cab.fronts.map((fr) => {
                  const selOp = selected && fr.opening.id === ui.selectedOpeningId;
                  // Colour by the front type's open bucket, not its raw id — a plugin
                  // front (gridfinity, false front) has no `.front.<id>` rule, so the
                  // raw id would leave the SVG fill at its black default.
                  const opens = getFrontType(fr.opening.type)?.opens;
                  const faceClass = opens === 'door' ? 'door' : opens === 'drawer' ? 'drawer' : fr.opening.type === 'fixed' ? 'fixed' : 'drawer';
                  const covered = faceClass === 'door' || faceClass === 'fixed';
                  const handle = effectiveHandle(fr.opening, faceClass === 'door' ? doorHandle : drawerHandle);
                  return (
                    <g key={fr.opening.id}
                      onPointerDown={(e) => onElementDown(e, er, 'move')}
                      onClick={(e) => { if (isMultiPick(e)) { pick(e, er.element.id); return; } e.stopPropagation(); select(er.element.id); selectOpening(fr.opening.id); }}>
                      <rect x={fr.x} y={SY(fr.y + fr.h)} width={fr.w} height={fr.h} className={`front ${faceClass}${selOp ? ' selected' : ''}${xray && covered ? ' xray' : ''}`} />
                      {fr.opening.type === 'door' && fr.doorCount === 2 && (
                        <line x1={fr.x + fr.w / 2} y1={SY(fr.y + fr.h)} x2={fr.x + fr.w / 2} y2={SY(fr.y)} className="door-gap" />
                      )}
                      {/* A fixed panel is open shelving — it's transparent, so always
                          draw its shelves. X-ray reveals shelves behind doors too;
                          otherwise a door/drawer draws its real pull glyph. */}
                      {faceClass === 'fixed'
                        ? shelves(fr)
                        : xray
                          ? (covered ? shelves(fr) : null)
                          : handleGlyph(fr, handle, SY)}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Edge resize handles, spanning the element's own height — one on
                each side, so a section can be widened/narrowed from the left or
                the right. A workbench has no carcass/ghost — use its counter top
                + legs (its hit target is full-height, which would run the handle
                to the ceiling). */}
            {(() => {
              const wbTop = er.counter ? er.counter.y + er.counter.h
                : er.legs?.length ? er.legs[0].y + er.legs[0].h
                : er.hit.y + er.hit.h;
              const yTop = er.cab ? er.cab.y + er.cab.h : er.ghost ? er.ghost.y + er.ghost.h : wbTop;
              const yBot = er.cab ? er.cab.y : er.ghost ? er.ghost.y : 0;
              return (
                <g>
                  <line x1={er.x} y1={SY(yTop)} x2={er.x} y2={SY(yBot)} className="divider-hit"
                    onPointerDown={(e) => onElementDown(e, er, 'resize-left')} />
                  <line x1={er.x} y1={SY(yTop)} x2={er.x} y2={SY(yBot)} className="divider" />
                  <line x1={er.x + er.width} y1={SY(yTop)} x2={er.x + er.width} y2={SY(yBot)} className="divider-hit"
                    onPointerDown={(e) => onElementDown(e, er, 'resize')} />
                  <line x1={er.x + er.width} y1={SY(yTop)} x2={er.x + er.width} y2={SY(yBot)} className="divider" />
                </g>
              );
            })()}

            {/* over-length highlight */}
            {er.overflow && (
              <rect x={er.x} y={SY(ceiling)} width={er.width} height={ceiling} className="overflow-flag"
                onClick={(e) => pick(e, er.element.id)}
                onContextMenu={(e) => onElementContext(e, er.element.id)} />
            )}

            {/* Width caption: upper sections read above the ceiling, base/tall below
                the floor, so a base + upper at the same x never overlap. */}
            <text x={er.x + er.width / 2} y={er.element.zone === 'upper' ? SY(ceiling) - 4 : SY(0) + 4}
              className={`dim-label${er.overflow ? ' overflow' : ''}`} textAnchor="middle">{toFraction(er.width)}</text>
          </g>
        );
      })}

      {/* Seam controls between two abutting sections. The whole seam is a grab
          (drag = move both edges); hovering reveals three grips: resize the left
          section, move the seam, or resize the right section. Rendered last so
          they sit above the element bodies + their plain dividers. */}
      {seams.map((s) => (
        <g key={s.key} className="seam-g" onClick={(e) => e.stopPropagation()}
          onPointerEnter={() => { if (!drag.current) openSeam(s.key); }}
          onPointerLeave={closeSeamSoon}>
          <line x1={s.x} y1={SY(s.yTop)} x2={s.x} y2={SY(s.yBottom)} className="seam-hit"
            onPointerDown={(e) => onSeamDown(e, 'seam', s)} />
          <line x1={s.x} y1={SY(s.yTop)} x2={s.x} y2={SY(s.yBottom)} className={`seam-line${hoverSeam === s.key ? ' active' : ''}`} />
        </g>
      ))}

      {/* wall-end marker when an element overruns the wall length */}
      {model.elements.some((er) => er.overflow) && (
        <line x1={length} y1={SY(ceiling)} x2={length} y2={SY(0)} className="wall-end" />
      )}

      {/* overall wall dimensions: length along the bottom (x), height up the left (y).
          Read-only captions — wall length + ceiling are edited in the Inspector. */}
      <g className="wall-dims" pointerEvents="none">
        <line x1={0} y1={SY(0) + 14} x2={length} y2={SY(0) + 14} className="dim-axis" />
        <line x1={0} y1={SY(0) + 11.5} x2={0} y2={SY(0) + 16.5} className="dim-axis" />
        <line x1={length} y1={SY(0) + 11.5} x2={length} y2={SY(0) + 16.5} className="dim-axis" />
        <text x={length / 2} y={SY(0) + 21} className="dim-axis-label" textAnchor="middle">{toFraction(length)}</text>

        <line x1={-10} y1={SY(0)} x2={-10} y2={SY(ceiling)} className="dim-axis" />
        <line x1={-12.5} y1={SY(0)} x2={-7.5} y2={SY(0)} className="dim-axis" />
        <line x1={-12.5} y1={SY(ceiling)} x2={-7.5} y2={SY(ceiling)} className="dim-axis" />
        <text x={-13} y={SY(ceiling / 2)} className="dim-axis-label" textAnchor="middle"
          transform={`rotate(-90, -13, ${SY(ceiling / 2)})`}>{toFraction(ceiling)}</text>
      </g>
    </svg>

    {/* Plain-language overflow warning — the red strokes alone are easy to miss. */}
    {model.elements.some((er) => er.overflow) && (
      <div className="elevation-overflow-note" role="alert">
        ⚠ A section is wider than the wall. Shrink it, or increase the wall length.
      </div>
    )}

    {/* Seam controls — an HTML overlay (so they keep a fixed pixel size) of three
        small gray buttons over the hovered seam: resize left ‹ / move both ↔ /
        resize right ›. Positioned imperatively by the layout effect above. */}
    {hoveredSeam && (
      <div ref={seamBtnsRef} className="seam-overlay"
        onPointerEnter={() => openSeam(hoveredSeam.key)} onPointerLeave={closeSeamSoon}>
        <ActionIcon.Group>
          <ActionIcon variant="default" color="gray" size="sm" aria-label="Resize left section" title="Resize left section"
            onPointerDown={(e) => onSeamDown(e, 'left', hoveredSeam)}>
            <IconChevronLeft size={14} />
          </ActionIcon>
          <ActionIcon variant="default" color="gray" size="sm" aria-label="Move seam (resize both)" title="Move seam (resize both)"
            onPointerDown={(e) => onSeamDown(e, 'seam', hoveredSeam)}>
            <IconArrowsHorizontal size={14} />
          </ActionIcon>
          <ActionIcon variant="default" color="gray" size="sm" aria-label="Resize right section" title="Resize right section"
            onPointerDown={(e) => onSeamDown(e, 'right', hoveredSeam)}>
            <IconChevronRight size={14} />
          </ActionIcon>
        </ActionIcon.Group>
      </div>
    )}

    {/* Floating bulk-command toolbar for the current multi-selection (positioned
        imperatively by the layout effect above). */}
    {showToolbar && (
      <div ref={toolbarRef} className="sel-toolbar" role="toolbar" aria-label="Selection actions">
        <span className="sel-toolbar-count">{selRects.length} selected</span>
        {selCmds.map((c) => (
          <button key={c.id} type="button" className="sel-toolbar-btn" title={c.description}
            onClick={(e) => { e.stopPropagation(); runSelectionCommand(c.id); select(undefined); }}>{c.label}</button>
        ))}
      </div>
    )}

    {/* Creation picker, anchored at the click. A zero-size fixed target lets the
        Mantine menu float at an arbitrary point; clicking away closes it. */}
    {picker && (
      <Menu opened position="bottom-start" shadow="md" width={230} withinPortal onChange={(o) => { if (!o) setPicker(null); }}>
        <Menu.Target>
          <div style={{ position: 'fixed', left: picker.x, top: picker.y, width: 0, height: 0 }} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Add a section here</Menu.Label>
          {picker.options.map((o, i) => (
            <Menu.Item key={i} disabled={o.disabled} closeMenuOnClick={!o.disabled}
              onClick={() => { if (o.disabled) return; o.run(); setPicker(null); }}>
              <Text size="sm" fw={600}>{o.label}</Text>
              <Text size="xs" c="dimmed">{o.hint}</Text>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    )}

    {/* Right-click section menu (delete / duplicate), anchored at the cursor. */}
    {ctx && (
      <Menu opened position="bottom-start" shadow="md" width={180} withinPortal onChange={(o) => { if (!o) setCtx(null); }}>
        <Menu.Target>
          <div style={{ position: 'fixed', left: ctx.x, top: ctx.y, width: 0, height: 0 }} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Section</Menu.Label>
          <Menu.Item onClick={() => { duplicateElement(ctx.elementId); setCtx(null); }}>Duplicate</Menu.Item>
          <Menu.Item color="red" onClick={() => { deleteSection(ctx.elementId); setCtx(null); }}>Delete</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    )}
    </>
  );
}

/**
 * Render a fixture's elevation schematic. Shapes arrive in world inches (y up
 * from the floor); `SY` flips y into SVG space. They're decorative, so clicks
 * fall through to the appliance group behind them (selection/drag stay reliable).
 */
function applianceShapes(shapes: ElevationShape[], SY: (n: number) => number) {
  return (
    <g pointerEvents="none">
      {shapes.map((s, i) => {
        if (s.kind === 'rect')
          return <rect key={i} x={s.x} y={SY(s.y + s.h)} width={s.w} height={s.h} rx={s.rx} className={s.className} />;
        if (s.kind === 'line')
          return <line key={i} x1={s.x1} y1={SY(s.y1)} x2={s.x2} y2={SY(s.y2)} className={s.className} />;
        if (s.kind === 'polygon')
          return <polygon key={i} points={s.points.map(([px, py]) => `${px},${SY(py)}`).join(' ')} className={s.className} />;
        return <circle key={i} cx={s.cx} cy={SY(s.cy)} r={s.r} className={s.className} />;
      })}
    </g>
  );
}

/** World height (up from the floor) of an element's top, across its kinds — used
 *  to anchor the selection toolbar just above the tallest selected section. */
function elTop(er: ElementRect): number {
  if (er.cab) return er.cab.y + er.cab.h;
  if (er.ghost) return er.ghost.y + er.ghost.h;
  if (er.counter) return er.counter.y + er.counter.h;
  if (er.legs?.length) return er.legs[0].y + er.legs[0].h;
  return er.hit.y + er.hit.h;
}

/** World height of an element's bottom (carcass/ghost foot, else the floor). */
function elBottom(er: ElementRect): number {
  if (er.cab) return er.cab.y;
  if (er.ghost) return er.ghost.y;
  return 0;
}

/** Width of the placement preview / new section: the remembered scroll width,
 *  clamped to the band's free span and the cabinet floor. */
function ghostWidthFor(z: AddZone, addWidth: number | null): number {
  return Math.max(MIN_CABINET_WIDTH, Math.min(z.w, addWidth ?? CABINET_TARGET_WIDTH));
}

/**
 * Find the seams: pairs of consecutive, abutting, freely-resizable sections in
 * the same band (locked-size appliances are excluded — they can't slide). The
 * seam sits at the shared edge and spans the vertical overlap of the two.
 */
function collectSeams(elements: ElementRect[]): Seam[] {
  const TOL = RESIZE_SNAP_IN / 16; // abutting within the snap grid (~1/16")
  const byZone = new Map<Zone, ElementRect[]>();
  for (const er of elements) {
    if (lockedSizes(er.element)) continue;
    const arr = byZone.get(er.element.zone);
    if (arr) arr.push(er);
    else byZone.set(er.element.zone, [er]);
  }
  const seams: Seam[] = [];
  for (const arr of byZone.values()) {
    arr.sort((a, b) => a.x - b.x);
    for (let i = 0; i < arr.length - 1; i++) {
      const L = arr[i];
      const R = arr[i + 1];
      if (Math.abs(L.x + L.width - R.x) > TOL) continue; // a real gap, not a seam
      const yTop = Math.min(elTop(L), elTop(R));
      const yBottom = Math.max(elBottom(L), elBottom(R));
      if (yTop - yBottom < 14) continue; // too short to host the three grips without overlap
      seams.push({ key: `${L.element.id}|${R.element.id}`, leftId: L.element.id, rightId: R.element.id, x: R.x, yTop, yBottom });
    }
  }
  return seams;
}


/** Strip the trailing inch mark for compact in-drawing labels. */
const dim = (v: number) => toFraction(v).replace('"', '').trim();

/** Caption shown in an add-zone ("base" / "upper"). */
const addLabel = (zone: Zone) => (zone === 'upper' ? 'upper' : 'base');


/**
 * The pull/handle glyph for a front, matching its effective handle style:
 *  - drawer  → horizontal bar pull near the top (or a routed finger notch on top edge)
 *  - door    → vertical bar on the latch side (a pair flanks the centre gap); an
 *              edge pull runs along the bottom; a push-latch shows a faint dot.
 * Returns null for fixed panels / unset handles.
 */
function handleGlyph(fr: FrontRect, handle: HandleType | undefined, SY: (n: number) => number) {
  if (!handle) return null;
  const cx = fr.x + fr.w / 2;
  const top = fr.y + fr.h;

  if (fr.opening.type === 'drawer') {
    if (handle === 'routerCutout') {
      const half = Math.min(fr.w * 0.3, 5);
      return <line x1={cx - half} y1={SY(top) + 0.15} x2={cx + half} y2={SY(top) + 0.15} className="hw-cutout" />;
    }
    const half = Math.min(Math.max(fr.w * 0.25, 2), 6);
    const y = SY(top - Math.min(1.2, fr.h * 0.3));
    return <line x1={cx - half} y1={y} x2={cx + half} y2={y} className="hw-bar" />;
  }

  if (fr.opening.type === 'door') {
    if (handle === 'pushLatch') return <circle cx={cx} cy={SY(fr.y + fr.h * 0.5)} r={0.6} className="hw-latch" />;
    if (handle === 'edgePull') {
      const half = Math.min(fr.w * 0.35, 8);
      const y = SY(fr.y) - 0.3;
      return <line x1={cx - half} y1={y} x2={cx + half} y2={y} className="hw-bar" />;
    }
    // bar pull
    const barH = Math.min(Math.max(fr.h * 0.4, 4), 9);
    const yc = fr.y + fr.h / 2;
    const bar = (x: number) => <line x1={x} y1={SY(yc + barH / 2)} x2={x} y2={SY(yc - barH / 2)} className="hw-bar" />;
    if (fr.doorCount === 2) return <>{bar(cx - 1.2)}{bar(cx + 1.2)}</>;
    const hingeLeft = (fr.opening.hingeSide ?? 'left') === 'left';
    return bar(hingeLeft ? fr.x + fr.w - 1.3 : fr.x + 1.3);
  }
  return null;
}
