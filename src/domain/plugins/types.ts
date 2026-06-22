/**
 * Plugin contracts for Cabinetmaker's modular engine.
 *
 * Extension axes — front types (drawer/door/…), door/face styles (slab/shaker/…),
 * fixtures (dishwasher/range/…), handles, and cabinet add-ons (under-cabinet LED,
 * accessories) — are all registered through these interfaces. Built-ins implement
 * them just like a third-party plugin would; the core engine only ever talks to
 * the registry.
 *
 * This module is pure types (no runtime code), so it never participates in a
 * runtime import cycle even though it references the assembly/geometry types.
 */
import type {
  Cabinet,
  Construction,
  FixtureConfig,
  HandleType,
  Material,
  Node3D,
  Opening,
  Part,
  Project,
  ProjectDefaults,
  RunKind,
  Wall,
  WallElement,
} from '../types';
import type { BuildContext, PartFactory } from '../geometry/context';
import type { FrontLayoutItem } from '../geometry/fronts';
import type { AssemblyStep } from '../assembly/steps';
import type { ShoppingItem } from '../shopping/buildShoppingList';
import type { WallMetrics } from '../geometry/metrics';

/** One choice in a select/segmented plugin field. */
export interface PluginFieldOption {
  value: string;
  label: string;
}

/** Context a field's dynamic options/visibility receive so they can react to siblings. */
export interface PluginFieldContext {
  /** Read the current value of any field target on this instance. */
  get: (target: string) => unknown;
  /** The cabinet slot the instance lives in (front types), when relevant. */
  slot?: RunKind;
  /** This front's position in the cabinet's stack (front types), when relevant. */
  position?: { index: number; count: number };
}

/**
 * A declarative control the Inspector renders for a component's per-instance
 * config. `target` names where the value lives:
 *  - a known core field of the host instance (e.g. 'doorCount', 'handle',
 *    'slideLen', 'shelves', 'doorStyle' for openings; 'frontPanel' for fixtures), or
 *  - 'setting:<key>' for the plugin's own settings bag (Opening.settings, …).
 * This replaces the old fixed `ui`/`panels` flags: a plugin lists exactly the
 * controls it wants and the Inspector renders them generically.
 */
export interface PluginField {
  target: string;
  label: string;
  kind: 'number' | 'toggle' | 'segmented' | 'select';
  /** Choices for select/segmented; a function is re-evaluated each render. */
  options?: PluginFieldOption[] | ((ctx: PluginFieldContext) => PluginFieldOption[]);
  /** number bounds/step. */
  min?: number;
  max?: number;
  step?: number;
  /** Value shown when the instance hasn't set one (engine defaults live elsewhere). */
  default?: string | number | boolean;
  /** Control width in px (to match the compact Inspector controls). */
  width?: number;
  /** Render only when this predicate holds (e.g. hinge side only for single doors). */
  visibleWhen?: (ctx: PluginFieldContext) => boolean;
}

/** What a front-type command applies: replace the cabinet's fronts, or patch this one. */
export type FrontCommandResult = { front: Opening[] } | { opening: Partial<Opening> };

/** Inputs a front-type command receives so it can compute a layout suggestion. */
export interface FrontCommandContext {
  opening: Opening;
  cabinet: Cabinet;
  /** Outer carcass width of the host cabinet. */
  widthIn: number;
  /** Carcass height available to fill. */
  carcassHeightIn: number;
  /** Carcass depth. */
  depthIn: number;
  defaults: ProjectDefaults;
  /** Mint a unique id for any new openings the command emits. */
  newId: (prefix: string) => string;
}

/** A button the Inspector shows that computes a layout suggestion / transform. */
export interface FrontCommand {
  id: string;
  label: string;
  /** One-line hint. */
  description?: string;
  run: (ctx: FrontCommandContext) => FrontCommandResult;
}

/** Hardware a single front contributes to the project tally. */
export interface FrontTypeHardware {
  hinges: number;
  slidePairs: number;
  pulls: number;
  pushLatches: number;
}

/** Inputs a front-type builder receives for one opening. */
export interface FrontTypeContext {
  ctx: BuildContext;
  f: PartFactory;
  item: FrontLayoutItem;
  /** 1-based ordinal among fronts of this same type in the cabinet (DR1, DOOR2…). */
  ordinal: number;
}

/** Context for a front type's assembly-step contribution. */
export interface FrontTypeStepContext {
  /** The host cabinet — lets steps inspect sibling fronts (e.g. shared dividers). */
  cabinet: Cabinet;
  item: FrontLayoutItem;
  ordinal: number;
  /** Cabinet index used in part ids (C1, C2…). */
  index: number;
  c: Required<Construction>;
  defaults: ProjectDefaults;
  /** Carcass depth (inches) — lets steps resolve slide lengths exactly like `build`. */
  depthIn: number;
  /** Cabinet width (inches) — lets steps recompute interior dims exactly like `build`. */
  widthIn: number;
}

