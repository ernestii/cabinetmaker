import type { Cabinet, Construction, HandleType, Node3D, Part, ProjectDefaults, RunKind } from '../types';
import {
  DADO_DEPTH,
  DADO_MIN_REMAINING,
  DEFAULT_BACK_STYLE,
  DEFAULT_DRAWER_JOINT,
  DEFAULT_SLIDE_TYPE,
  STRETCHER_WIDTH,
  T_BACK,
  T_CARCASS,
  T_DRAWER,
  T_DRAWER_BOTTOM,
  T_FACE,
} from '../constants';

/**
 * Resolved construction values + context needed to build one cabinet's parts.
 * Coordinate frame is LOCAL to the cabinet:
 *   x = 0 at left outer face, increases right (width)
 *   y = 0 at carcass bottom, increases up (height); legs sit at negative y
 *   z = 0 at wall, increases toward the room (depth)
 */
export interface BuildContext {
  cabinet: Cabinet;
  /** 1-based index used in part IDs (C1, C2, ...). */
  index: number;
  runKind: RunKind;
  widthIn: number;
  depthIn: number;
  /** Carcass height (the box itself, excluding legs/counter). */
  carcassHeightIn: number;
  /** Height of legs below the carcass (0 for uppers). */
  legHeightIn: number;
  hasLegs: boolean;
  /** Material id lookup by role. */
  materialIdByRole: Record<string, string>;
  colorByRole: Record<string, string>;
  textureByRole: Record<string, string | undefined>;
  /** Sides cut from finished 'face' stock (exposed ends); resolved by the caller. */
  exposedSides: ('left' | 'right')[];
  c: Required<Construction>;
  /** Project-wide pull defaults; an unset opening handle falls back to these. */
  drawerHandle: HandleType;
  doorHandle: HandleType;
}

/**
 * Resolve a cabinet's construction. Thicknesses follow the assigned material
 * for each role (so a part cut from 3/4" stock is 3/4" thick); a per-cabinet
 * construction override still wins, and a hard-coded constant is the last
 * resort when no material carries the role.
 */
export function resolveConstruction(
  cabinet: Cabinet,
  runKind: RunKind,
  thicknessByRole: Record<string, number> = {},
  defaults?: ProjectDefaults,
): Required<Construction> {
  const o = cabinet.construction ?? {};
  const drawerThicknessIn = o.drawerThicknessIn ?? thicknessByRole.drawer ?? T_DRAWER;
  // The dado is cut into the drawer sides; cap it so a minimum of stock is left
  // (you can't seat a 1/2" dado in 1/2" material — it would cut clean through).
  const maxDado = Math.max(0, drawerThicknessIn - DADO_MIN_REMAINING);
  return {
    carcassThicknessIn: o.carcassThicknessIn ?? thicknessByRole.carcass ?? T_CARCASS,
    backThicknessIn: o.backThicknessIn ?? thicknessByRole.back ?? T_BACK,
    drawerThicknessIn,
    drawerBottomThicknessIn: o.drawerBottomThicknessIn ?? thicknessByRole.drawerBottom ?? T_DRAWER_BOTTOM,
    faceThicknessIn: o.faceThicknessIn ?? thicknessByRole.face ?? T_FACE,
    // Base cabinets use stretchers; uppers/tall get a full top by default.
    topStyle: o.topStyle ?? (runKind === 'base' ? 'stretchers' : 'full'),
    stretcherWidthIn: o.stretcherWidthIn ?? STRETCHER_WIDTH,
    backStyle: o.backStyle ?? defaults?.backStyle ?? DEFAULT_BACK_STYLE,
    // Per-cabinet override → project default → hard-coded constant.
    drawerJoint: o.drawerJoint ?? defaults?.drawerJoint ?? DEFAULT_DRAWER_JOINT,
    slideType: o.slideType ?? defaults?.slideType ?? DEFAULT_SLIDE_TYPE,
    dadoDepthIn: Math.min(o.dadoDepthIn ?? defaults?.dadoDepthIn ?? DADO_DEPTH, maxDado),
  };
}

let counter = 0;
/** Deterministic-enough unique suffix; geometry never relies on it for IDs. */
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export interface PartFactory {
  add: (part: Omit<Part, 'cabinetId'>) => void;
  node: (n: Node3D) => void;
}

export function colorFor(ctx: BuildContext, role: string): string {
  return ctx.colorByRole[role] ?? '#caa472';
}

export function textureFor(ctx: BuildContext, role: string): string | undefined {
  return ctx.textureByRole[role];
}

export function materialFor(ctx: BuildContext, role: string): string {
  return ctx.materialIdByRole[role] ?? role;
}
