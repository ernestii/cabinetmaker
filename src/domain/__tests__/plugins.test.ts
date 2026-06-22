import { afterEach, describe, expect, it } from 'vitest';
import {
  getDoorStyle,
  getFixture,
  getFrontType,
  listDoorStyles,
  listFixtures,
  listFrontTypes,
  listHandles,
  registerPlugin,
  __resetRegistryForTests,
} from '../plugins/registry';
import { registerBuiltins } from '../plugins/builtin';

// Tests here mutate the registry, so restore the built-ins afterwards.
afterEach(() => {
  __resetRegistryForTests();
  registerBuiltins();
});

describe('plugin registry', () => {
  it('registers every built-in axis', () => {
    expect(listFrontTypes().map((d) => d.id).sort()).toEqual(['door', 'drawer', 'falseFront', 'fixed', 'gridfinity-drawer']);
    expect(listDoorStyles().map((d) => d.id).sort()).toEqual(['shaker', 'slab']);
    expect(listFixtures().map((d) => d.id).sort()).toEqual(
      ['cooktop', 'dishwasher', 'dryer', 'fridge', 'hood', 'led-strip', 'range', 'washer'],
    );
    expect(listHandles().map((d) => d.id).sort()).toEqual(['edgePull', 'pull', 'pushLatch', 'routerCutout']);
  });

  it('resolves an unset or unknown door style to slab', () => {
    expect(getDoorStyle(undefined).id).toBe('slab');
    expect(getDoorStyle('does-not-exist').id).toBe('slab');
    expect(getDoorStyle('shaker').id).toBe('shaker');
  });

  it('returns undefined for an unknown front type / fixture', () => {
    expect(getFrontType('nope')).toBeUndefined();
    expect(getFixture('nope')).toBeUndefined();
    expect(getFixture(undefined)).toBeUndefined();
  });

  it('throws on a duplicate id within an axis', () => {
    expect(() => registerPlugin({ id: 'dup', doorStyles: [getDoorStyle('slab')] })).toThrow(/Duplicate door style/);
  });

  it('lets a third-party plugin add a door style without touching core', () => {
    registerPlugin({ id: 'mine', doorStyles: [{ id: 'beadboard', label: 'Beadboard', buildFace: () => {} }] });
    expect(getDoorStyle('beadboard').id).toBe('beadboard');
    expect(listDoorStyles().map((d) => d.id)).toContain('beadboard');
  });
});
