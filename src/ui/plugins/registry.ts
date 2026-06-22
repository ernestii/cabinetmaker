/**
 * The UI-side plugin registry — the React escape hatch for plugins whose
 * Inspector or 3D-viewer UI the declarative `PluginField[]` schema can't express
 * (a colour picker, a live preview, an interactive 3D handle, …).
 *
 * The domain plugin registry (`src/domain/plugins`) is intentionally React-free,
 * so React components can't live on `FrontTypeDef`/`FixtureDef`/… . Instead a
 * plugin registers its behaviour there as usual, and *optionally* registers a
 * companion bundle of React components here, keyed by the **same plugin ids**.
 * The Inspector and Viewer3D look these up and render them alongside (after) the
 * declarative controls; a plugin that only needs declarative fields ignores this
 * module entirely.
 */
import type { ComponentType } from 'react';
import type { Node3D, RunKind } from '../../domain/types';

/**
 * Props an Inspector panel receives. `get`/`set` are the same field adapters the
 * declarative `PluginFields` uses, so a custom panel reads/writes core fields
 * ('doorCount', 'handle', 'frontPanel', …) and the instance's settings bag
 * ('setting:<key>') exactly like a declarative field would — no new plumbing.
 */
export interface InspectorPanelProps {
  /** Read a field target (core field or 'setting:<key>'). */
  get: (target: string) => unknown;
  /** Write a field target. */
  set: (target: string, value: unknown) => void;
  /** Cabinet slot the host lives in (front-type panels only). */
  slot?: RunKind;
  /** This front's position in the cabinet's stack (front-type panels only). */
  position?: { index: number; count: number };
}

export type InspectorPanel = ComponentType<InspectorPanelProps>;

/** Props a 3D-viewer overlay receives — rendered as content inside the R3F canvas. */
export interface ViewerOverlayProps {
  node: Node3D;
  /** The node's centre in scene space (feet), ready for a `<group position>`. */
  position: [number, number, number];
}

export type ViewerOverlay = ComponentType<ViewerOverlayProps>;

/** A bundle of React UI a plugin registers, keyed by the plugin ids it owns. */
export interface PluginUI {
  /** Plugin id (matches the domain bundle's id; used only for dedupe messages). */
  id: string;
  /** Inspector panels keyed by front-type id (`Opening.type`). */
  front?: Record<string, InspectorPanel>;
  /** Inspector panels keyed by fixture id (`Bay.fixtureId`). */
  fixture?: Record<string, InspectorPanel>;
  /** Inspector panels keyed by cabinet add-on id. */
  addon?: Record<string, InspectorPanel>;
  /** Viewer overlays keyed by `Node3D.overlayId`. */
  overlays?: Record<string, ViewerOverlay>;
}

const frontPanels = new Map<string, InspectorPanel>();
const fixturePanels = new Map<string, InspectorPanel>();
const addonPanels = new Map<string, InspectorPanel>();
const viewerOverlays = new Map<string, ViewerOverlay>();

function merge<T>(map: Map<string, T>, kind: string, entries?: Record<string, T>): void {
  for (const [id, def] of Object.entries(entries ?? {})) {
    if (map.has(id)) throw new Error(`Duplicate ${kind} UI id: "${id}"`);
    map.set(id, def);
  }
}

/** Register a plugin's React UI. Throws on a duplicate id within an axis. */
export function registerPluginUI(ui: PluginUI): void {
  merge(frontPanels, 'front panel', ui.front);
  merge(fixturePanels, 'fixture panel', ui.fixture);
  merge(addonPanels, 'add-on panel', ui.addon);
  merge(viewerOverlays, 'viewer overlay', ui.overlays);
}

export const getFrontPanel = (id?: string): InspectorPanel | undefined => (id ? frontPanels.get(id) : undefined);
export const getFixturePanel = (id?: string): InspectorPanel | undefined => (id ? fixturePanels.get(id) : undefined);
export const getAddonPanel = (id?: string): InspectorPanel | undefined => (id ? addonPanels.get(id) : undefined);
export const getViewerOverlay = (id?: string): ViewerOverlay | undefined => (id ? viewerOverlays.get(id) : undefined);

/** Test-only: wipe every UI registry so a test can register a clean set. */
export function __resetPluginUIForTests(): void {
  frontPanels.clear();
  fixturePanels.clear();
  addonPanels.clear();
  viewerOverlays.clear();
}
