import type { Cabinet, FixtureConfig, Material, MaterialRole, Opening, Project, ProjectDefaults, WallElement, Zone } from './types';
import { defaultDoorCount } from './elements';
import {
  DADO_DEPTH,
  DEFAULT_BACK_STYLE,
  DEFAULT_BASE_DEPTH,
  DEFAULT_COUNTER_HEIGHT,
  DEFAULT_DOOR_HANDLE,
  DEFAULT_DRAWER_HANDLE,
  DEFAULT_DRAWER_JOINT,
  DEFAULT_SLIDE_TYPE,
  DEFAULT_TALL_DEPTH,
  DEFAULT_UPPER_DEPTH,
  DEFAULT_UPPER_HEIGHT,
  LEG_HEIGHT,
  COUNTER_THICKNESS,
  DEFAULT_KERF,
  SHEET_W,
  SHEET_H,
} from './constants';

/**
 * A curated sheet-stock option offered in the new-project wizard. The wizard
 * (and `defaultMaterials`) turn a set of these into the project's Material list;
 * the shared sheet dimensions/kerf are stamped on at that point so the catalogue
 * stays focused on what actually distinguishes one stock from another.
 */
export interface SheetPreset {
  id: string;
  name: string;
  thicknessIn: number;
  color: string;
  textureUrl?: string;
  grained: boolean;
  roles: MaterialRole[];
  pricePerSheet: number;
  /** A one-line note shown under the option in the wizard. */
  hint: string;
  /** Selected out of the box for a fresh project. */
  preset?: boolean;
  /** Retailer, shown on the shopping list (defaults to Home Depot). */
  store?: string;
  /** Manufacturer model / internet number for the shopping list. */
  sku?: string;
}

/**
 * Sheet goods the wizard can seed a project with. The first material carrying a
 * role wins, so the default-selected stocks are ordered carcass → drawers/backs
 * → faces → counter → toekick. Extras below cover common alternatives.
 */
export const SHEET_PRESETS: SheetPreset[] = [
  { id: 'm-carcass', name: '3/4" Birch Ply', thicknessIn: 0.75, color: '#d8b886', textureUrl: 'birch', grained: true, roles: ['carcass'], pricePerSheet: 75, hint: 'Carcass boxes', preset: true, store: 'Home Depot', sku: 'PureBond 165921' },
  { id: 'm-half', name: '1/2" Birch Ply', thicknessIn: 0.5, color: '#e3c49a', textureUrl: 'birch', grained: true, roles: ['drawer', 'drawerBottom', 'back'], pricePerSheet: 55, hint: 'Drawer boxes + backs', preset: true, store: 'Home Depot', sku: 'PureBond 165911' },
  { id: 'm-face', name: '3/4" Oak Ply', thicknessIn: 0.75, color: '#c79a5e', textureUrl: 'oak', grained: true, roles: ['face'], pricePerSheet: 95, hint: 'Doors + drawer faces', preset: true, store: 'Home Depot', sku: 'Oak 4x8' },
  { id: 'm-counter', name: 'Black marble counter', thicknessIn: 1.5, color: '#26262b', textureUrl: 'marbleBlack', grained: false, roles: ['counter'], pricePerSheet: 120, hint: 'Countertops', preset: true, store: 'Home Depot', sku: 'Special order' },
  { id: 'm-toekick', name: '3/4" Toekick', thicknessIn: 0.75, color: '#4a4a4a', grained: false, roles: ['toekick'], pricePerSheet: 40, hint: 'Base toekicks', preset: true, store: 'Home Depot', sku: 'Sande 441908' },
  { id: 'm-maple', name: '3/4" Maple Ply', thicknessIn: 0.75, color: '#e8d3a8', textureUrl: 'birch', grained: true, roles: ['carcass'], pricePerSheet: 80, hint: 'Carcass — brighter than birch', store: 'Home Depot', sku: 'Maple 4x8' },
  { id: 'm-melamine', name: '3/4" White Melamine', thicknessIn: 0.75, color: '#f2f2f4', textureUrl: 'melamine', grained: false, roles: ['carcass'], pricePerSheet: 45, hint: 'Wipe-clean carcass; no grain', store: 'Home Depot', sku: 'Veranda 461877' },
  { id: 'm-mdf', name: '3/4" Paint-grade MDF', thicknessIn: 0.75, color: '#ededf0', textureUrl: 'melamine', grained: false, roles: ['face'], pricePerSheet: 50, hint: 'Faces for a painted finish', store: 'Home Depot', sku: 'ULTRASTOCK' },
  { id: 'm-walnut', name: '3/4" Walnut Ply', thicknessIn: 0.75, color: '#5b4332', textureUrl: 'walnut', grained: true, roles: ['face'], pricePerSheet: 140, hint: 'Premium dark faces', store: 'Home Depot', sku: 'Walnut 4x8' },
  { id: 'm-butcher', name: 'Butcher block counter', thicknessIn: 1.5, color: '#946a34', textureUrl: 'butcher', grained: true, roles: ['counter'], pricePerSheet: 90, hint: 'Warm wood countertop', store: 'Home Depot', sku: 'Hardwood Reflections BBCT1502598' },
  { id: 'm-marble-white', name: 'White marble counter', thicknessIn: 1.5, color: '#e8e8ec', textureUrl: 'marbleWhite', grained: false, roles: ['counter'], pricePerSheet: 130, hint: 'Light stone countertop', store: 'Home Depot', sku: 'Special order' },
];

