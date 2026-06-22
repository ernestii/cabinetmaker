/**
 * Construction defaults for frameless / euro-style cabinetry.
 * All dimensions in inches unless noted. These are the project-wide defaults;
 * individual cabinets / materials can override most of them.
 */
import type { BackStyle, DrawerJoint, HandleType, SlideType } from './types';

export const T_CARCASS = 0.75; // 3/4" carcass plywood
export const T_DRAWER = 0.5; // 1/2" drawer box sides
export const T_DRAWER_BOTTOM = 0.5; // drawer bottom stock (1/4" optional)
export const T_BACK = 0.5; // 1/2" inset back, doubles as hanging cleat
export const T_FACE = 0.75; // door / drawer face stock

/** Reveal per side for full-overlay fronts. 1/16" → 1/8" gap between fronts. */
export const REVEAL = 1 / 16;

/**
 * Handle geometry. An 'edgePull' door runs past the carcass to form a finger
 * lip — that extension is part of the cut face. A 'routerCutout' is a finger
 * pull machined into the top edge of a drawer face (no added stock).
 */
export const EDGE_PULL_EXTENSION = 1.5; // how far an edge-pull face projects past the opening
export const ROUTER_CUTOUT_WIDTH = 4.5; // span of the routed finger pull
export const ROUTER_CUTOUT_HEIGHT = 1.5; // visible height of the routed finger pull
export const ROUTER_CUTOUT_DEPTH = 0.375; // 3/8" finger relief routed into the face

/** Side-mount drawer slide clearance, per side. */
export const SLIDE_CLEARANCE = 0.5;

/** Under-mount drawer slide clearance, per side (~3/16"). */
export const UNDERMOUNT_CLEARANCE = 3 / 16;

/** Default dado/groove depth that captures drawer front/back into the sides. */
export const DADO_DEPTH = 0.25;

/**
 * Stock that must remain under a dado so it doesn't blow through the panel — a
 * dado is capped at `sideThickness - DADO_MIN_REMAINING` (so a 1/2" dado is
 * impossible in 1/2" material; 1/4" of it would be left at most).
 */
export const DADO_MIN_REMAINING = 1 / 4;

/** Drawer bottom groove inset from the bottom edge of the box sides. */
export const BOTTOM_GROOVE_UP = 0.5;

/** Screws driven per corner when the drawer joint is dado + screws. */
export const SCREWS_PER_JOINT = 2;

/** Adjustable leg height (typical 4.5" levelers). */
export const LEG_HEIGHT = 4.5;

/** Countertop slab thickness (typical 1.5" slab). */
export const COUNTER_THICKNESS = 1.5;

/** Front overhang of the countertop past the cabinet face. */
export const COUNTER_OVERHANG = 1;

/** Width of front/back stretchers used instead of a full top on base cabs. */
export const STRETCHER_WIDTH = 4;

/** Width of the top/bottom back rails used when the back is rails, not a panel. */
export const BACK_RAIL_WIDTH = 4;

/** How far the toekick board is recessed from the cabinet face. */
export const TOEKICK_RECESS = 3;

/** Adjustable-shelf clearance per side (drops onto shelf pins). */
export const SHELF_SIDE_CLEARANCE = 1 / 16;

/** Adjustable shelf set back from the cabinet front so it clears the door. */
export const SHELF_SETBACK = 0.75;

/** Standard base counter height, floor → top of counter. */
export const DEFAULT_COUNTER_HEIGHT = 36;

/** Default cabinet depths. */
export const DEFAULT_BASE_DEPTH = 24;
export const DEFAULT_UPPER_DEPTH = 12;
export const DEFAULT_TALL_DEPTH = 24;

/** Defaults for upper runs. */
export const DEFAULT_UPPER_CEILING_GAP = 0; // gap from ceiling to top of uppers
export const DEFAULT_UPPER_HEIGHT = 30;

/** Sheet goods. */
export const SHEET_W = 48;
export const SHEET_H = 96;
export const DEFAULT_KERF = 1 / 8;

export const MM_PER_INCH = 25.4;

/**
 * Gridfinity standard, expressed in inches. The grid pitch is a 42 mm square and
 * each height unit ("u") is 7 mm — used to fill a drawer interior with the
 * modular bin grid and report its capacity (cols × rows × units).
 */
export const GRIDFINITY_CELL_IN = 42 / MM_PER_INCH; // ≈ 1.6535"
export const GRIDFINITY_UNIT_IN = 7 / MM_PER_INCH; // ≈ 0.2756"