/**
 * A kind of cabinet front. Replaces the hard-coded opening switch: each built-in
 * (drawer, door, fixed, falseFront) is one of these, and plugins add more.
 */
export interface FrontTypeDef {
  /** Stable id stored on `Opening.type`. */
  id: string;
  /** Inspector label. */
  label: string;
  /** Declarative per-front controls the Inspector renders (replaces the old ui flags). */
  fields?: PluginField[];
  /** Suggest/transform commands offered as buttons under the front's controls. */
  commands?: FrontCommand[];
  /**
   * How an instance of this front opens — used to bucket it for assembly figures
   * (DR… vs DOOR… part ids) and the viewer. Unset ⇒ treated as a door.
   */
  opens?: 'drawer' | 'door';
  /** Show this type in the Inspector's "front type" dropdown (default true). */
  selectable?: boolean;
  /** Adjustable shelves live behind this front (door/fixed). */
  hostsShelves?: boolean;
  /** Emit this opening's parts + 3D nodes; return the hardware it needs. */
  build(c: FrontTypeContext): FrontTypeHardware;
  /** Assembly-step contribution, mirroring `build`. */
  steps?(c: FrontTypeStepContext): AssemblyStep[];
}

/** Geometry handed to a door-style renderer (already computed by buildFace). */
export interface DoorStyleContext {
  ctx: BuildContext;
  f: PartFactory;
  item: FrontLayoutItem;
  partId: string;
  label: string;
  leaves: 1 | 2;
  /** Single-face width, or per-leaf width for a pair. */
  faceW: number;
  /** Face height including any handle extension. */
  faceHeight: number;
  /** Centre gap between the two leaves of a pair (0 for one). */
  gap: number;
  /** Vertical centre of the face. */
  cy: number;
  /** Cabinet width/depth and face thickness (cabinet-local frame). */
  W: number;
  D: number;
  tf: number;
  faceMaterialId: string;
  faceColor: string;
  faceTexture?: string;
  /** Combined shop note (hinge + handle) to attach to the primary face part. */
  note?: string;
  /** Emit a node already tagged with the correct leaf open-group. */
  emit: (n: Node3D) => void;
}

/**
 * How a face looks and is cut: 'slab' (one panel, the default) or a
 * frame-and-panel style like 'shaker'. Plugins register their own.
 */
export interface DoorStyleDef {
  id: string;
  label: string;
  buildFace(c: DoorStyleContext): void;
}

/** Where a fixture sits vertically. */
export type FixtureZone = 'base' | 'upper' | 'tall';

/**
 * A primitive a fixture draws into its 2D elevation footprint so the layout
 * editor can show a recognisable appliance (oven window, fridge doors, washer
 * porthole, …) instead of a plain box. Pure data — coordinates are world inches
 * (x from the wall's left end, y up from the floor) and `className` selects the
 * stroke/fill from the elevation stylesheet — so the domain stays React-free and
 * the editor renders the shapes generically.
 */
export type ElevationShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; className?: string; rx?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; className?: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; className?: string }
  | { kind: 'polygon'; points: [number, number][]; className?: string };

/** Inputs a fixture's 2D elevation preview receives (its drawn footprint, world inches). */
export interface FixtureElevationContext {
  element: WallElement;
  config?: FixtureConfig;
  /** Footprint left edge, inches from the wall's left end. */
  x: number;
  /** Footprint bottom, inches up from the floor. */
  y: number;
  /** Footprint width / height, inches. */
  w: number;
  h: number;
}

/** Inputs for a fixture's vertical-occupancy query (`occupiedHeightIn`). */
export interface FixtureOccupancyContext {
  element: WallElement;
  config?: FixtureConfig;
  metrics: WallMetrics;
}

/** Inputs a fixture receives when placed into the wall scene. */
export interface FixturePlaceContext {
  /** The wall element hosting this fixture (it may also carry a cabinet). */
  element: WallElement;
  project: Project;
  /** Push parts/nodes here (world placement is applied by buildProject). */
  add: (part: Part) => void;
  node: (n: Node3D) => void;
  /** x of the element's left edge (wall-local). */
  x0: number;
  /** The element's footprint width. */
  widthIn: number;
  /** The element's per-instance fixture config (panels, height override, …). */
  config?: FixtureConfig;
  metrics: WallMetrics;
  /** Stable id base for emitted parts, e.g. `APP{shortId(element.id)}`. */
  idBase: string;
}

/**
 * An appliance / fixture that reserves element width and (optionally) emits
 * panels and shopping line items. It may stand alone in an element or be
 * integrated alongside a cabinet. Built-ins: dishwasher, range, hood, fridge.
 */