/** Shared sheet dimensions/kerf stamped onto every wizard-built material. */
function sheetDims() {
  return { sheetW: SHEET_W, sheetH: SHEET_H, kerfIn: DEFAULT_KERF, edgeTrimIn: 0.25 };
}

/** Build the project Material list from a selection of sheet-preset ids (catalogue order). */
export function materialsFromPresets(ids: string[]): Material[] {
  const dims = sheetDims();
  return SHEET_PRESETS.filter((p) => ids.includes(p.id)).map((p) => ({
    id: p.id,
    name: p.name,
    thicknessIn: p.thicknessIn,
    color: p.color,
    textureUrl: p.textureUrl,
    grained: p.grained,
    roles: [...p.roles],
    pricePerSheet: p.pricePerSheet,
    store: p.store ?? 'Home Depot',
    sku: p.sku,
    ...dims,
  }));
}

/** Sheet-preset ids selected for a fresh project by default. */
export function defaultMaterialIds(): string[] {
  return SHEET_PRESETS.filter((p) => p.preset).map((p) => p.id);
}

/**
 * The stock a fresh project ships with: the preset-flagged sheet goods, with
 * store/SKU stamped on so the cost + shopping-list views show shoppable items
 * out of the box. Pick more (incl. butcher-block slab lengths) from the catalog
 * on the Materials tab.
 */
export function defaultMaterials(): Material[] {
  return materialsFromPresets(defaultMaterialIds());
}

export function defaultPricing() {
  return { hingeEach: 4.5, slidePairEach: 14, pullEach: 6, pushLatchEach: 3, legEach: 12, edgeBandingPer100Ft: 18, laborPerHour: 0 };
}

export function projectDefaults(): ProjectDefaults {
  return {
    counterHeightIn: DEFAULT_COUNTER_HEIGHT,
    baseDepthIn: DEFAULT_BASE_DEPTH,
    upperDepthIn: DEFAULT_UPPER_DEPTH,
    tallDepthIn: DEFAULT_TALL_DEPTH,
    upperHeightIn: DEFAULT_UPPER_HEIGHT,
    upperCeilingGapIn: 0,
    legHeightIn: LEG_HEIGHT,
    counterThicknessIn: COUNTER_THICKNESS,
    counterDepthIn: DEFAULT_BASE_DEPTH + 1.5,
    topStyle: 'stretchers',
    backStyle: DEFAULT_BACK_STYLE,
    drawerJoint: DEFAULT_DRAWER_JOINT,
    slideType: DEFAULT_SLIDE_TYPE,
    dadoDepthIn: DADO_DEPTH,
    drawerHandle: DEFAULT_DRAWER_HANDLE,
    doorHandle: DEFAULT_DOOR_HANDLE,
    countertopEnabled: true,
  };
}

let n = 0;
const sid = (p: string) => `${p}-${(n += 1)}`;

// ---------- element builders (free-form wall model) ----------

