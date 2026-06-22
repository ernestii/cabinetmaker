/**
 * The plugin registry: the single place the core engine looks up behaviour for
 * front types, door styles, fixtures, and handles. Built-ins and third-party
 * plugins both register here via `registerPlugin`.
 *
 * This module imports only types (no builders), so geometry can depend on it
 * without an import cycle: geometry → registry, builtin → geometry + registry.
 */
import type { HandleType } from '../types';
import type {
  CabinetAddonDef,
  CabinetmakerPlugin,
  DoorStyleDef,
  FixtureDef,
  FrontTypeDef,
  HandleDef,
  SelectionCommandDef,
} from './types';

const frontTypes = new Map<string, FrontTypeDef>();
const doorStyles = new Map<string, DoorStyleDef>();
const fixtures = new Map<string, FixtureDef>();
const handles = new Map<string, HandleDef>();
const cabinetAddons = new Map<string, CabinetAddonDef>();
const selectionCommands = new Map<string, SelectionCommandDef>();

function set<T>(map: Map<string, T>, kind: string, id: string, def: T): void {
  if (map.has(id)) throw new Error(`Duplicate ${kind} plugin id: "${id}"`);
  map.set(id, def);
}

/** Register a plugin's contributions. Throws on a duplicate id within an axis. */
export function registerPlugin(p: CabinetmakerPlugin): void {
  for (const d of p.frontTypes ?? []) set(frontTypes, 'front type', d.id, d);
  for (const d of p.doorStyles ?? []) set(doorStyles, 'door style', d.id, d);
  for (const d of p.fixtures ?? []) set(fixtures, 'fixture', d.id, d);
  for (const d of p.handles ?? []) set(handles, 'handle', d.id, d);
  for (const d of p.cabinetAddons ?? []) set(cabinetAddons, 'cabinet add-on', d.id, d);
  for (const d of p.selectionCommands ?? []) set(selectionCommands, 'selection command', d.id, d);
}

export const getFrontType = (id: string): FrontTypeDef | undefined => frontTypes.get(id);
/** Door style for an id; falls back to the built-in slab for unset/unknown ids. */
export const getDoorStyle = (id?: string): DoorStyleDef =>
  doorStyles.get(id ?? 'slab') ?? doorStyles.get('slab')!;
export const getFixture = (id?: string): FixtureDef | undefined => (id ? fixtures.get(id) : undefined);
export const getHandleDef = (id: HandleType): HandleDef | undefined => handles.get(id);
export const getCabinetAddon = (id?: string): CabinetAddonDef | undefined => (id ? cabinetAddons.get(id) : undefined);
export const getSelectionCommand = (id?: string): SelectionCommandDef | undefined => (id ? selectionCommands.get(id) : undefined);

export const listFrontTypes = (): FrontTypeDef[] => [...frontTypes.values()];
export const listDoorStyles = (): DoorStyleDef[] => [...doorStyles.values()];
export const listFixtures = (): FixtureDef[] => [...fixtures.values()];
export const listHandles = (): HandleDef[] => [...handles.values()];
export const listCabinetAddons = (): CabinetAddonDef[] => [...cabinetAddons.values()];
export const listSelectionCommands = (): SelectionCommandDef[] => [...selectionCommands.values()];

/** Test-only: wipe every registry (so a test can register a clean set). */
export function __resetRegistryForTests(): void {
  frontTypes.clear();
  doorStyles.clear();
  fixtures.clear();
  handles.clear();
  cabinetAddons.clear();
  selectionCommands.clear();
}
