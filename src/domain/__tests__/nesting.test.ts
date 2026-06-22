import { describe, expect, it } from 'vitest';
import { nestParts } from '../cutlist/nesting';
import { buildCutList } from '../cutlist/collectParts';
import { seedProject } from '../seed';
import type { Part } from '../types';

function mkPart(id: string, w: number, l: number, qty: number, grainLocked = true): Part {
  return { id, label: id, role: 'carcass', cabinetId: 'c', materialId: 'm', thicknessIn: 0.75, wIn: w, lIn: l, qty, edgeBandEdges: [], joinery: [], grainLocked };
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe('nesting', () => {
  it('places all parts within sheet bounds with no overlaps', () => {
    const parts = [mkPart('A', 23.25, 30, 2), mkPart('B', 22.5, 23.25, 4), mkPart('C', 5, 30, 6)];
    const r = nestParts(parts, 48, 96, 0.125);
    expect(r.oversize).toHaveLength(0);
    for (const sheet of r.sheets) {
      for (const p of sheet.placements) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(48 + 1e-6);
        expect(p.y + p.h).toBeLessThanOrEqual(96 + 1e-6);
      }
      for (let i = 0; i < sheet.placements.length; i++) {
        for (let j = i + 1; j < sheet.placements.length; j++) {
          expect(overlaps(sheet.placements[i], sheet.placements[j])).toBe(false);
        }
      }
    }
    const totalPlaced = r.sheets.reduce((s, sh) => s + sh.placements.length, 0);
    expect(totalPlaced).toBe(2 + 4 + 6);
  });

  it('prefers a guillotine layout whose rows are separable by straight cuts', () => {
    const parts = [mkPart('A', 23.25, 30, 4), mkPart('B', 11, 30, 4), mkPart('C', 15, 20, 4)];
    const r = nestParts(parts, 48, 96, 0.125);
    expect(r.straightCuts).toBe(true);
    for (const sheet of r.sheets) {
      // Group placements into rows by their top edge; a guillotine layout's rows
      // must not vertically overlap (a full-width rip can separate them).
      const byRow = new Map<number, { y: number; bottom: number }[]>();
      for (const p of sheet.placements) {
        const k = Math.round(p.y * 1000);
        if (!byRow.has(k)) byRow.set(k, []);
        byRow.get(k)!.push({ y: p.y, bottom: p.y + p.h });
      }
      const rows = [...byRow.values()].map((ps) => ({ y: ps[0].y, bottom: Math.max(...ps.map((p) => p.bottom)) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < rows.length; i++) expect(rows[i].y).toBeGreaterThanOrEqual(rows[i - 1].bottom - 1e-6);
    }
  });

  it('grain-locked parts are never rotated', () => {
    const r = nestParts([mkPart('G', 10, 90, 1, true)], 48, 96, 0.125);
    expect(r.sheets[0].placements[0].rotated).toBe(false);
  });

  it('flags oversize parts instead of crashing', () => {
    const r = nestParts([mkPart('Big', 60, 120, 1)], 48, 96, 0.125);
    expect(r.oversize).toHaveLength(1);
  });

  it('builds a cut list for the seed project', () => {
    const cl = buildCutList(seedProject());
    expect(cl.groups.length).toBeGreaterThan(0);
    expect(cl.totalSheets).toBeGreaterThan(0);
    expect(cl.totalBandingIn).toBeGreaterThan(0);
    // every part has an ID
    for (const g of cl.groups) for (const p of g.parts) expect(p.id).toBeTruthy();
  });
});