export interface FixtureDef {
  id: string;
  label: string;
  zone: FixtureZone;
  /**
   * May this fixture be integrated alongside a cabinet/workbench in the same
   * element (both set), rather than standing alone? Only drop-in fixtures that
   * genuinely share their section with a carcass — e.g. a cooktop over a base
   * cabinet — set this. Full appliances (dishwasher, range, hood, fridge) own
   * their whole section: leave it falsy and the editor keeps them standalone
   * (selecting one clears the cabinet/workbench, and vice-versa).
   */
  integratable?: boolean;
  /**
   * May the user add this as a standalone appliance section from the elevation
   * picker / Model list? Defaults true. Set false for fixtures that only make
   * sense as part of something else (e.g. an LED strip belongs on a cabinet as an
   * add-on, not as a top "appliance" by itself).
   */
  selectable?: boolean;
  /** Width the Inspector seeds when this fixture is chosen. */
  defaultWidthIn: number;
  /**
   * Standard footprint widths (inches) this appliance ships in. When set, the
   * editor offers them as the size and snaps a *locked* element to the nearest
   * one — appliances come in fixed sizes even though the opening is resizable.
   */
  standardWidthsIn?: number[];
  /** Does the merged countertop pass over this fixture, or break at it? */
  countertop: 'pass' | 'break';
  /**
   * A `tall` fixture that doesn't reach the ceiling — a refrigerator — frees the
   * upper band above its body for a separate upper cabinet. A tall *cabinet*
   * (pantry) runs full height and never sets this. Pair it with `occupiedHeightIn`
   * so the editor knows how tall the body actually is.
   */
  freesUpperBand?: boolean;
  /**
   * The height (floor → top, inches) this fixture's body occupies, for fixtures
   * that don't fill their band (a fridge). Bounds the 2D ghost and lets the
   * validator check the band above is genuinely clear. Omit to fill the band.
   */
  occupiedHeightIn?(c: FixtureOccupancyContext): number;
  /**
   * The counter-height window (floor → counter surface, inches) a standard unit of
   * this fixture needs to fit/align. When set, the validator warns if the project
   * counter height falls outside it (e.g. a counter too low for a dishwasher).
   */
  counterHeightRangeIn?: [min: number, max: number];
  /**
   * Ventilation role, for the missing-hood sanity check: a cooking surface
   * (`'cooktop'` — a range or drop-in cooktop) wants an extraction `'hood'`
   * fixture overlapping it in x on the same wall; the validator warns when none
   * does. Leave unset for fixtures with no part in kitchen ventilation.
   */
  vent?: 'cooktop' | 'hood';
  /**
   * Declarative per-fixture controls the Inspector renders (replaces the old
   * `panels` flags). Built-in panel toggles bind to FixtureConfig fields
   * ('frontPanel', 'sidePanels', 'overheadPanel'); plugins can add 'setting:<key>'.
   */
  fields?: PluginField[];
  /** Emit the appliance volume + any panel parts/nodes. */
  place(c: FixturePlaceContext): void;
  /**
   * Optional 2D schematic for the elevation editor — doors, burners, a washer
   * porthole, …. Returns pure shape data (no React) the editor draws over the
   * appliance footprint; omit it to fall back to the plain unit + centre seam.
   */
  elevation?(c: FixtureElevationContext): ElevationShape[];
  /** Clearance/placement validation messages for the Inspector. */
  validate?(element: WallElement, neighbors: { left?: WallElement; right?: WallElement }): string[];
}

/** A registry wrapper over a handle behaviour (pull, push latch, …). */
export interface HandleVizInput {
  opening: Opening;
  leaves: 1 | 2;
  W: number;
  D: number;
  tf: number;
  cy: number;
  faceHeight: number;
  faceW: number;
  gap: number;
}

export interface HandleDef {
  id: HandleType;
  label: string;
  /** Front types this handle is offered for in the Inspector. */
  appliesTo: ('drawer' | 'door')[];
  hardware(leaves: number): { pulls: number; pushLatches: number };
  /** Extra face length the handle adds (edge pull), else 0. */
  faceExtensionIn(): number;
  note(opening: Opening): string | undefined;
  nodes(inp: HandleVizInput): Node3D[];
}

/** Inputs a cabinet add-on receives to augment a freshly built cabinet. */
export interface CabinetAddonContext {
  ctx: BuildContext;
  /** Add NEW parts/nodes (cabinetId is stamped on for you). */
  f: PartFactory;
  /**
   * The cabinet's parts built so far (carcass + fronts). Mutable: an add-on may
   * push new parts (prefer `f.add`) or tweak an existing one — e.g. add a
   * 'groove' joinery + note to the bottom panel to record a routed dado.
   */
  parts: Part[];
  /** The cabinet's 3D nodes built so far. Mutable; push add-on models here. */
  nodes: Node3D[];
}