/** A vertical front in a cabinet (height defaults to 'auto'). */
function op(type: Opening['type'], extra: Partial<Opening> = {}): Opening {
  return { id: sid('op'), type, heightIn: 'auto', ...extra };
}
function cab(widthIn: number, front: Opening[], extra: Partial<Cabinet> = {}): Cabinet {
  return { id: sid('cab'), widthIn, front, ...extra };
}

/** A positioned section, used by the demo builders below. */
function baseEl(x: number, w: number, front: Opening[], extra: Partial<Cabinet> = {}): WallElement {
  return { id: sid('el'), xIn: x, widthIn: w, zone: 'base', cabinet: cab(w, front, extra) };
}
function upperEl(x: number, w: number, front: Opening[], extra: Partial<Cabinet> = {}): WallElement {
  return { id: sid('el'), xIn: x, widthIn: w, zone: 'upper', cabinet: cab(w, front, extra) };
}
function tallEl(x: number, w: number, front: Opening[], extra: Partial<Cabinet> = {}): WallElement {
  return { id: sid('el'), xIn: x, widthIn: w, zone: 'tall', cabinet: cab(w, front, extra) };
}
function applianceEl(x: number, w: number, fixtureId: string, fixture?: FixtureConfig, zone: Zone = 'base'): WallElement {
  return { id: sid('el'), xIn: x, widthIn: w, zone, fixtureId, fixture };
}
function workbenchEl(x: number, w: number, depthOverrideIn?: number): WallElement {
  return { id: sid('el'), xIn: x, widthIn: w, zone: 'base', workbench: true, depthOverrideIn };
}

/** One left→right column: its total footprint width + the elements it emits at x. */
interface Col {
  width: number;
  build: (x: number) => WallElement[];
}
/** Lay columns out left→right, assigning each element its x, and return the wall length. */
function composeWall(cols: Col[]): { elements: WallElement[]; length: number } {
  const elements: WallElement[] = [];
  let x = 0;
  for (const c of cols) {
    elements.push(...c.build(x));
    x += c.width;
  }
  return { elements, length: x };
}

export function newProject(name = 'New Project'): Project {
  n = 0;
  return {
    id: sid('proj'),
    name,
    units: 'in',
    materials: defaultMaterials(),
    defaults: projectDefaults(),
    pricing: defaultPricing(),
    rooms: [{ id: sid('room'), name: 'Room 1', walls: [{ id: sid('wall'), name: 'Wall A', lengthIn: 120, ceilingHeightIn: 96, elements: [] }] }],
  };
}

export interface NewProjectOpts {
  name: string;
  lengthIn: number;
  ceilingHeightIn: number;
  /** Overrides merged over the canonical project defaults (heights, joinery, handles…). */
  defaults?: Partial<ProjectDefaults>;
  /** Sheet-preset ids to seed the material list with; falls back to the defaults. */
  materialIds?: string[];
}

/** Build a fresh project from the new-project wizard's answers. */
export function buildNewProject(opts: NewProjectOpts): Project {
  n = 0;
  const defaults = { ...projectDefaults(), ...(opts.defaults ?? {}) };
  const materials = opts.materialIds?.length ? materialsFromPresets(opts.materialIds) : defaultMaterials();
  const len = opts.lengthIn || 120;
  // A starter base cabinet so the wall is never blank; add more sections from there.
  // Clamp to the wall so a short wall never gets an overflowing starter.
  const startW = Math.max(12, Math.min(36, len));
  const elements: WallElement[] = [baseEl(0, startW, [op('door', { doorCount: defaultDoorCount(startW) })])];

  return {
    id: sid('proj'),
    name: opts.name.trim() || 'New Project',
    units: 'in',
    materials,
    defaults,
    pricing: defaultPricing(),
    rooms: [{ id: sid('room'), name: 'Room 1', walls: [{ id: sid('wall'), name: 'Wall A', lengthIn: len, ceilingHeightIn: opts.ceilingHeightIn, elements }] }],
  };
}

/**
 * A realistic kitchen sink wall, left to right: pantry, drawer bank + uppers, a
 * panelled dishwasher, the sink/door run, a slide-in range, gridfinity utensil
 * drawers and base+upper runs. Exercises tall/base/upper cabinets and base-zone
 * appliances (the dishwasher's counter runs over it; the range breaks it).
 * Dev seed + demo.
 */
