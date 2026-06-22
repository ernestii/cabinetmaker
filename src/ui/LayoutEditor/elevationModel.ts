import { MIN_CABINET_WIDTH, REVEAL, STRETCHER_WIDTH, WORKBENCH_DRAWER_BANK_H, workbenchDrawerCount } from '../../domain/constants';
import { layoutFronts } from '../../domain/geometry/fronts';
import { wallMetrics } from '../../domain/geometry/metrics';
import { elementVertical, elementKind, effectiveWorkbenchSupport } from '../../domain/elements';
import { bandBlocks } from '../../domain/layout';
import { getFixture } from '../../domain/plugins';
import type { ElevationShape } from '../../domain/plugins';
import type { Cabinet, Opening, Project, Wall, WallElement, Zone } from '../../domain/types';

/** One front (door / drawer / …) on a cabinet element, in world coords (y up from floor). */
export interface FrontRect {
  opening: Opening;
  elementId: string;
  cabinetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  doorCount: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The carcass box of a cabinet element + its fronts. */
export interface CabRect extends Rect {
  elementId: string;
  cabinet: Cabinet;
  fronts: FrontRect[];
}

/** A clickable empty region (gap / wall tail) the user taps to drop a new element. */
export interface AddZone extends Rect {
  zone: Zone;
}

/**
 * One rendered wall element. Only the rects relevant to its kind are populated:
 * a cabinet carries `cab`; an appliance carries `ghost`/`ghostLabel`; a workbench
 * carries `legs`; a base/workbench/pass-fixture element carries a `counter`; a
 * base/tall cabinet carries a `toekick`. `hit` is the whole-element select target.
 */
export interface ElementRect {
  element: WallElement;
  x: number;
  width: number;
  hit: Rect;
  cab?: CabRect;
  counter?: Rect;
  toekick?: Rect;
  legs?: Rect[];
  /** Workbench apron stretcher (front rail), when braced with stretchers. */
  stretchers?: Rect;
  /** Workbench drawer faces under the worktop, when braced with a drawer bank. */
  workbenchDrawers?: Rect[];
  /** Full-height end panels carrying a drawer-bank workbench (replace legs). */
  workbenchEnds?: Rect[];
  ghost?: Rect;
  ghostLabel?: string;
  /** The ghost stands in for an appliance (drawn as a solid unit) vs an empty section. */
  ghostAppliance?: boolean;
  /** A fixture's 2D schematic (oven window, fridge doors, …), drawn over the ghost. */
  ghostShapes?: ElevationShape[];
  /** Element runs past the wall length. */
  overflow?: boolean;
}

export interface WallModel {
  wall: Wall;
  ceilingHeight: number;
  length: number;
  elements: ElementRect[];
  /** Clickable empty regions in the base + upper bands (gaps and the wall tail). */
  addZones: AddZone[];
  /** Full-height gaps where a tall column fits (the whole x-range is clear). */
  tallZones: AddZone[];
  /**
   * Merged toekick runs: abutting base/tall carcasses share one continuous strip
   * (mirrors the build's merged spans), so the drawing shows no seams between
   * cabinets in a run.
   */
  toekicks: Rect[];
}

/** Fronts for a cabinet, laid out top→bottom and inset by the full-overlay reveal. */
function frontsFor(cab: Cabinet, elementId: string, x: number, width: number, carcassH: number, yBottom: number): FrontRect[] {
  return layoutFronts(cab.front, carcassH).map((it) => ({
    opening: it.opening,
    elementId,
    cabinetId: cab.id,
    x: x + REVEAL,
    y: yBottom + it.bottomY,
    w: width - 2 * REVEAL,
    h: it.faceHeightIn,
    doorCount: it.opening.type === 'door' ? (it.opening.doorCount ?? 1) : 1,
  }));
}

/** A base/tall cabinet element abutting `xEdge` lets an adjacent workbench skip a leg there. */
function baseSupportAt(els: WallElement[], xEdge: number): boolean {
  return els.some(
    (e) =>
      !!e.cabinet &&
      (e.zone === 'base' || e.zone === 'tall') &&
      (Math.abs(e.xIn - xEdge) < 1e-6 || Math.abs(e.xIn + e.widthIn - xEdge) < 1e-6),
  );
}

/** Build the clickable "add here" gaps for one band, across gaps and the wall tail. */
function addZonesForBand(els: WallElement[], zone: Zone, length: number, y: number, h: number): AddZone[] {
  // Anything sharing this band's space blocks a new element here — including a
  // tall column, which a base/upper add-zone must route around. A fridge frees
  // the upper band above its body, so an upper add-zone runs over it.
  const spans = els
    .filter((e) => bandBlocks(e, zone))
    .map((e) => ({ x: e.xIn, r: e.xIn + e.widthIn }))
    .sort((a, b) => a.x - b.x);
  const zones: AddZone[] = [];
  let cursor = 0;
  // A gap narrower than the cabinet floor can't hold a usable section, so don't
  // offer a "+ add" slot there (this is what stops click-to-create slivers).
  const MIN_GAP = MIN_CABINET_WIDTH;
  for (const s of spans) {
    if (s.x - cursor >= MIN_GAP) zones.push({ zone, x: cursor, w: s.x - cursor, y, h });
    cursor = Math.max(cursor, s.r);
  }
  if (length - cursor >= MIN_GAP) zones.push({ zone, x: cursor, w: length - cursor, y, h });
  return zones;
}

/**
 * Turn a wall's free-form elements into a render model. Each element resolves its
 * vertical band via `elementVertical`, then emits the rects its kind needs. Strips
 * (counter / toekick) are per-element — the merged spans are a build-time concern;
 * for the drawing, abutting per-element strips read as one continuous run.
 */
export function buildWallModel(project: Project, wall: Wall): WallModel {
  const d = project.defaults;
  const showCounter = d.countertopEnabled !== false;
  const m = wallMetrics(project, wall);
  const els = wall.elements ?? [];
  const elements: ElementRect[] = [];

  for (const el of els) {
    const v = elementVertical(el, wall, m, d);
    const x = el.xIn;
    const w = el.widthIn;
    const kind = elementKind(el);
    const er: ElementRect = {
      element: el,
      x,
      width: w,
      hit: { x, y: 0, w, h: wall.ceilingHeightIn },
      overflow: x + w > wall.lengthIn + 1e-6,
    };

    // Cabinet carcass + fronts (a plain cabinet or one with an integrated fixture).
    if (el.cabinet) {
      er.cab = {
        elementId: el.id,
        cabinet: el.cabinet,
        x,
        y: v.yBottom,
        w,
        h: v.carcassH,
        fronts: frontsFor(el.cabinet, el.id, x, w, v.carcassH, v.yBottom),
      };
      // Base/tall carcasses stand on legs → a recessed toekick strip below them.
      if (v.hasLegs && m.legH > 0) er.toekick = { x, y: 0, w, h: m.legH };
    }

    // Workbench: a counter on legs (no carcass). Skip a leg where a base/tall
    // cabinet element abuts that side (it leans on that cabinet instead).
    if (el.workbench) {
      const legSection = 3;
      const inset = legSection / 2 + 0.5;
      const legTop = m.counterUndersideY;
      const supportedLeft = baseSupportAt(els, x);
      const supportedRight = baseSupportAt(els, x + w);
      const support = effectiveWorkbenchSupport(el.workbenchSupport, supportedLeft, supportedRight);
      // Corner legs on free ends for every scheme except 'none' (carried by the
      // cabinets it abuts). A centre leg only in the plain-legs scheme.
      const legXs: number[] = [];
      if (support !== 'none') {
        if (!supportedLeft) legXs.push(x + inset);
        if (!supportedRight) legXs.push(x + w - inset);
        if (w > 60 && support === 'legs') legXs.push(x + w / 2);
      }
      er.legs = legXs.map((lx) => ({ x: lx - legSection / 2, y: 0, w: legSection, h: legTop }));
      // Reinforced bench: a front apron stretcher under the top, extending to an
      // abutting cabinet on a supported side for joinery.
      if (support === 'stretchers') {
        const sLeft = supportedLeft ? x : x + inset;
        const sRight = supportedRight ? x + w : x + w - inset;
        er.stretchers = { x: sLeft, y: legTop - STRETCHER_WIDTH, w: sRight - sLeft, h: STRETCHER_WIDTH };
      }
      // Drawer bank: a box hung under the top (bank-height ends, not full legs) +
      // N faces across the inner opening. Legs (above) carry the bench.
      if (support === 'drawer') {
        const endT = 0.75;
        const bankH = Math.min(Math.max(el.workbenchDrawerHeightIn ?? WORKBENCH_DRAWER_BANK_H, 2), legTop - 1);
        er.workbenchEnds = [
          { x, y: legTop - bankH, w: endT, h: bankH },
          { x: x + w - endT, y: legTop - bankH, w: endT, h: bankH },
        ];
        const n = workbenchDrawerCount(w);
        const gap = REVEAL;
        // Full-overlay faces: n equal slices across the whole box front.
        const faceW = (w - (n + 1) * gap) / n;
        er.workbenchDrawers = Array.from({ length: n }, (_, i) => ({
          x: x + gap + i * (faceW + gap), y: legTop - bankH + gap / 2, w: faceW, h: bankH - gap,
        }));
      }
    }

    // Standalone / integrated fixture: a labelled ghost in the element's band. An
    // integrated fixture (cabinet + appliance) keeps the carcass drawing, so the
    // ghost only stands in when there's no carcass to show.
    if (el.fixtureId && !el.cabinet) {
      const def = getFixture(el.fixtureId);
      const bandTop = el.zone === 'tall' ? wall.ceilingHeightIn : el.zone === 'upper' ? v.yBottom + v.carcassH : m.counterUndersideY;
      // A fridge (and any tall fixture that frees the band above it) only fills its
      // own body height, leaving the column above open for an upper.
      const top = def?.occupiedHeightIn ? def.occupiedHeightIn({ element: el, config: el.fixture, metrics: m }) : bandTop;
      const bottom = el.zone === 'upper' ? v.yBottom : 0;
      er.ghost = { x, y: bottom, w, h: top - bottom };
      er.ghostLabel = def?.label ?? 'appliance';
      er.ghostAppliance = true;
      er.ghostShapes = def?.elevation?.({ element: el, config: el.fixture, x, y: bottom, w, h: top - bottom });
    }

    // Empty element: a faint clickable ghost over the whole height.
    if (kind === 'empty') {
      er.ghost = { x, y: 0, w, h: wall.ceilingHeightIn };
      er.ghostLabel = 'empty';
    }

    // Countertop strip over contributing base elements (base cabinet, workbench,
    // or a pass-through base fixture). Upper/tall bands never carry a counter.
    if (showCounter && el.zone === 'base') {
      const passFixture = el.fixtureId ? getFixture(el.fixtureId)?.countertop === 'pass' : false;
      if (el.cabinet || el.workbench || passFixture) er.counter = { x, y: m.counterUndersideY, w, h: m.counterT };
    }

    elements.push(er);
  }

  const upperY = wall.ceilingHeightIn - d.upperCeilingGapIn - m.upperH;
  const addZones: AddZone[] = [
    ...addZonesForBand(els, 'base', wall.lengthIn, m.legH, m.baseCarcassH),
    ...addZonesForBand(els, 'upper', wall.lengthIn, upperY, m.upperH),
  ];
  // A tall column spans both bands, so its free gaps are the x-ranges with no
  // element at all (bandsOverlap('tall', …) is always true). The creation picker
  // offers a tall section only where the click falls inside one of these.
  const tallZones = addZonesForBand(els, 'tall', wall.lengthIn, 0, wall.ceilingHeightIn);

  return {
    wall, ceilingHeight: wall.ceilingHeightIn, length: wall.lengthIn, elements, addZones, tallZones,
    toekicks: mergeToekicks(elements),
  };
}

/** Merge abutting per-element toekick strips into continuous runs (like the build's merged spans). */
function mergeToekicks(elements: ElementRect[]): Rect[] {
  const strips = elements
    .filter((er) => er.toekick)
    .map((er) => er.toekick!)
    .sort((a, b) => a.x - b.x);
  const runs: Rect[] = [];
  for (const s of strips) {
    const last = runs[runs.length - 1];
    if (last && s.x <= last.x + last.w + 1e-3) last.w = Math.max(last.w, s.x + s.w - last.x);
    else runs.push({ ...s });
  }
  return runs;
}
