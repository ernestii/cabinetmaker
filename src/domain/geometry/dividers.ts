import type { Opening } from '../types';
import { REVEAL } from '../constants';
import { colorFor, materialFor, textureFor, type BuildContext, type PartFactory } from './context';
import type { FrontLayoutItem } from './fronts';

/** Is this front an OPEN (no-door/no-drawer) bay set to enclose itself with fixed panels? */
export function isEnclosedOpen(o: Opening): boolean {
  // Default ON: an open bay encloses unless the user explicitly turns it off.
  return o.type === 'fixed' && o.settings?.enclose !== false;
}

/** Is this a door section the user has chosen to wall off with fixed dividers? */
export function isDividedDoor(o: Opening): boolean {
  // Default OFF: stacked doors share one cavity unless the user asks to divide.
  return o.type === 'door' && o.settings?.divider === true;
}

/** Any front that closes its section with fixed horizontal divider panels. */
export function hasFixedDividers(o: Opening): boolean {
  return isEnclosedOpen(o) || isDividedDoor(o);
}

export interface FixedDividerSpec {
  partId: string;
  label: string;
  /** Carcass-local y of the panel centre. */
  yCenter: number;
}

/**
 * Which fixed divider panels a section-closing front contributes.
 *
 * Applies to an enclosed open bay and to a door section with dividers turned on:
 * the front closes against its interior neighbours so it reads as a real
 * compartment (a solid surface to set things on, and it hides a drawer box
 * below; for a stack of doors it gives each door its own closed cubby).
 * Boundaries are deduped so a divider shared by two stacked closed sections is
 * emitted exactly ONCE — owned by the upper section's bottom panel — and the
 * carcass top/bottom already close the outermost edges, so no panel is emitted
 * there.
 *
 * `prefix` keeps part ids unique per front type (`DIV` for open bays, `DDIV` for
 * doors) so a cabinet mixing both never clashes ids. Returns [] when the front
 * isn't section-closing (toggle off / wrong type) or has no interior neighbour
 * to close against (a lone section spanning the carcass).
 */
export function fixedDividerPlan(
  fronts: Opening[],
  item: FrontLayoutItem,
  ordinal: number,
  index: number,
  prefix = 'DIV',
): FixedDividerSpec[] {
  const o = item.opening;
  if (!hasFixedDividers(o)) return [];
  const i = fronts.findIndex((x) => x.id === o.id);
  if (i < 0) return [];

  const specs: FixedDividerSpec[] = [];
  const base = `C${index}-${prefix}${ordinal}`;
  const what = `${prefix === 'DDIV' ? 'Door divider' : 'Fixed divider'} ${ordinal}`;
  // Bottom panel: emitted whenever there's a front below to close against.
  if (i < fronts.length - 1) {
    specs.push({ partId: `${base}B`, label: `${what} (lower)`, yCenter: item.bottomY - REVEAL });
  }
  // Top panel: only when the front above isn't itself a section-closing front —
  // that front already owns this boundary as its bottom panel (dedup) — and never
  // at the topmost front, where the carcass top closes the section.
  if (i > 0 && !hasFixedDividers(fronts[i - 1])) {
    specs.push({ partId: `${base}T`, label: `${what} (upper)`, yCenter: item.topY + REVEAL });
  }
  return specs;
}

/**
 * A fixed horizontal divider — a full-depth panel permanently dado'd + glued
 * into the carcass sides (not a pinned adjustable shelf). Same stock and feel as
 * the carcass bottom, flush to the front so it forms a usable surface.
 */
export function buildFixedDivider(
  ctx: BuildContext,
  f: PartFactory,
  yCenter: number,
  partId: string,
  label: string,
): void {
  const { widthIn: W, depthIn: D, c } = ctx;
  const t = c.carcassThicknessIn;
  const tb = c.backThicknessIn;
  const innerW = W - 2 * t;
  const d = D - tb;
  f.add({
    id: partId,
    label,
    role: 'carcass',
    materialId: materialFor(ctx, 'carcass'),
    thicknessIn: t,
    wIn: innerW,
    lIn: d,
    qty: 1,
    edgeBandEdges: ['top'],
    joinery: ['dado', 'glue'],
    grainLocked: true,
    notes: 'Fixed divider — dado into both sides, glue',
  });
  f.node({
    pos: [W / 2, yCenter, tb + d / 2],
    size: [innerW, t, d],
    color: colorFor(ctx, 'carcass'),
    textureUrl: textureFor(ctx, 'carcass'),
    kind: 'panel',
    partId,
  });
}