export function seedProject(): Project {
  n = 0;
  const stackDrawers = (w: number): Col => ({
    width: w,
    build: (x) => [
      baseEl(x, w, [op('drawer'), op('drawer'), op('drawer')]),
      upperEl(x, w, [op('door', { doorCount: 2, shelves: 2 })]),
    ],
  });
  // A drawer bank whose boxes carry gridfinity bins — organized utensils/gadgets.
  const gridfinityBank = (w: number): Col => ({
    width: w,
    build: (x) => [
      baseEl(x, w, [op('gridfinity-drawer'), op('gridfinity-drawer'), op('gridfinity-drawer')]),
      upperEl(x, w, [op('door', { doorCount: 2, shelves: 2 })]),
    ],
  });
  const stackDoors = (w: number, doors: 1 | 2 = 2): Col => ({
    width: w,
    build: (x) => [
      baseEl(x, w, [op('door', { doorCount: doors, shelves: 1 })]),
      upperEl(x, w, [op('door', { doorCount: doors, shelves: 2 })]),
    ],
  });
  // Sink base: a false drawer front over a 2-door sink cabinet, glass upper above.
  const sinkBank = (w: number): Col => ({
    width: w,
    build: (x) => [
      baseEl(x, w, [op('falseFront', { heightIn: 6 }), op('door', { doorCount: 2, shelves: 1 })]),
      upperEl(x, w, [op('door', { doorCount: 2, shelves: 2 })]),
    ],
  });
  const tall = (w: number, front: Opening[]): Col => ({ width: w, build: (x) => [tallEl(x, w, front)] });

  const { elements, length } = composeWall([
    tall(24, [op('door', { doorCount: 2, heightIn: 24, shelves: 1 }), op('door', { doorCount: 2, shelves: 4 })]),
    stackDrawers(30),
    // Panelled dishwasher (counter runs over it) with a glass-door upper above.
    { width: 24, build: (x) => [
      applianceEl(x, 24, 'dishwasher', { frontPanel: true }),
      upperEl(x, 24, [op('door', { doorCount: 2, shelves: 2 })]),
    ] },
    sinkBank(33),
    // Slide-in range (breaks the counter) with a vent hood directly above it.
    { width: 30, build: (x) => [
      applianceEl(x, 30, 'range'),
      applianceEl(x, 30, 'hood', undefined, 'upper'),
    ] },
    gridfinityBank(30),
    stackDoors(36),
  ]);

  return {
    id: sid('proj'),
    name: 'Kitchen Demo',
    units: 'in',
    materials: defaultMaterials(),
    defaults: projectDefaults(),
    pricing: defaultPricing(),
    rooms: [{ id: sid('room'), name: 'Kitchen', walls: [{ id: sid('wall'), name: 'Kitchen', lengthIn: length, ceilingHeightIn: 96, elements }] }],
  };
}

/**
 * A home bar back-wall, left to right: a back-bar base (two gridfinity bar-tool
 * drawers + a door) with an LED-lit glassware upper, a sink/prep base (false
 * front + doors) under another LED-lit upper, an open mini-fridge gap, an
 * independent bottle-storage run (two 15" base + two 15" upper doors) and a
 * workbench overhang for stool seating. The glassware uppers carry the
 * under-cabinet LED add-on (Axis 5).
 */
