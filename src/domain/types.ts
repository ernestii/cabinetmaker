/**
 * Core domain model for Cabinetmaker.
 *
 * Hierarchy: Project -> Room -> Wall -> WallElement -> Cabinet -> Opening
 * A Wall is a free-form list of positioned WallElements; geometry generation
 * turns each element's Cabinet/fixture into Parts (cut list units) + 3D nodes.
 */

export type Units = 'in';

/** Vertical role of a cabinet; drives carcass construction. */
export type RunKind = 'base' | 'upper' | 'tall' | 'workbench';

/**
 * Vertical band a wall element occupies:
 *  - base:  stands on legs, floor to the underside of the countertop.
 *  - upper: hangs below the ceiling (no legs / counter).
 *  - tall:  a single full-height column, floor to ceiling.
 * The band sets a cabinet's carcass height and where a fixture is drawn; the
 * base and upper bands are independent, so nothing has to line up vertically.
 */
export type Zone = 'base' | 'upper' | 'tall';

/** Per-instance configuration for an appliance/fixture. */
export interface FixtureConfig {
  /** Add a cabinet-front panel over the appliance (dishwasher / fridge). */
  frontPanel?: boolean;
  /** Add finished-end side panels (fridge gables). */
  sidePanels?: boolean;
  /** Add an overhead gable/soffit panel (fridge). */
  overheadPanel?: boolean;
  /** Override the fixture mount/box height. */
  heightIn?: number;
  /** Override the fixture depth. */
  depthOverrideIn?: number;
  /**
   * Lock the element width to the fixture's standard sizes — appliances ship in
   * fixed widths. When set (default for fixtures that declare
   * `FixtureDef.standardWidthsIn`), the editor snaps resizes to those sizes.
   */
  widthLocked?: boolean;
  /** Plugin-owned per-fixture configuration (keyed by the fixture's setting keys). */
  settings?: Record<string, unknown>;
}

/**
 * One positioned section of a wall. The wall is a free-form list of these, so
 * the base row and the upper row are independent — nothing forces a cabinet
 * above to align with the one below. An element may carry any combination of:
 *  - a `cabinet` (a carcass with fronts),
 *  - a `fixture` (an appliance, via a registered plugin id), and/or
 *  - `workbench` (a countertop on legs, no carcass).
 * The combinations cover every section kind: a plain cabinet, a standalone
 * appliance, a cabinet with an integrated appliance (both set), a workbench, or
 * empty (none set, just reserved width). Anything more exotic comes from the
 * plugin system via `fixtureId`.
 */
export interface WallElement {
  id: string;
  /** Left edge offset from the wall's left end, inches. */
  xIn: number;
  /** Footprint width along the wall, inches. */
  widthIn: number;
  /** Which vertical band the element sits in. */
  zone: Zone;
  /** A carcass cabinet (box + fronts), when this element has one. */
  cabinet?: Cabinet;
  /** A countertop-on-legs element (no carcass). */
  workbench?: boolean;
  /** How a workbench is braced under the top: legs (default), apron stretchers,
   *  a bank of drawers, or none (carried entirely by the cabinets it abuts). */
  workbenchSupport?: 'none' | 'legs' | 'stretchers' | 'drawer';
  /** Height of the workbench drawer bank, inches (drawer support only). */
  workbenchDrawerHeightIn?: number;
  /** An appliance/fixture occupying — or integrated into — this element. */
  fixtureId?: string;
  /** Per-instance fixture options (panels, size lock, height override, …). */
  fixture?: FixtureConfig;
  /** Override the zone's default carcass/fixture depth. */
  depthOverrideIn?: number;
  /** Override the element height (upper-zone cabinet height, or a fixture height). */
  heightOverrideIn?: number;
  /**
   * Gap from the ceiling to the TOP of this element, inches — a per-element
   * override of the run's ceiling clearance. An `upper` hangs this far below the
   * ceiling (overrides `ProjectDefaults.upperCeilingGapIn`); a `tall` column is
   * shortened from the top by this much (default 0 = runs to the ceiling). Use
   * it to drop specific cabinets below an obstruction — e.g. garage-door rails.
   */
  ceilingGapOverrideIn?: number;
}

/**
 * Built-in front kinds. `OpeningType` is widened so plugins can register their
 * own ids while these keep autocompletion. An unknown id degrades to 'fixed'.
 */
export type BuiltinOpeningType = 'drawer' | 'door' | 'fixed' | 'falseFront';
export type OpeningType = BuiltinOpeningType | (string & Record<never, never>);

