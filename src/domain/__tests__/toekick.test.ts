import { describe, expect, it } from 'vitest';
import { buildProject } from '../geometry/buildProject';
import { newProject } from '../seed';
import type { WallElement } from '../types';

/** A base cabinet element at the given x. */
function baseEl(id: string, x: number, widthIn: number): WallElement {
  return {
    id, xIn: x, widthIn, zone: 'base',
    cabinet: { id: `cab-${id}`, widthIn, front: [{ id: `op-${id}`, type: 'door', doorCount: 1, heightIn: 'auto' }] },
  };
}

/** Lay base cabinets out left→right with cumulative x. */
function layout(widths: number[]): WallElement[] {
  let x = 0;
  return widths.map((w, i) => {
    const el = baseEl(`b${i}`, x, w);
    x += w;
    return el;
  });
}

describe('toekick auto-split', () => {
  it('splits a long run at cabinet joins into stock-sized pieces', () => {
    const proj = newProject();
    // Four 36" base cabinets → a 144" toekick run; toekick stock is 48×96.
    proj.rooms[0].walls[0].elements = layout([36, 36, 36, 36]);
    proj.rooms[0].walls[0].lengthIn = 144;

    const { parts } = buildProject(proj);
    const toe = parts.filter((p) => p.role === 'toekick');

    expect(toe.length).toBeGreaterThan(1);
    // Every piece fits the stock's longest dimension (96").
    for (const p of toe) expect(p.lIn).toBeLessThanOrEqual(96 + 1e-6);
    // Pieces break on cabinet joins, so each length is a whole number of 36" cabinets.
    for (const p of toe) expect(p.lIn % 36).toBeCloseTo(0);
    // The pieces still cover the full run.
    expect(toe.reduce((s, p) => s + p.lIn, 0)).toBeCloseTo(144);
    // IDs stay unique.
    const ids = toe.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps a short run as a single Toekick part', () => {
    const proj = newProject();
    proj.rooms[0].walls[0].elements = layout([30, 24]);
    proj.rooms[0].walls[0].lengthIn = 54;
    const toe = buildProject(proj).parts.filter((p) => p.role === 'toekick');
    expect(toe.length).toBe(1);
    expect(toe[0].lIn).toBeCloseTo(54);
    expect(toe[0].label).toBe('Toekick');
  });
});