export function barProject(): Project {
  n = 0;
  const led: Partial<Cabinet> = { addons: ['under-cabinet-led'] };
  const { elements, length } = composeWall([
    // Back-bar base: two gridfinity bar-tool drawers + a 2-door cabinet, glassware upper above.
    {
      width: 30,
      build: (x) => [
        baseEl(x, 30, [op('gridfinity-drawer'), op('gridfinity-drawer'), op('door', { doorCount: 2, shelves: 1 })]),
        upperEl(x, 30, [op('door', { doorCount: 2, shelves: 2 })], led),
      ],
    },
    // Bar sink: a false sink front over doors, glassware upper above.
    {
      width: 36,
      build: (x) => [
        baseEl(x, 36, [op('falseFront', { heightIn: 6 }), op('door', { doorCount: 2, shelves: 1 })]),
        upperEl(x, 36, [op('door', { doorCount: 2, shelves: 2 })], led),
      ],
    },
    // Open slot for a freestanding under-counter mini-fridge (a real gap, no cabinet).
    { width: 24, build: () => [] },
    // Bottle storage: independent 15" base + 15" upper door pairs.
    {
      width: 30,
      build: (x) => [
        baseEl(x, 15, [op('door', { doorCount: 1, hingeSide: 'left', shelves: 2 })]),
        baseEl(x + 15, 15, [op('door', { doorCount: 1, hingeSide: 'right', shelves: 2 })]),
        upperEl(x, 15, [op('door', { doorCount: 1, hingeSide: 'left', shelves: 2 })]),
        upperEl(x + 15, 15, [op('door', { doorCount: 1, hingeSide: 'right', shelves: 2 })]),
      ],
    },
    // Overhang counter on legs for bar-stool seating.
    { width: 24, build: (x) => [workbenchEl(x, 24, 25)] },
  ]);

  return {
    id: sid('proj'),
    name: 'Home Bar Demo',
    units: 'in',
    materials: defaultMaterials(),
    defaults: projectDefaults(),
    pricing: defaultPricing(),
    rooms: [{ id: sid('room'), name: 'Bar', walls: [{ id: sid('wall'), name: 'Back Bar', lengthIn: length, ceilingHeightIn: 96, elements }] }],
  };
}

/**
 * An office built-in wall, left to right: a floor-to-ceiling open bookcase, a
 * file-drawer base with a closed upper, an open desk surface on legs (knee
 * space), a gridfinity drawer pedestal with a small upper, and a narrow
 * full-height supply cabinet. Exercises tall/base/upper cabinets and workbenches.
 */
export function officeProject(): Project {
  n = 0;
  const { elements, length } = composeWall([
    // Floor-to-ceiling open bookcase: fixed shelves, no doors.
    { width: 30, build: (x) => [tallEl(x, 30, [op('fixed', { shelves: 5 })])] },
    // File-drawer base (two letter drawers) under a 2-door upper.
    {
      width: 24,
      build: (x) => [
        baseEl(x, 24, [op('drawer'), op('drawer')]),
        upperEl(x, 24, [op('door', { doorCount: 2, shelves: 2 })]),
      ],
    },
    // Open desk surface on legs — the knee space.
    { width: 42, build: (x) => [workbenchEl(x, 42, 25)] },
    // Drawer pedestal: three gridfinity drawers below a single-door upper.
    {
      width: 24,
      build: (x) => [
        baseEl(x, 24, [op('gridfinity-drawer'), op('gridfinity-drawer'), op('gridfinity-drawer')]),
        upperEl(x, 24, [op('door', { doorCount: 1, hingeSide: 'right', shelves: 2 })]),
      ],
    },
    // Narrow full-height supply cabinet.
    { width: 12, build: (x) => [tallEl(x, 12, [op('door', { doorCount: 1, hingeSide: 'left', shelves: 5 })])] },
  ]);

  return {
    id: sid('proj'),
    name: 'Office Built-ins Demo',
    units: 'in',
    materials: defaultMaterials(),
    defaults: projectDefaults(),
    pricing: defaultPricing(),
    rooms: [{ id: sid('room'), name: 'Office', walls: [{ id: sid('wall'), name: 'Built-in Wall', lengthIn: length, ceilingHeightIn: 96, elements }] }],
  };
}

/** A loadable demo project: a key for the menu/store and a builder. */
export interface Demo {
  key: string;
  label: string;
  description: string;
  build: () => Project;
}

/** Demo projects offered in the Project menu. The kitchen is also the dev seed. */
export const DEMOS: Demo[] = [
  { key: 'kitchen', label: 'Kitchen', description: 'A full kitchen run — pantry, drawers, doors + uppers', build: seedProject },
  { key: 'bar', label: 'Home bar', description: 'Back bar, LED-lit glassware uppers', build: barProject },
  { key: 'office', label: 'Office built-ins', description: 'Bookcase, desk + drawer pedestals', build: officeProject },
];
