import { describe, expect, it } from 'vitest';
import { buildCabinet } from '../geometry/buildCabinet';
import { projectDefaults } from '../seed';
import type { Cabinet } from '../types';

function doorParts(doorStyle?: string) {
  const cab: Cabinet = {
    id: 'A', widthIn: 18,
    front: [{ id: 'o', type: 'door', doorCount: 1, heightIn: 'auto', doorStyle }],
  };
  const { parts, nodes } = buildCabinet(cab, {
    index: 1, runKind: 'upper', depthIn: 12, carcassHeightIn: 30, legHeightIn: 0, hasLegs: false,
    materialIdByRole: {}, colorByRole: {}, textureByRole: {}, defaults: projectDefaults(),
  });
  return { face: parts.filter((p) => p.role === 'face'), nodes };
}

describe('door styles', () => {
  it('slab (default) makes a single overlay face panel', () => {
    const { face } = doorParts(); // unset ⇒ slab
    expect(face).toHaveLength(1);
    expect(face[0].id).toBe('C1-DOOR1');
    expect(face[0].qty).toBe(1);
    // 18" wide cabinet ⇒ 17.875" face; 30" carcass single auto door ⇒ 29.875" tall.
    expect([face[0].wIn, face[0].lIn]).toEqual([17.875, 29.875]);
  });

  it('shaker makes a frame (2 stiles + 2 rails) and a recessed panel', () => {
    const { face } = doorParts('shaker');
    const byId = Object.fromEntries(face.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual(['C1-DOOR1-PANEL', 'C1-DOOR1-RAIL', 'C1-DOOR1-STILE']);
    expect(byId['C1-DOOR1-STILE'].qty).toBe(2);
    expect(byId['C1-DOOR1-RAIL'].qty).toBe(2);
    expect(byId['C1-DOOR1-PANEL'].qty).toBe(1);
    // Stiles run the full face height; the panel is thinner stock.
    expect(byId['C1-DOOR1-STILE'].lIn).toBeCloseTo(29.875, 4);
    expect(byId['C1-DOOR1-PANEL'].thicknessIn).toBeLessThan(byId['C1-DOOR1-STILE'].thicknessIn);
  });

  it('a shaker pair emits no colliding part ids and doubles the frame qty', () => {
    const cab: Cabinet = { id: 'A', widthIn: 30, front: [{ id: 'o', type: 'door', doorCount: 2, heightIn: 'auto', doorStyle: 'shaker' }] };
    const { parts } = buildCabinet(cab, {
      index: 1, runKind: 'upper', depthIn: 12, carcassHeightIn: 30, legHeightIn: 0, hasLegs: false,
      materialIdByRole: {}, colorByRole: {}, textureByRole: {}, defaults: projectDefaults(),
    });
    const ids = parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // unique
    expect(parts.find((p) => p.id === 'C1-DOOR1-STILE')!.qty).toBe(4); // 2 leaves × 2 stiles
  });
});
