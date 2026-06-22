/**
 * Placement math for the free-form wall model: how element footprints relate
 * along a wall (band overlap, collision clamping), how appliance widths snap to
 * stock sizes, and the legality invariants of a single element. All pure (it
 * mutates only the WallElement passed in), so the store, the elevation editor,
 * and the validator share one definition — and it's unit-testable on its own.
 */
import { getFixture } from './plugins';
import { snapTo } from './format';
import { elementDepth } from './elements';
import { MIN_CABINET_WIDTH, MIN_ELEMENT_WIDTH, OVERLAP_TOL, PLACEMENT_EPS } from './constants';
import type { ProjectDefaults, Wall, WallElement, Zone } from './types';

/**
 * Do two vertical bands share space, so an x-overlap between elements in them is
 * a real, physical collision? Same band → yes. A `tall` column runs the full
 * height of the wall, so it collides with both `base` and `upper`. The base and
 * upper bands are otherwise independent (a base cabinet and the upper above it
 * don't conflict).
 */
export function bandsOverlap(a: Zone, b: Zone): boolean {
  if (a === b) return true;
  return a === 'tall' || b === 'tall';
}

/**
 * A `tall` element that doesn't fill the column — a refrigerator and the like —
 * leaves the upper band above its body open for a separate upper cabinet. A tall
 * *cabinet* (pantry) runs full height and never does; a fixture opts in via
 * `freesUpperBand`.
 */
export function freesUpperBand(el: WallElement): boolean {
  if (el.zone !== 'tall' || el.cabinet || el.workbench || !el.fixtureId) return false;
  return getFixture(el.fixtureId)?.freesUpperBand === true;
}

/**
 * Do two elements' vertical bands physically collide, so an x-overlap between them
 * is a real collision? This is `bandsOverlap` on their zones with one relaxation:
 * a tall fixture that frees the band above it (a fridge) doesn't collide with an
 * upper cabinet hanging over it.
 */
export function bandsCollide(a: WallElement, b: WallElement): boolean {
  if (!bandsOverlap(a.zone, b.zone)) return false;
  if (a.zone === 'tall' && b.zone === 'upper' && freesUpperBand(a)) return false;
  if (b.zone === 'tall' && a.zone === 'upper' && freesUpperBand(b)) return false;
  return true;
}

/**
 * Does existing element `e` block a NEW (bare) element placed in `zone` — i.e.
 * should that x-range be excluded from the band's add-zones? Same relaxation as
 * `bandsCollide`: a fridge frees the upper band above it.
 */
export function bandBlocks(e: WallElement, zone: Zone): boolean {
  if (!bandsOverlap(zone, e.zone)) return false;
  if (e.zone === 'tall' && zone === 'upper' && freesUpperBand(e)) return false;
  return true;
}

/** Do two elements' footprints overlap along the wall (x), within a tolerance? */
export function elementsOverlapX(a: WallElement, b: WallElement, tol = OVERLAP_TOL): boolean {
  return a.xIn < b.xIn + b.widthIn - tol && b.xIn < a.xIn + a.widthIn - tol;
}

/** Right edge past which a band's elements end (for placing a new one). */
export function freeXForZone(wall: Wall, zone: Zone): number {
  return (wall.elements ?? [])
    .filter((e) => e.zone === zone)
    .reduce((mx, e) => Math.max(mx, e.xIn + e.widthIn), 0);
}

// ---------- appliance width snapping ----------

/** Nearest standard size for a locked appliance. */
export function snapStandard(w: number, sizes: number[]): number {
  return sizes.reduce((best, s) => (Math.abs(s - w) < Math.abs(best - w) ? s : best), sizes[0]);
}

/** The standard widths this element is locked to (a size-locked appliance), else undefined. */
export function lockedSizes(el: WallElement): number[] | undefined {
  if (!el.fixtureId) return undefined;
  const def = getFixture(el.fixtureId);
  if (!def?.standardWidthsIn?.length) return undefined;
  return (el.fixture?.widthLocked ?? true) ? def.standardWidthsIn : undefined;
}

/**
 * Smallest width this element may take, by what it holds: a locked appliance snaps
 * to its smallest standard size; a carcass cabinet or a workbench gets the cabinet
 * floor (so click-to-create and resizes can't make an unusable sliver); an empty
 * gap keeps the bare element floor.
 */
export function minWidthFor(el: WallElement): number {
  const sizes = lockedSizes(el);
  if (sizes) return Math.min(...sizes);
  if (el.cabinet || el.workbench) return MIN_CABINET_WIDTH;
  return MIN_ELEMENT_WIDTH;
}

/** Apply a width to an element, snapping locked appliances to standard sizes. */
export function applyWidth(el: WallElement, w: number): void {
  const sizes = lockedSizes(el);
  el.widthIn = sizes ? snapStandard(w, sizes) : Math.max(minWidthFor(el), snapTo(w));
}