/**
 * How a front is opened. Drives the hardware tally, the cut list, and the 3D viz:
 *  - pull:         a knob or bar pull you buy and screw on (counts as a pull).
 *  - routerCutout: a finger pull routed into the face's top edge (drawers).
 *                  No hardware — "free" — and shown as a recess in 3D.
 *  - pushLatch:    a push-to-open / touch latch (doors). No pull; a latch each.
 *  - edgePull:     the face is run past the carcass bottom to form a finger lip
 *                  (doors). The extension is part of the face, so it grows the
 *                  cut-list dimensions. No hardware.
 */
export type HandleType = 'pull' | 'routerCutout' | 'pushLatch' | 'edgePull';

/** Drawer-box corner joint: a dado (glue only) or a dado reinforced with screws. */
export type DrawerJoint = 'dado' | 'dadoScrew';

/** Drawer slide mounting style; drives box clearance and depth rules. */
export type SlideType = 'side' | 'under';

/** A vertical slice of a cabinet front: one or more drawers, a door, etc. */
export interface Opening {
  id: string;
  type: OpeningType;
  /** Front height in inches, or 'auto' to share the leftover height evenly. */
  heightIn: number | 'auto';
  /** Doors only: 1 = single, 2 = pair. */
  doorCount?: 1 | 2;
  /** Door hinge side for single doors. */
  hingeSide?: 'left' | 'right';
  drawer?: {
    slideLenIn: number;
    /** Override box height; defaults to derive from face height. */
    boxHeightIn?: number;
  };
  /** Adjustable shelves inside this opening (door / fixed openings only). */
  shelves?: number;
  /**
   * Custom shelf heights, inches up from the opening's bottom, one per shelf
   * (ascending). Unset ⇒ shelves are spaced evenly. Drag a shelf in the elevation
   * to set these; they reposition the 3D shelves but don't change cut dimensions.
   */
  shelfOffsetsIn?: number[];
  /** How the front opens (knob, routed cutout, push latch, edge pull). Defaults to 'pull'. */
  handle?: HandleType;
  /**
   * Door/face style id resolved against the door-style registry (e.g. 'slab',
   * 'shaker'). Unset ⇒ 'slab', so existing projects render unchanged.
   */
  doorStyle?: string;
  /**
   * Plugin-owned per-front configuration, keyed by the plugin's own setting keys
   * (e.g. a gridfinity drawer's bin pitch). The core engine never reads this; a
   * front-type plugin declares the fields that read/write it. Unknown keys are
   * ignored, so a project stays valid if a plugin is removed.
   */
  settings?: Record<string, unknown>;
}

export type TopStyle = 'stretchers' | 'full';

/** Cabinet back: a full inset panel, or top+bottom hanging rails (saves ply). */
export type BackStyle = 'panel' | 'rails';

/** Per-cabinet construction overrides; unset values fall back to project defaults. */
export interface Construction {
  carcassThicknessIn?: number;
  backThicknessIn?: number;
  drawerThicknessIn?: number;
  drawerBottomThicknessIn?: number;
  faceThicknessIn?: number;
  topStyle?: TopStyle;
  stretcherWidthIn?: number;
  /** Cabinet back construction. */
  backStyle?: BackStyle;
  /** Drawer-box corner joint. */
  drawerJoint?: DrawerJoint;
  /** Drawer slide mounting style. */
  slideType?: SlideType;
  /** Depth of the dado that captures the front/back into the sides. */
  dadoDepthIn?: number;
}

export interface Cabinet {
  id: string;
  /** Outer carcass width. */
  widthIn: number;
  /** Override the run depth for this cabinet. */
  depthOverrideIn?: number;
  /** Vertical stack of fronts, top → bottom. */
  front: Opening[];
  /**
   * Sides that are exposed/visible (e.g. the end of a run) and so are cut from
   * finished 'face' stock instead of hidden carcass ply. Empty/omitted = both
   * sides hidden (the usual mid-run case).
   */
  exposedSides?: ('left' | 'right')[];
  construction?: Construction;
  /**
   * Opt-in cabinet add-ons / accessories layered onto this cabinet by id
   * (under-cabinet LED, wire grommets, pull-out trays, …). Each id resolves
   * against the cabinet-add-on registry; unknown ids are ignored. The add-on
   * augments the 3D model and the plan (cut list / assembly / shopping).
   */
  addons?: string[];
  /**
   * Plugin-owned per-add-on configuration, keyed by add-on id then by the
   * add-on's own setting keys (e.g. an LED add-on's colour temperature).
   */
  addonSettings?: Record<string, Record<string, unknown>>;
}

