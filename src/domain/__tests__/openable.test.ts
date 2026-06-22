import { describe, expect, it } from 'vitest';
import { buildCabinet, type BuildCabinetParams } from '../geometry/buildCabinet';
import { projectDefaults } from '../seed';
import type { Cabinet } from '../types';

const params = (): BuildCabinetParams => ({
  index: 1,
  runKind: 'base',
  depthIn: 24,
  carcassHeightIn: 30,
  legHeightIn: 4.5,
  hasLegs: true,
  materialIdByRole: {},
  colorByRole: {},
  textureByRole: {},
  defaults: projectDefaults(),
});

const drawerCab = (): Cabinet => ({
  id: 'c', widthIn: 24, front: [{ id: 'o', type: 'drawer', heightIn: 'auto' }],
});
const doorCab = (over: Partial<Cabinet['front'][number]> = {}): Cabinet => ({
  id: 'c', widthIn: 24, front: [{ id: 'o', type: 'door', doorCount: 1, hingeSide: 'left', heightIn: 'auto', ...over }],
});

describe('openable tagging for the 3D viewer', () => {
  it('groups a drawer box + face under one sliding group', () => {
    const { nodes } = buildCabinet(drawerCab(), params());
    const open = nodes.filter((n) => n.open);
    // 5 box panels + 1 face + 1 handle all share one drawer group id.
    expect(open.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(open.map((n) => n.open!.id));
    expect(ids.size).toBe(1);
    expect(open.every((n) => n.open!.kind === 'drawer')).toBe(true);
    expect(open[0].open!.travel).toBeGreaterThan(0);
  });

  it('gives a single door a hinge pivot and a swing direction', () => {
    const { nodes } = buildCabinet(doorCab(), params());
    const face = nodes.find((n) => n.kind === 'face')!;
    expect(face.open?.kind).toBe('door');
    expect(face.open?.pivot).toBeDefined();
    // Left hinge sits at the left edge of the face and swings outward (-1).
    expect(face.open!.swing).toBe(-1);
    expect(face.open!.pivot![0]).toBeLessThan(face.pos[0]);
    // The hinge axis sits at the door's outer (room-facing) face, not its back,
    // so the leaf sweeps to its own side and can't clip a neighbour.
    expect(face.open!.pivot![2]).toBeGreaterThan(face.pos[2]);
  });

  it('splits a door pair into two leaves hinged on opposite edges', () => {
    const { nodes } = buildCabinet(doorCab({ doorCount: 2, hingeSide: undefined }), params());
    const faces = nodes.filter((n) => n.kind === 'face');
    expect(faces).toHaveLength(2);
    const ids = new Set(faces.map((n) => n.open!.id));
    expect(ids.size).toBe(2); // independent leaves
    const swings = faces.map((n) => n.open!.swing).sort();
    expect(swings).toEqual([-1, 1]); // swing apart
  });
});
