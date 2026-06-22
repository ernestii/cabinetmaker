/**
 * Helpers for the free-form wall model. A `WallElement` is one positioned
 * section of a wall; what it *is* (cabinet, appliance, workbench, …) is derived
 * from which of its fields are populated rather than a rigid `type` enum, so the
 * combinations (incl. a cabinet with an integrated appliance) stay open-ended.
 *
 * Pure + React-free: the engine, validation, assembly, and the editor all read
 * the vertical layout of an element through one place (`elementVertical`).
 */
import type { ProjectDefaults, RunKind, Wall, WallElement, Zone } from './types';
import type { WallMetrics } from './geometry/metrics';
import { DOUBLE_DOOR_MIN_WIDTH } from './constants';

/** The section kind an element represents, derived from its populated fields. */
export type ElementKind = 'cabinet' | 'appliance' | 'cabinet+appliance' | 'workbench' | 'empty';

/**
 * Best-practice single-vs-pair door split for a new door front: a frameless door
 * wider than ~24" sags and needs too much swing clearance, so it gets two leaves.
 */
export function defaultDoorCount(widthIn: number): 1 | 2 {
  return widthIn > DOUBLE_DOOR_MIN_WIDTH ? 2 : 1;
}

export function elementKind(el: WallElement): ElementKind {
  if (el.workbench) return 'workbench';
  const hasCab = !!el.cabinet;
  const hasFix = !!el.fixtureId;
  if (hasCab && hasFix) return 'cabinet+appliance';
  if (hasFix) return 'appliance';
  if (hasCab) return 'cabinet';
  return 'empty';
}

/** Does this element carry a carcass cabinet (plain, or with an integrated fixture)? */
export function hasCabinet(el: WallElement): boolean {
  return !!el.cabinet;
}

/** A band's default carcass/fixture depth from the project defaults. */
export function bandDepth(d: ProjectDefaults, zone: Zone): number {
  return zone === 'upper' ? d.upperDepthIn : zone === 'tall' ? d.tallDepthIn : d.baseDepthIn;
}

/** Resolved vertical placement of an element within its wall. */
export interface ElementVertical {
  /** Floor → element bottom, inches. */
  yBottom: number;
  /** Carcass height available to a cabinet in this band. */
  carcassH: number;
  /** Default carcass/fixture depth for this band (before per-element override). */
  depthDefault: number;
  /** Cabinet run kind for this band. */
  runKind: RunKind;
  /** Whether the band stands on levelling legs (base/tall) or hangs (upper). */
  hasLegs: boolean;
}

/**
 * Resolve where an element sits vertically from the wall metrics + project
 * defaults. The base and upper bands are independent — an upper element hangs
 * from the ceiling regardless of what (if anything) is below it.
 */
export function elementVertical(el: WallElement, wall: Wall, m: WallMetrics, d: ProjectDefaults): ElementVertical {
  if (el.zone === 'upper') {
    const carcassH = el.heightOverrideIn ?? m.upperH;
    const gap = el.ceilingGapOverrideIn ?? d.upperCeilingGapIn;
    return {
      yBottom: wall.ceilingHeightIn - gap - carcassH,
      carcassH,
      depthDefault: bandDepth(d, 'upper'),
      runKind: 'upper',
      hasLegs: false,
    };
  }
  if (el.zone === 'tall') {
    // A tall column runs floor → ceiling; a ceiling-gap override shortens it from
    // the top (so it can clear an overhead obstruction) without changing its base.
    const gap = el.ceilingGapOverrideIn ?? 0;
    const carcassH = Math.max(1, m.tallCarcassH - gap);
    return { yBottom: m.legH, carcassH, depthDefault: bandDepth(d, 'tall'), runKind: 'tall', hasLegs: true };
  }
  // base
  return { yBottom: m.legH, carcassH: m.baseCarcassH, depthDefault: bandDepth(d, 'base'), runKind: 'base', hasLegs: true };
}

/** Base/fixture depth an element uses (per-element override → cabinet override → band default). */
export function elementDepth(el: WallElement, d: ProjectDefaults): number {
  // A workbench lives in the base band, so it follows the base-cabinet depth.
  if (el.workbench) return el.depthOverrideIn ?? d.baseDepthIn;
  return el.depthOverrideIn ?? el.cabinet?.depthOverrideIn ?? el.fixture?.depthOverrideIn ?? bandDepth(d, el.zone);
}

/** Right edge of an element, inches from the wall's left end. */
export function elementRight(el: WallElement): number {
  return el.xIn + el.widthIn;
}

/** Which sides of a workbench abut a base/tall cabinet (so it can lean on it). */
export function workbenchSupportedSides(wall: Wall, el: WallElement): { left: boolean; right: boolean } {
  const els = wall.elements ?? [];
  const abut = (xEdge: number) =>
    els.some((e) => e !== el && !!e.cabinet && (e.zone === 'base' || e.zone === 'tall') &&
      (Math.abs(e.xIn - xEdge) < 1e-6 || Math.abs(e.xIn + e.widthIn - xEdge) < 1e-6));
  return { left: abut(el.xIn), right: abut(el.xIn + el.widthIn) };
}

/**
 * 'none' (no legs at all) leans entirely on the cabinets a bench abuts; without
 * one on BOTH sides it falls back to plain legs so the top can't float. Stretcher
 * and drawer benches carry themselves on legs, so they're left alone. Keeps the
 * geometry honest even if a stale value lingers after the neighbours change.
 */
export function effectiveWorkbenchSupport(
  support: WallElement['workbenchSupport'],
  supportedLeft: boolean,
  supportedRight: boolean,
): NonNullable<WallElement['workbenchSupport']> {
  const s = support ?? 'legs';
  return s === 'none' && !(supportedLeft && supportedRight) ? 'legs' : s;
}