export interface Wall {
  id: string;
  name: string;
  lengthIn: number;
  ceilingHeightIn: number;
  /** Wall paint colour (hex). Drives the elevation backdrop + the 3D wall plane; unset = default. */
  color?: string;
  /** Positioned sections of this wall, left to right (free-form; may overlap/gap). */
  elements: WallElement[];
  /**
   * Corner angle at the junction with the previous wall, in degrees. 0 keeps
   * the run straight; +90 turns into the room (an L), etc. Ignored for the
   * first wall. Walls connect end-to-end so the chain forms the room outline.
   */
  turnDeg?: number;
}

export interface Room {
  id: string;
  name: string;
  walls: Wall[];
}

export type MaterialRole = 'carcass' | 'drawer' | 'drawerBottom' | 'back' | 'face' | 'counter' | 'toekick';

export interface Material {
  id: string;
  name: string;
  thicknessIn: number;
  color: string;
  textureUrl?: string;
  sheetW: number;
  sheetH: number;
  kerfIn: number;
  /** Trimmed off each sheet edge to square up the factory edge before nesting. */
  edgeTrimIn?: number;
  /** Grain direction matters → parts can't freely rotate when nesting. */
  grained: boolean;
  /** One sheet stock can serve several part roles (e.g. drawer + back + bottom). */
  roles: MaterialRole[];
  /** Cost of one full sheet (or, for a countertop, one slab), for the estimate. */
  pricePerSheet?: number;
  /** Catalog product this stock was picked from (for the shopping list link). */
  productId?: string;
  /** Retailer the catalog product comes from, e.g. "Home Depot". */
  store?: string;
  /** Manufacturer model / internet number, shown on the shopping list. */
  sku?: string;
}

/** Per-piece hardware prices for the cost estimate. */
export interface Pricing {
  hingeEach: number;
  slidePairEach: number;
  pullEach: number;
  /** Push-to-open / touch latch, each. */
  pushLatchEach: number;
  /** Bought adjustable workbench leg (IKEA-style pole), each. */
  legEach: number;
  /** Edge banding sold by the roll, priced per 100 linear feet. */
  edgeBandingPer100Ft: number;
  /** Shop labour rate; 0/unset shows the time estimate without a cost. */
  laborPerHour?: number;
}

export interface ProjectDefaults {
  counterHeightIn: number;
  baseDepthIn: number;
  upperDepthIn: number;
  tallDepthIn: number;
  /** Default upper-cabinet height and gap from the ceiling. */
  upperHeightIn: number;
  upperCeilingGapIn: number;
  legHeightIn: number;
  counterThicknessIn: number;
  /** Countertop depth; falls back to base depth + overhang when unset. */
  counterDepthIn?: number;
  topStyle: TopStyle;
  /** Project-wide cabinet back construction (per-cabinet can override). */
  backStyle: BackStyle;
  /** Project-wide drawer-box joint (per-cabinet construction can override). */
  drawerJoint: DrawerJoint;
  /** Project-wide drawer slide style (per-cabinet construction can override). */
  slideType: SlideType;
  /** Project-wide dado depth for drawer-box joints. */
  dadoDepthIn: number;
  /** Default drawer pull/handle (per-opening can override). */
  drawerHandle: HandleType;
  /** Default door pull/handle (per-opening can override). */
  doorHandle: HandleType;
  /** Cut list: force guillotine (straight-through) nesting even if it costs sheets. */
  straightCuts?: boolean;
  /**
   * Generate countertops over base/workbench runs. Defaults to on; when off,
   * no countertop slab is built, priced, or shown in the cut list. (Undefined is
   * treated as on so older saved projects keep their counters.)
   */
  countertopEnabled?: boolean;
}

export interface Project {
  id: string;
  name: string;
  units: Units;
  rooms: Room[];
  materials: Material[];
  defaults: ProjectDefaults;
  pricing?: Pricing;
}

// ---------- Generated geometry ----------

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export type Joinery = 'pocket' | 'dowel' | 'glue' | 'screw' | 'groove' | 'dado';

/**
 * Tags the nodes that make up one openable front (a drawer or a door leaf) so
 * the viewer can animate them together when clicked. Every node sharing an `id`
 * moves as one unit.
 */
export interface NodeOpen {
  /** Stable group id; all nodes with this id open/close together. */
  id: string;
  /** A drawer slides out; a door swings on a hinge. */
  kind: 'drawer' | 'door';
  /** Drawer: how far it slides toward the room, in inches. */
  travel?: number;
  /** Door: the vertical hinge axis passes through this point [x, y, z]. */
  pivot?: [number, number, number];
  /** Door: swing direction (+1 / -1) so the free edge opens into the room. */
  swing?: 1 | -1;
}

