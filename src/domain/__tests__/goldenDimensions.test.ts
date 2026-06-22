import { describe, expect, it } from 'vitest';
import { buildCabinet } from '../geometry/buildCabinet';
import { projectDefaults } from '../seed';
import type { Cabinet } from '../types';

/**
 * Golden cut dimensions for a 24"w × 24"d base cabinet (3/4" carcass, 1/2"
 * back, 30" box) with an 8" drawer over an auto door. Every number here was
 * hand-verified against frameless euro construction; this test locks them so a
 * geometry change can't silently shift a real cut.
 */
describe('golden carcass dimensions', () => {
  const cab: Cabinet = {
    id: 'A', widthIn: 24,
    front: [
      { id: 'd', type: 'drawer', heightIn: 8 },
      { id: 'o', type: 'door', doorCount: 1, heightIn: 'auto' },
    ],
  };
  const { parts } = buildCabinet(cab, {
    index: 1, runKind: 'base', depthIn: 24, carcassHeightIn: 30, legHeightIn: 4.5, hasLegs: true,
    materialIdByRole: {}, colorByRole: {}, textureByRole: {}, defaults: projectDefaults(),
  });
  const part = (id: string) => parts.find((p) => p.id === id)!;
  const dims = (id: string) => { const p = part(id); return [p.wIn, p.lIn, p.qty, p.thicknessIn]; };

  it('carcass parts', () => {
    expect(dims('C1-SIDE')).toEqual([24, 30, 2, 0.75]);
    expect(dims('C1-BOT')).toEqual([22.5, 24, 1, 0.75]);
    expect(dims('C1-STR')).toEqual([22.5, 4, 2, 0.75]);
    expect(dims('C1-BACK')).toEqual([22.5, 28.5, 1, 0.5]);
  });

  it('drawer box parts', () => {
    // 8" module → 7.875" face → box height 6.875" (face − 1").
    expect(dims('C1-DR1-SIDE')).toEqual([22, 6.875, 2, 0.5]);
    expect(dims('C1-DR1-FB')).toEqual([21, 6.875, 2, 0.5]);
    expect(dims('C1-DR1-BOT')).toEqual([21, 21.5, 1, 0.5]);
  });

  it('faces (full-overlay reveal closes the stack)', () => {
    // Module model: the 8" slot cuts a 7.875" face; the auto door takes the rest.
    expect(dims('C1-DR1-FACE')).toEqual([23.875, 7.875, 1, 0.75]);
    expect(dims('C1-DOOR1').slice(0, 2)).toEqual([23.875, 21.875]);
    // drawer + door + total reveal (2 fronts × 1/8") == carcass height
    expect(part('C1-DR1-FACE').lIn + part('C1-DOOR1').lIn + 0.25).toBeCloseTo(30, 6);
  });

  it('adjustable shelves (behind a door, never behind a drawer)', () => {
    const params = {
      index: 1, runKind: 'base' as const, depthIn: 24, carcassHeightIn: 30, legHeightIn: 4.5, hasLegs: true,
      materialIdByRole: {}, colorByRole: {}, textureByRole: {}, defaults: projectDefaults(),
    };
    const shelfCab: Cabinet = { id: 'S', widthIn: 24, front: [{ id: 'o', type: 'door', doorCount: 2, heightIn: 'auto', shelves: 2 }] };
    const shelf = buildCabinet(shelfCab, params).parts.find((p) => p.id === 'C1-SH1')!;
    // innerW − 1/8 clearance × (depth − back − 3/4 setback), 3/4 stock, qty 2
    expect([shelf.wIn, shelf.lIn, shelf.qty, shelf.thicknessIn]).toEqual([22.375, 22.75, 2, 0.75]);

    const drawerCab: Cabinet = { id: 'D', widthIn: 24, front: [{ id: 'd', type: 'drawer', heightIn: 'auto', shelves: 3 }] };
    expect(buildCabinet(drawerCab, params).parts.some((p) => p.id.includes('-SH'))).toBe(false);
  });
});