/** Apply a width, snapping locked appliances to standard sizes, capped at `maxW` so it can't overlap a neighbour. */
export function applyWidthClamped(el: WallElement, w: number, maxW: number): void {
  const sizes = lockedSizes(el);
  if (sizes) {
    const fits = sizes.filter((s) => s <= maxW + PLACEMENT_EPS);
    el.widthIn = fits.length ? snapStandard(w, fits) : Math.min(...sizes);
  } else {
    el.widthIn = Math.max(minWidthFor(el), Math.min(snapTo(w), maxW));
  }
}

// ---------- collision clamping ----------

/** Other elements on the wall whose vertical band overlaps `el`'s — an x-overlap with one of these is a real collision. */
export function bandNeighbors(wall: Wall, el: WallElement): WallElement[] {
  return (wall.elements ?? []).filter((o) => o.id !== el.id && bandsCollide(el, o));
}

/** The horizontal bands a zone physically occupies (a `tall` column fills both). */
function occupiedBands(zone: Zone): ('base' | 'upper')[] {
  return zone === 'tall' ? ['base', 'upper'] : [zone];
}

/**
 * Which sides of a cabinet element are exposed/finished, derived from the layout.
 * A side reads as finished unless it's fully hidden — meaning, for every band the
 * element occupies, an abutting cabinet that's at least as deep covers it — or it's
 * flush against the wall's end (a corner / return wall, which stays hidden). So
 * mid-run ends next to a gap or appliance bay get face stock; shared sides between
 * equal-depth cabinets, and corners, stay hidden carcass ply. The band check is
 * what makes a **tall** cabinet right: a single base cabinet beside it only covers
 * the base band, leaving the upper portion of the side exposed (so it's finished);
 * likewise a shallower neighbour (e.g. 12" uppers beside a 24" pantry) doesn't
 * count as covering, because the cabinet protrudes past it. Pure geometry — the
 * caller layers any manual override.
 */
export function autoExposedSides(wall: Wall, el: WallElement, defaults: ProjectDefaults): ('left' | 'right')[] {
  const left = el.xIn;
  const right = el.xIn + el.widthIn;
  const myDepth = elementDepth(el, defaults);
  const myBands = occupiedBands(el.zone);
  const neighbors = bandNeighbors(wall, el);
  // The side is hidden only if every band this element occupies is covered by an
  // abutting cabinet that reaches at least as deep. A shallower neighbour, or one
  // that only covers some of the bands (a base cabinet beside a tall), leaves part
  // of the side showing — so it's finished.
  const hiddenOn = (edgeMatches: (o: WallElement) => boolean): boolean => {
    const covered = new Set<'base' | 'upper'>();
    for (const o of neighbors) {
      if (!o.cabinet || !edgeMatches(o) || elementDepth(o, defaults) < myDepth - PLACEMENT_EPS) continue;
      for (const b of occupiedBands(o.zone)) covered.add(b);
    }
    return myBands.every((b) => covered.has(b));
  };
  const coversLeft = hiddenOn((o) => Math.abs(o.xIn + o.widthIn - left) <= PLACEMENT_EPS);
  const coversRight = hiddenOn((o) => Math.abs(o.xIn - right) <= PLACEMENT_EPS);
  const out: ('left' | 'right')[] = [];
  if (!coversLeft && left > PLACEMENT_EPS) out.push('left');
  if (!coversRight && right < wall.lengthIn - PLACEMENT_EPS) out.push('right');
  return out;
}

/**
 * Resolved exposed sides for a cabinet element: an explicit per-cabinet override
 * (`cabinet.exposedSides`, including an empty array) wins; otherwise auto-detect.
 */
export function resolveExposedSides(wall: Wall, el: WallElement, defaults: ProjectDefaults): ('left' | 'right')[] {
  return el.cabinet?.exposedSides ?? autoExposedSides(wall, el, defaults);
}

/**
 * Best-practice default hinge side for a single door: hinge against the nearer
 * obstacle (an adjacent same-band cabinet/appliance, or the wall end) so the door
 * swings open into the larger free space, with the handle on the open side.
 */
export function defaultHingeSide(wall: Wall, el: WallElement): 'left' | 'right' {
  const left = el.xIn;
  const right = el.xIn + el.widthIn;
  let leftObstacle = 0;
  let rightObstacle = wall.lengthIn;
  for (const o of bandNeighbors(wall, el)) {
    const oRight = o.xIn + o.widthIn;
    if (oRight <= left + PLACEMENT_EPS) leftObstacle = Math.max(leftObstacle, oRight);
    if (o.xIn >= right - PLACEMENT_EPS) rightObstacle = Math.min(rightObstacle, o.xIn);
  }
  return left - leftObstacle <= rightObstacle - right ? 'left' : 'right';
}