/** A 3D box placed in world space (inches). Used by the viewer. */
export interface Node3D {
  /** Center position [x, y, z]. */
  pos: [number, number, number];
  /** Box size [x, y, z]. */
  size: [number, number, number];
  color: string;
  textureUrl?: string;
  kind: 'panel' | 'back' | 'face' | 'counter' | 'toekick' | 'leg' | 'drawerBox' | 'handle' | 'wall' | 'ceiling' | 'appliance' | 'light';
  /**
   * Non-box silhouette for the viewer. 'fingerPull' renders a rounded trapezoid
   * (IKEA Alex–style routed pull) extruded to `size[2]`; 'cylinder' a round prism
   * along `axis` fitted into the box (burner discs, bar handles, portholes);
   * 'frustum' a flat-shaded tapered box (hood canopy). Unset renders a box.
   */
  shape?: 'fingerPull' | 'cylinder' | 'frustum';
  /** Cylinder axis (default 'y'). 'z' faces the room (porthole/knob), 'x' runs along the wall (bar handle). */
  axis?: 'x' | 'y' | 'z';
  /** Frustum: top-face footprint relative to the base (0..1], e.g. 0.45 for a hood canopy. */
  topScale?: number;
  /**
   * Surface finish hint for the viewer's PBR material: brushed 'steel', smoked
   * 'glass', warm 'enamel'. Unset keeps the default matte panel look.
   */
  finish?: 'steel' | 'glass' | 'enamel';
  /** Y-axis rotation (radians) when the box sits on an angled wall. */
  rotY?: number;
  /** Set when this node belongs to a drawer/door that the viewer can open. */
  open?: NodeOpen;
  /**
   * Selection identity for the viewer. `ownerId` is the WallElement this node
   * belongs to (cabinet/appliance/workbench); `openingId` is the specific
   * front (drawer/door/…) when the node is part of one. Both let the 3D view
   * highlight the current store selection. Stamped by the build pipeline; pure
   * data, no React.
   */
  ownerId?: string;
  openingId?: string;
  /**
   * Cut-list Part this node is a piece of (e.g. 'C1-SIDE' — a qty-2 part tags
   * both panels). Lets the cut list point from a placed rectangle back into the
   * 3D model. Handle nodes ride with their face's part; bought/visual-only
   * nodes (legs, appliances) carry none.
   */
  partId?: string;
  /**
   * glTF model fitted into this node's box (auto-centred + uniformly scaled to
   * `size`). The box still defines the bounding volume; if the asset is missing
   * or fails to load, the viewer falls back to drawing the box.
   */
  modelUrl?: string;
  /** Extra Y rotation (radians) applied to the model, on top of `rotY`. */
  modelRotationY?: number;
  /** Emissive colour — makes the node glow (e.g. LED strips). */
  emissive?: string;
  /** Emissive strength (viewer defaults to ~1 when `emissive` is set). */
  emissiveIntensity?: number;
  /** Short label the viewer floats next to the node (e.g. gridfinity capacity). */
  badge?: string;
  /** Text the viewer shows in a floating tooltip while the pointer hovers this node. */
  tooltip?: string;
  /**
   * Id of a React overlay a plugin registered via `registerPluginUI` (UI layer).
   * The viewer renders that component at this node's position — the escape hatch
   * for interactive 3D overlays the static `badge`/`tooltip` can't express. Pure
   * data here (like `modelUrl`): the domain stays React-free.
   */
  overlayId?: string;
}

/** A flat rectangular part for the cut list. */
export interface Part {
  id: string;
  label: string;
  role: MaterialRole;
  cabinetId: string;
  materialId: string;
  thicknessIn: number;
  /** Width across grain. */
  wIn: number;
  /** Length along grain. */
  lIn: number;
  qty: number;
  /** Edges that need edge banding. */
  edgeBandEdges: Edge[];
  joinery: Joinery[];
  /** Free to rotate 90° when nesting (false when grain-locked). */
  grainLocked: boolean;
  notes?: string;
}

/** Euro hinges, drawer-slide pairs, pulls, push latches, and bought legs — tallied as geometry is built. */
export interface HardwareCounts {
  hinges: number;
  slidePairs: number;
  pulls: number;
  /** Push-to-open / touch latches (doors with a 'pushLatch' handle). */
  pushLatches: number;
  /** Bought adjustable workbench legs (IKEA-style poles — not fabricated). */
  legs: number;
}

/** Output of building one cabinet. */
export interface CabinetBuild {
  cabinetId: string;
  parts: Part[];
  nodes: Node3D[];
  hardware: HardwareCounts;
}
