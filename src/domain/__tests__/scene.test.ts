import { describe, expect, it } from 'vitest';
import { buildProject } from '../geometry/buildProject';
import { seedProject } from '../seed';

describe('buildProject scene', () => {
  const { nodes, parts } = buildProject(seedProject());

  it('produces nodes and parts', () => {
    expect(nodes.length).toBeGreaterThan(0);
    expect(parts.length).toBeGreaterThan(0);
  });

  it('all node positions and sizes are finite and positive-sized', () => {
    for (const n of nodes) {
      for (const v of [...n.pos, ...n.size]) expect(Number.isFinite(v)).toBe(true);
      for (const s of n.size) expect(s).toBeGreaterThan(0);
    }
  });

  it('includes carcass, faces, counter and legs', () => {
    const kinds = new Set(nodes.map((n) => n.kind));
    expect(kinds.has('panel')).toBe(true);
    expect(kinds.has('face')).toBe(true);
    expect(kinds.has('counter')).toBe(true);
    expect(kinds.has('leg')).toBe(true);
  });

  it('gives every cut part a unique ID', () => {
    const ids = parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rotates a turned wall (legacy multi-wall support)', () => {
    // A 2nd wall at turnDeg 90 → its nodes carry a ~90° Y rotation and run +z.
    const p = seedProject();
    p.rooms[0].walls.push({
      id: 'w-return', name: 'Return', lengthIn: 96, ceilingHeightIn: 96, turnDeg: 90,
      elements: [{ id: 'b-r', xIn: 0, widthIn: 24, zone: 'base', cabinet: { id: 'c-r', widthIn: 24, front: [{ id: 'o-r', type: 'door', heightIn: 'auto' }] } }],
    });
    const out = buildProject(p);
    const rotated = out.nodes.filter((n) => Math.abs(n.rotY ?? 0) > 0.1);
    expect(rotated.length).toBeGreaterThan(0);
    for (const n of rotated) expect(Math.abs(Math.abs(n.rotY!) - Math.PI / 2)).toBeLessThan(1e-6);
  });

  it('builds independent base cabinets for a flex bay (different widths)', () => {
    // seed flex bay: bottom = two 24" cabs (a door + a 3-drawer), top = one 30" double door
    const sides = parts.filter((p) => p.role === 'carcass' && p.label === 'Side panel');
    // each carcass cabinet contributes one SIDE part (qty 2); flex adds 3 cabinets
    expect(sides.length).toBeGreaterThanOrEqual(3);
    // the 3-drawer flex base yields 3 drawer-box "side" parts under one cabinet id
    const drawerFronts = parts.filter((p) => p.role === 'face' && p.label.includes('Drawer'));
    expect(drawerFronts.length).toBeGreaterThan(0);
  });
});
