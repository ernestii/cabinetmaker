import type { Material, MaterialRole } from './types';
import { DEFAULT_KERF } from './constants';

/**
 * A shoppable stock product. Sheet goods nest on the cut list; countertop slabs
 * are cut to length. Prices are representative US retail (mostly Home Depot) for
 * planning only — they move with the market and vary by region, so treat them as
 * ballpark and confirm at your store. Model/SKU numbers are real so a product is
 * easy to find again.
 */
export interface CatalogProduct {
  id: string;
  name: string;
  store: string;
  /** Manufacturer model / Home Depot internet number. */
  sku?: string;
  category: 'sheet' | 'countertop';
  /** Roles this stock typically fills; pre-checked when you add it. */
  roles: MaterialRole[];
  thicknessIn: number;
  /** Sheet width / slab depth (the short dimension). */
  sheetW: number;
  /** Sheet length / slab length (the long dimension; a slab is cut from this). */
  sheetH: number;
  price: number;
  color: string;
  textureUrl?: string;
  grained: boolean;
  /** One-line buyer's note (grade, species, typical use). */
  note: string;
}

const SHEET = { sheetW: 48, sheetH: 96 };

/**
 * Sheet goods (4×8 plywood, MDF, melamine) and countertop slabs. Curated from
 * stock Home Depot carries; see catalog.test.ts for the invariants.
 */