/** Context for a cabinet add-on's assembly-step contribution. */
export interface CabinetAddonStepContext {
  cabinet: Cabinet;
  slot: RunKind;
  /** Cabinet index used in part ids (C1, C2…). */
  index: number;
  c: Required<Construction>;
  defaults: ProjectDefaults;
}

/** Context for a cabinet add-on's shopping contribution (one cabinet instance). */
export interface CabinetAddonShoppingContext {
  cabinet: Cabinet;
  project: Project;
}

/**
 * Axis 5 — an optional cabinet ADD-ON / accessory that layers extra parts, 3D
 * models and plan steps onto a cabinet without changing its core construction:
 * under-cabinet lighting, wire grommets, pull-out trays, charging docks, … A
 * cabinet opts in by listing the add-on id in `Cabinet.addons`; the Inspector
 * surfaces every registered add-on (filtered by `slots`) as a checkbox, and the
 * whole pipeline (geometry, cut list, assembly, shopping) picks it up with no
 * core edits — exactly like the other axes.
 */
export interface CabinetAddonDef {
  /** Stable id stored in `Cabinet.addons`. */
  id: string;
  /** Inspector checkbox label. */
  label: string;
  /** One-line Inspector description / hint. */
  description?: string;
  /** Run kinds this add-on is offered for (Inspector filter); unset ⇒ all. */
  slots?: RunKind[];
  /**
   * Declarative controls shown under the add-on's checkbox when it's enabled.
   * Built-in add-ons store config in `Cabinet.addonSettings[id]`, so fields use
   * 'setting:<key>' targets; `apply` reads them off `ctx.cabinet.addonSettings`.
   */
  fields?: PluginField[];
  /** Layer parts/nodes onto the built cabinet (and tweak existing parts). */
  apply(c: CabinetAddonContext): void;
  /** Assembly-step contribution, mirroring `apply`. */
  steps?(c: CabinetAddonStepContext): AssemblyStep[];
  /** Shopping-list lines for each cabinet carrying this add-on. */
  shopping?(c: CabinetAddonShoppingContext): ShoppingItem[];
  /** Department the shopping lines group under (default 'Add-ons'). */
  shoppingSection?: string;
}

/** Inputs a selection command receives: the elements selected together on one wall. */
export interface SelectionCommandContext {
  /** The selected elements (≥1), all on `wall`, sorted left→right by `xIn`. */
  elements: WallElement[];
  /** The wall the selection lives on. */
  wall: Wall;
  project: Project;
  defaults: ProjectDefaults;
}

/**
 * What a selection command applies: a per-element patch keyed by element id.
 * `xIn`/`widthIn` are snapped + width-clamped by the store; any other field is
 * assigned as-is (so a future command can set `heightOverrideIn`, swap a
 * `cabinet`, …). Elements the command omits are left untouched.
 */
export interface SelectionCommandResult {
  elements?: { id: string; patch: Partial<WallElement> }[];
}

/**
 * Axis 6 — a bulk operation offered when several wall elements are selected at
 * once (the elevation editor's multi-select toolbar). It reads the whole
 * selection and returns per-element patches: the built-in `spread-evenly`
 * redistributes their gaps, and a plugin can add more — assign a shared
 * height/depth, copy one section's front layout across the set, align widths, …
 * Registered + listed like every other axis, so the editor surfaces it as a
 * toolbar button with no core edits.
 */
export interface SelectionCommandDef {
  /** Stable id (used by the store to look the command up). */
  id: string;
  /** Toolbar button label. */
  label: string;
  /** One-line hint shown as the button's tooltip. */
  description?: string;
  /** Fewest selected elements this command needs to be offered (default 2). */
  minElements?: number;
  /** Offer the command only when this holds for the current selection (default: always). */
  enabledFor?: (ctx: SelectionCommandContext) => boolean;
  /** Compute the per-element patches to apply to the selection. */
  run: (ctx: SelectionCommandContext) => SelectionCommandResult;
}

/** A bundle a plugin registers — any subset of the axes. */
export interface CabinetmakerPlugin {
  id: string;
  frontTypes?: FrontTypeDef[];
  doorStyles?: DoorStyleDef[];
  fixtures?: FixtureDef[];
  handles?: HandleDef[];
  /** Cabinet add-ons / accessories (Axis 5). */
  cabinetAddons?: CabinetAddonDef[];
  /** Multi-select bulk commands (Axis 6). */
  selectionCommands?: SelectionCommandDef[];
}

// Re-export commonly used shapes so plugin authors import from one place.
export type { Material };
