/**
 * The React escape hatch: a plugin registers custom Inspector panels / 3D-viewer
 * overlays via `registerPluginUI` (for UI the declarative `PluginField[]` schema
 * can't express). The domain registry stays React-free; this companion registry
 * holds the components and the Inspector / Viewer3D look them up by plugin id.
 * Guards the resolve + dedupe contract, mirroring the domain registry's tests.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetPluginUIForTests,
  getAddonPanel,
  getFixturePanel,
  getFrontPanel,
  getViewerOverlay,
  registerPluginUI,
} from '../plugins/registry';

afterEach(() => __resetPluginUIForTests());

describe('UI plugin registry', () => {
  it('resolves panels + overlays by id, and unset/unknown ids to nothing', () => {
    const Panel = () => null;
    const Overlay = () => null;
    registerPluginUI({ id: 'demo', front: { door: Panel }, fixture: { dishwasher: Panel }, addon: { foo: Panel }, overlays: { glow: Overlay } });
    expect(getFrontPanel('door')).toBe(Panel);
    expect(getFixturePanel('dishwasher')).toBe(Panel);
    expect(getAddonPanel('foo')).toBe(Panel);
    expect(getViewerOverlay('glow')).toBe(Overlay);
    expect(getFrontPanel('nope')).toBeUndefined();
    expect(getViewerOverlay(undefined)).toBeUndefined();
  });

  it('throws on a duplicate id within an axis', () => {
    const Panel = () => null;
    registerPluginUI({ id: 'a', front: { door: Panel } });
    expect(() => registerPluginUI({ id: 'b', front: { door: Panel } })).toThrow(/Duplicate front panel/);
  });
});