/**
 * Clamp a desired left edge so `el` stays on the wall and never overlaps a band
 * neighbour. Neighbours are classified left/right relative to the element's
 * current position (moves are incremental, so this keeps a drag resting against
 * whatever it bumps into); any that currently overlap are ignored.
 */
export function clampElementX(wall: Wall, el: WallElement, desiredX: number): number {
  const w = el.widthIn;
  let minX = 0;
  let maxX = Math.max(0, wall.lengthIn - w);
  for (const o of bandNeighbors(wall, el)) {
    const oL = o.xIn;
    const oR = o.xIn + o.widthIn;
    if (oR <= el.xIn + PLACEMENT_EPS) minX = Math.max(minX, oR); // neighbour entirely to our left
    else if (oL >= el.xIn + w - PLACEMENT_EPS) maxX = Math.min(maxX, oL - w); // neighbour entirely to our right
  }
  return Math.min(Math.max(desiredX, minX), Math.max(minX, maxX));
}

/** Widest `el` can grow before its right edge meets the nearest band neighbour to its right — or the wall's end. */
export function maxWidthFor(wall: Wall, el: WallElement): number {
  let limit = Math.max(0, wall.lengthIn - el.xIn);
  for (const o of bandNeighbors(wall, el)) {
    if (o.xIn >= el.xIn - PLACEMENT_EPS && o.xIn + o.widthIn > el.xIn + PLACEMENT_EPS) limit = Math.min(limit, o.xIn - el.xIn);
  }
  return limit;
}

/** Leftmost edge a band neighbour to `el`'s left allows (so dragging its left edge can't overlap). */
export function minLeftFor(wall: Wall, el: WallElement): number {
  let minLeft = 0;
  for (const o of bandNeighbors(wall, el)) {
    const oR = o.xIn + o.widthIn;
    if (oR <= el.xIn + PLACEMENT_EPS) minLeft = Math.max(minLeft, oR);
  }
  return minLeft;
}

/**
 * Resize `el` by dragging its LEFT edge to `desiredLeft`, keeping its right edge
 * fixed (the mirror of a normal right-edge resize). Clamps so it stays on the
 * wall, doesn't overrun a left band-neighbour, and keeps at least its min width.
 * In place; widths stay on the inch grid (the right edge is held wherever it was).
 */
export function resizeLeftEdge(wall: Wall, el: WallElement, desiredLeft: number): void {
  const rightEdge = el.xIn + el.widthIn;
  const minLeft = minLeftFor(wall, el);
  const maxLeft = rightEdge - minWidthFor(el);
  const left = Math.min(Math.max(snapTo(desiredLeft), minLeft), Math.max(minLeft, maxLeft));
  el.xIn = left;
  el.widthIn = rightEdge - left;
}

/**
 * Move the shared seam between two abutting same-band elements to `desiredSeam`,
 * keeping the pair's outer edges fixed: the left element's right edge and the
 * right element's left edge both land on the seam, so the pair's combined span is
 * unchanged. Each keeps at least its min width. Mutates both in place.
 */
export function moveSeamBetween(left: WallElement, right: WallElement, desiredSeam: number): void {
  const leftEdge = left.xIn;
  const rightEdge = right.xIn + right.widthIn;
  const minSeam = leftEdge + minWidthFor(left);
  const maxSeam = rightEdge - minWidthFor(right);
  const seam = Math.min(Math.max(snapTo(desiredSeam), minSeam), Math.max(minSeam, maxSeam));
  left.widthIn = seam - leftEdge;
  right.xIn = seam;
  right.widthIn = rightEdge - seam;
}

// ---------- element invariants ----------

/**
 * Repair a single element to a legal state, in place. Used by the store's
 * mutators' siblings and on JSON import so hand-edited/older data self-heals:
 *  - an unknown fixture id is dropped;
 *  - a standalone (non-integratable) appliance owns its whole section, so a
 *    stray cabinet/workbench is cleared (the fixture wins — we don't model an
 *    integrated fridge);
 *  - cabinet and workbench are mutually exclusive (cabinet wins);
 *  - a standalone fixture adopts its natural band (e.g. a fridge → `tall`);
 *  - a size-locked appliance snaps to a standard width.
 */
export function normalizeElement(el: WallElement): void {
  const def = el.fixtureId ? getFixture(el.fixtureId) : undefined;
  if (el.fixtureId && !def) { el.fixtureId = undefined; el.fixture = undefined; }
  if (def && !def.integratable) { el.cabinet = undefined; el.workbench = undefined; }
  if (el.cabinet && el.workbench) el.workbench = undefined;
  if (def && !el.cabinet && !el.workbench) el.zone = def.zone;
  const sizes = lockedSizes(el);
  if (sizes) el.widthIn = snapStandard(el.widthIn, sizes);
}
