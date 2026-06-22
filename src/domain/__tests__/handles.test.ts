import { describe, expect, it } from 'vitest';
import { buildCabinet, type BuildCabinetParams } from '../geometry/buildCabinet';
import { effectiveHandle, handleHardware, edgePullExtension } from '../geometry/handles';
import { EDGE_PULL_EXTENSION } from '../constants';
import { projectDefaults } from '../seed';
import type { Cabinet, HandleType, Opening } from '../types';

const params = (over: Partial<BuildCabinetParams> = {}): BuildCabinetParams => ({
  index: 1, runKind: 'base', depthIn: 24, carcassHeightIn: 30, legHeightIn: 4.5, hasLegs: true,
  materialIdByRole: {}, colorByRole: {}, textureByRole: {}, defaults: projectDefaults(), ...over,
});

const drawerCab = (handle?: HandleType): Cabinet => ({
  id: 'c', widthIn: 24, front: [{ id: 'd', type: 'drawer', heightIn: 8, handle }],
});
const doorCab = (handle?: HandleType, doorCount: 1 | 2 = 1): Cabinet => ({
  id: 'c', widthIn: 24, front: [{ id: 'o', type: 'door', doorCount, heightIn: 'auto', handle }],
});

describe('effectiveHandle defaults', () => {
  it('drawers and doors default to a pull; panels never get a handle', () => {
    expect(effectiveHandle({ id: 'a', type: 'drawer', heightIn: 'auto' })).toBe('pull');
    expect(effectiveHandle({ id: 'a', type: 'door', heightIn: 'auto' })).toBe('pull');
    expect(effectiveHandle({ id: 'a', type: 'falseFront', heightIn: 6 })).toBeUndefined();
    expect(effectiveHandle({ id: 'a', type: 'fixed', heightIn: 6 })).toBeUndefined();
  });
});

describe('effectiveHandle honours a supplied project default', () => {
  it('an unset opening falls back to the default, but an explicit handle still wins', () => {
    const drawer: Opening = { id: 'a', type: 'drawer', heightIn: 'auto' };
    expect(effectiveHandle(drawer, 'routerCutout')).toBe('routerCutout');
    expect(effectiveHandle({ ...drawer, handle: 'pull' }, 'routerCutout')).toBe('pull');
  });
  it('a project-default pull still tallies bought hardware for unset fronts', () => {
    const cab = buildCabinet(drawerCab(), params({ defaults: { ...projectDefaults(), drawerHandle: 'routerCutout' } }));
    expect(cab.hardware.pulls).toBe(0); // routed cutout — no bought pull
    expect(cab.hardware.slidePairs).toBe(1);
  });
});

describe('handleHardware', () => {
  const op = (handle?: HandleType): Opening => ({ id: 'x', type: 'door', heightIn: 'auto', handle });
  it('a pull (default) is one bought pull per leaf', () => {
    expect(handleHardware(op('pull'), 2)).toEqual({ pulls: 2, pushLatches: 0 });
    expect(handleHardware(op(), 1)).toEqual({ pulls: 1, pushLatches: 0 });
  });
  it('a push latch swaps the pull for a latch per leaf', () => {
    expect(handleHardware(op('pushLatch'), 2)).toEqual({ pulls: 0, pushLatches: 2 });
  });
  it('router cutout and edge pull are free of bought hardware', () => {
    expect(handleHardware(op('routerCutout'), 1)).toEqual({ pulls: 0, pushLatches: 0 });
    expect(handleHardware(op('edgePull'), 1)).toEqual({ pulls: 0, pushLatches: 0 });
  });
});

describe('hardware tally honours the handle', () => {
  it('a router-cutout drawer adds a slide pair but no pull', () => {
    const { hardware } = buildCabinet(drawerCab('routerCutout'), params());
    expect(hardware.slidePairs).toBe(1);
    expect(hardware.pulls).toBe(0);
    expect(hardware.pushLatches).toBe(0);
  });
  it('a push-latch double door adds latches (one per leaf), no pulls', () => {
    const { hardware } = buildCabinet(doorCab('pushLatch', 2), params());
    expect(hardware.pulls).toBe(0);
    expect(hardware.pushLatches).toBe(2);
    expect(hardware.hinges).toBeGreaterThan(0); // still hinged
  });
  it('the default pull still tallies a pull per leaf (unchanged)', () => {
    expect(buildCabinet(drawerCab(), params()).hardware.pulls).toBe(1);
    expect(buildCabinet(doorCab('pull', 2), params()).hardware.pulls).toBe(2);
  });
});

describe('edge pull grows the cut face', () => {
  it('extends the door face by the lip and adds nothing for other handles', () => {
    expect(edgePullExtension({ id: 'x', type: 'door', heightIn: 'auto', handle: 'edgePull' })).toBe(EDGE_PULL_EXTENSION);
    expect(edgePullExtension({ id: 'x', type: 'door', heightIn: 'auto', handle: 'pull' })).toBe(0);

    const plain = buildCabinet(doorCab('pull'), params()).parts.find((p) => p.id === 'C1-DOOR1')!;
    const lipped = buildCabinet(doorCab('edgePull'), params()).parts.find((p) => p.id === 'C1-DOOR1')!;
    expect(lipped.lIn).toBeCloseTo(plain.lIn + EDGE_PULL_EXTENSION, 6);
    expect(lipped.wIn).toBeCloseTo(plain.wIn, 6); // width unchanged
    expect(lipped.notes ?? '').toMatch(/finger lip/i);
  });
});

describe('3D handle viz', () => {
  it('a router cutout emits a recess node; a push latch emits none', () => {
    const cut = buildCabinet(drawerCab('routerCutout'), params()).nodes.filter((n) => n.kind === 'handle');
    expect(cut).toHaveLength(1);
    const latch = buildCabinet(doorCab('pushLatch'), params()).nodes.filter((n) => n.kind === 'handle');
    expect(latch).toHaveLength(0);
  });
  it('a default pull renders a handle node, an edge pull renders none', () => {
    expect(buildCabinet(drawerCab(), params()).nodes.filter((n) => n.kind === 'handle')).toHaveLength(1);
    expect(buildCabinet(doorCab('edgePull'), params()).nodes.filter((n) => n.kind === 'handle')).toHaveLength(0);
  });
});