/** Where the viewer loads optional glTF fixture models from (Vite serves public/). */
export const MODELS_BASE = '/models';

/** Cut-list resolution: every generated part dimension snaps to 1/SNAP_DENOM". */
export const SNAP_DENOM = 16;

/** Smallest permissible wall-element width, inches (empty gaps + non-locked appliances). */
export const MIN_ELEMENT_WIDTH = 6;

/** Smallest permissible width for a section that holds a carcass cabinet or a workbench, inches. */
export const MIN_CABINET_WIDTH = 9;

/** Default width a click-to-create cabinet aims for (clamped to the available gap), inches. */
export const CABINET_TARGET_WIDTH = 24;

/** Floor for the per-cabinet upper-height override, inches. */
export const MIN_UPPER_HEIGHT = 6;

/** Two element footprints closer than this overlap (rounding slack), inches. */
export const OVERLAP_TOL = 1 / 32;

/** Floating-point slack for placement comparisons, inches. */
export const PLACEMENT_EPS = 1e-6;

/** Grid an element snaps to while dragged (moved) in the elevation, inches. */
export const DRAG_SNAP_IN = 1 / 4;

/** Resizing snaps coarser — to whole inches — since cabinet widths are sized in
 *  inches, not sixteenths. */
export const RESIZE_SNAP_IN = 1;

/** A workbench wider than this needs extra mid-span bracing (a centre leg or
 *  apron stretchers). */
export const WORKBENCH_SUPPORT_WIDTH_IN = 48;

/** Height of a workbench drawer bank slung under the worktop, inches. */
export const WORKBENCH_DRAWER_BANK_H = 6;

/** Heuristic: one workbench drawer per this many inches of width (min one). */
export const WORKBENCH_DRAWER_PITCH_IN = 24;

/** Number of drawers a workbench drawer bank gets for a given width. */
export function workbenchDrawerCount(widthIn: number): number {
  return Math.max(1, Math.round(widthIn / WORKBENCH_DRAWER_PITCH_IN));
}

/** System 32: euro shelf-pin holes step 32 mm. Shelves snap to this pitch when
 *  dragged so adjustable shelves land on real boring positions. */
export const SYSTEM_32_IN = 32 / MM_PER_INCH; // ≈ 1.2598"

/** Standard drawer slide lengths (inches). */
export const SLIDE_LENGTHS = [10, 12, 14, 16, 18, 20, 22, 24] as const;

/** Standard frameless cabinet widths (inches) offered as one-click presets. */
export const CABINET_WIDTH_PRESETS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48] as const;

/** One-click common sizes for the various inch inputs (inches). */
export const DEPTH_PRESETS = [12, 13, 15, 18, 21, 24] as const;
export const UPPER_HEIGHT_PRESETS = [12, 15, 18, 24, 30, 36, 42] as const;
export const CEILING_GAP_PRESETS = [0, 1, 1.5, 2, 3, 6] as const;
// Desk (29–30") / ADA (34") / standard counter (36) / tall (38) / bar (42).
export const COUNTER_HEIGHT_PRESETS = [29, 30, 34, 36, 38, 42] as const;
export const DRAWER_HEIGHT_PRESETS = [4, 5, 6, 8, 10, 12] as const;

/**
 * Best-practice single-vs-pair door split: a frameless door wider than this gets
 * two leaves (a single door past ~24" sags and needs too much swing clearance).
 */
export const DOUBLE_DOOR_MIN_WIDTH = 24;

/** Project-wide drawer construction defaults. */
export const DEFAULT_DRAWER_JOINT: DrawerJoint = 'dadoScrew';
export const DEFAULT_SLIDE_TYPE: SlideType = 'side';
export const DEFAULT_BACK_STYLE: BackStyle = 'panel';

/** Project-wide default pulls; an unset opening handle falls back to these. */
export const DEFAULT_DRAWER_HANDLE: HandleType = 'pull';
export const DEFAULT_DOOR_HANDLE: HandleType = 'pull';

/** Largest standard slide length that fits within the given clearance depth. */
export function standardSlideLength(maxDepthIn: number): number {
  let best: number = SLIDE_LENGTHS[0];
  for (const l of SLIDE_LENGTHS) if (l <= maxDepthIn) best = l;
  return best;
}

/** Number of euro hinges by door height (inches). */
export function hingeCountForDoorHeight(heightIn: number): number {
  if (heightIn <= 35) return 2;
  if (heightIn <= 60) return 3;
  if (heightIn <= 79) return 4;
  return 5;
}