export const CATALOG: CatalogProduct[] = [
  // ---- Cabinet-grade plywood (cabinet boxes, doors, drawer fronts) ----
  {
    id: 'pb-birch-34', name: '3/4" PureBond Birch Plywood', store: 'Home Depot', sku: 'CFP 165921',
    category: 'sheet', roles: ['carcass', 'face'], thicknessIn: 0.75, ...SHEET, price: 72,
    color: '#d8b886', textureUrl: 'birch', grained: true,
    note: 'Columbia Forest cabinet-grade birch — the default box + face stock.',
  },
  {
    id: 'pb-birch-12', name: '1/2" PureBond Birch Plywood', store: 'Home Depot', sku: 'CFP 165911',
    category: 'sheet', roles: ['drawer', 'drawerBottom', 'back'], thicknessIn: 0.5, ...SHEET, price: 55,
    color: '#e3c49a', textureUrl: 'birch', grained: true,
    note: '1/2" birch for drawer boxes, bottoms and backs — nests together.',
  },
  {
    id: 'pb-birch-14', name: '1/4" PureBond Birch Plywood', store: 'Home Depot', sku: 'CFP 165891',
    category: 'sheet', roles: ['drawerBottom', 'back'], thicknessIn: 0.25, ...SHEET, price: 42,
    color: '#e3c49a', textureUrl: 'birch', grained: true,
    note: 'Thin birch for drawer bottoms / inset backs to save weight + cost.',
  },
  {
    id: 'oak-34', name: '3/4" Oak Plywood', store: 'Home Depot', sku: 'Swaner Oak',
    category: 'sheet', roles: ['face'], thicknessIn: 0.75, ...SHEET, price: 88,
    color: '#c79a5e', textureUrl: 'oak', grained: true,
    note: 'Red-oak veneer for doors + drawer fronts when you want visible grain.',
  },
  {
    id: 'maple-34', name: '3/4" Maple Plywood', store: 'Home Depot', sku: 'Swaner Maple',
    category: 'sheet', roles: ['carcass', 'face'], thicknessIn: 0.75, ...SHEET, price: 82,
    color: '#e0c79a', textureUrl: 'birch', grained: true,
    note: 'Hard-maple veneer — pale, tight grain for a clean modern look.',
  },
  // ---- Utility / paint-grade sheet goods ----
  {
    id: 'sande-34', name: '3/4" Sande Plywood', store: 'Home Depot', sku: '441908',
    category: 'sheet', roles: ['carcass', 'toekick'], thicknessIn: 0.75, ...SHEET, price: 48,
    color: '#c9a877', textureUrl: 'birch', grained: true,
    note: 'Smooth tropical-hardwood ply — budget box + toekick stock for paint.',
  },
  {
    id: 'mdf-34', name: '3/4" MDF Panel', store: 'Home Depot', sku: 'ULTRASTOCK',
    category: 'sheet', roles: ['face', 'toekick'], thicknessIn: 0.75, ...SHEET, price: 42,
    color: '#b39d82', grained: false,
    note: 'Ultra-flat, grainless — ideal for painted shaker doors. Nests rotated.',
  },
  {
    id: 'mel-white-34', name: '3/4" White Melamine Panel', store: 'Home Depot', sku: 'Veranda 461877',
    category: 'sheet', roles: ['carcass', 'drawer', 'back'], thicknessIn: 0.75, sheetW: 49, sheetH: 97, price: 45,
    color: '#f2f2f4', textureUrl: 'melamine', grained: false,
    note: 'Pre-finished white interiors — wipe-clean, no finishing. 49"×97" sheet.',
  },

  // ---- Countertop slabs (cut to length; depth ~25") ----
  {
    id: 'bb-birch-4', name: 'Birch Butcher Block — 4 ft', store: 'Home Depot', sku: 'Hardwood Reflections BBCT1502550',
    category: 'countertop', roles: ['counter'], thicknessIn: 1.5, sheetW: 25, sheetH: 50, price: 199,
    color: '#946a34', textureUrl: 'butcher', grained: true,
    note: '50"L × 25"D × 1.5" unfinished birch — eased edge.',
  },
  {
    id: 'bb-birch-6', name: 'Birch Butcher Block — 6 ft', store: 'Home Depot', sku: 'Hardwood Reflections',
    category: 'countertop', roles: ['counter'], thicknessIn: 1.5, sheetW: 25, sheetH: 74, price: 259,
    color: '#946a34', textureUrl: 'butcher', grained: true,
    note: '74"L × 25"D × 1.5" unfinished birch — eased edge.',
  },
  {
    id: 'bb-birch-8', name: 'Birch Butcher Block — 8 ft', store: 'Home Depot', sku: 'Hardwood Reflections BBCT1502598',
    category: 'countertop', roles: ['counter'], thicknessIn: 1.5, sheetW: 25, sheetH: 98, price: 329,
    color: '#946a34', textureUrl: 'butcher', grained: true,
    note: '98"L × 25"D × 1.5" unfinished birch — eased edge. Most popular length.',
  },
  {
    id: 'bb-birch-10', name: 'Birch Butcher Block — 10 ft', store: 'Home Depot', sku: 'Hardwood Reflections',
    category: 'countertop', roles: ['counter'], thicknessIn: 1.5, sheetW: 25, sheetH: 122, price: 429,
    color: '#946a34', textureUrl: 'butcher', grained: true,
    note: '122"L × 25"D × 1.5" unfinished birch — eased edge.',
  },
  {
    id: 'bb-acacia-8', name: 'Acacia Butcher Block — 8 ft', store: 'Home Depot', sku: 'Hardwood Reflections Acacia',
    category: 'countertop', roles: ['counter'], thicknessIn: 1.5, sheetW: 25, sheetH: 98, price: 349,
    color: '#a87642', textureUrl: 'butcher', grained: true,
    note: '98"L × 25"D × 1.5" warm-toned acacia — eased edge.',
  },
  {
    id: 'counter-laminate-8', name: 'Laminate Countertop — 8 ft', store: 'Home Depot', sku: 'Hampton Bay',
    category: 'countertop', roles: ['counter'], thicknessIn: 1.5, sheetW: 25, sheetH: 96, price: 120,
    color: '#3a3a3f', textureUrl: 'marbleBlack', grained: false,
    note: 'Pre-formed post-form laminate — budget counter, many patterns.',
  },
  {
    id: 'counter-marble', name: 'Marble Slab (custom)', store: 'Home Depot', sku: 'Special order',
    category: 'countertop', roles: ['counter'], thicknessIn: 1.25, sheetW: 26, sheetH: 96, price: 560,
    color: '#e8e8ec', textureUrl: 'marbleWhite', grained: false,
    note: 'Stone is fabricated to template — price is a rough per-slab estimate.',
  },
];

const BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

export function catalogProduct(id: string | undefined): CatalogProduct | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export const sheetProducts = CATALOG.filter((p) => p.category === 'sheet');
export const countertopProducts = CATALOG.filter((p) => p.category === 'countertop');

/** Build a project Material from a catalog product (caller supplies the id). */
export function materialFromProduct(p: CatalogProduct, id: string): Material {
  return {
    id,
    name: p.name,
    thicknessIn: p.thicknessIn,
    color: p.color,
    textureUrl: p.textureUrl,
    grained: p.grained,
    roles: [...p.roles],
    sheetW: p.sheetW,
    sheetH: p.sheetH,
    kerfIn: DEFAULT_KERF,
    edgeTrimIn: p.category === 'sheet' ? 0.25 : 0,
    pricePerSheet: p.price,
    productId: p.id,
    store: p.store,
    sku: p.sku,
  };
}
