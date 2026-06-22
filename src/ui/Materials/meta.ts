import type { MaterialRole } from '../../domain/types';

/** Plain-English labels + helper for each material role (`short` fits table badges). */
export const ROLE_META: Record<MaterialRole, { label: string; short: string; hint: string }> = {
  carcass: { label: 'Cabinet boxes', short: 'Boxes', hint: 'Sides, shelves, tops & bottoms' },
  face: { label: 'Doors & fronts', short: 'Fronts', hint: 'Door leaves and drawer faces' },
  drawer: { label: 'Drawer boxes', short: 'Drawers', hint: 'Drawer sides, fronts & backs' },
  drawerBottom: { label: 'Drawer bottoms', short: 'Bottoms', hint: 'Thin panel in the drawer base' },
  back: { label: 'Cabinet backs', short: 'Backs', hint: 'Back panel or hanging rails' },
  toekick: { label: 'Toe kick', short: 'Toe kick', hint: 'Recessed strip under base cabinets' },
  counter: { label: 'Countertop', short: 'Counter', hint: 'Worktop slab over base runs' },
};

/** Roles a sheet good can fill (everything except the countertop). */
export const SHEET_ROLES: MaterialRole[] = ['carcass', 'face', 'drawer', 'drawerBottom', 'back', 'toekick'];

/** One-click appearance presets: set colour + texture/finish together. */
export const APPEARANCE_PRESETS: { label: string; color: string; textureUrl?: string; grained: boolean }[] = [
  { label: 'Marble white', color: '#e8e8ec', textureUrl: 'marbleWhite', grained: false },
  { label: 'Marble black', color: '#26262b', textureUrl: 'marbleBlack', grained: false },
  { label: 'Light wood', color: '#d8b886', textureUrl: 'birch', grained: true },
  { label: 'Dark wood', color: '#5b4332', textureUrl: 'walnut', grained: true },
  { label: 'Butcher block', color: '#946a34', textureUrl: 'butcher', grained: true },
  { label: 'White melamine', color: '#f2f2f4', textureUrl: 'melamine', grained: false },
  { label: 'Black melamine', color: '#232327', textureUrl: 'melamine', grained: false },
  { label: 'Gray melamine', color: '#8b8d92', textureUrl: 'melamine', grained: false },
];
