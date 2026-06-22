import { describe, expect, it } from 'vitest';
import { nestParts, type CutStep, type PackedSheet } from '../cutlist/nesting';
import { buildCutList, summarizeSheetParts } from '../cutlist/collectParts';
import { buildProject } from '../geometry/buildProject';
import { seedProject } from '../seed';
import type { Part } from '../types';

function mkPart(id: string, w: number, l: number, qty: number, grainLocked = true): Part {
  return { id, label: id, role: 'carcass', cabinetId: 'c', materialId: 'm', thicknessIn: 0.75, wIn: w, lIn: l, qty, edgeBandEdges: [], joinery: [], grainLocked };
}

const KERF = 0.125;

function cuts(sheet: PackedSheet): CutStep[] {
  expect(sheet.cuts).toBeDefined();
  return sheet.cuts!;
}

describe('cut sequence (guillotine layouts)', () => {
  it('rip positions land at strip boundaries, kerf accounted for', () => {
    // Tallest-first shelf packing: 40×30 strip on top, 40×20 below at y = 30 + kerf.
    const r = nestParts([mkPart('A', 40, 30, 1), mkPart('B', 40, 20, 1)], 48, 96, KERF, true);
    expect(r.straightCuts).toBe(true);
    const rips = cuts(r.sheets[0]).filter((c) => c.kind === 'rip');
    expect(rips.map((c) => c.posIn)).toEqual([30, 50.125]);
    expect(rips.map((c) => c.sizeIn)).toEqual([30, 20]);
    expect(rips.map((c) => c.shelfIndex)).toEqual([0, 1]);
  });

  it('crosscuts run left to right within a strip, suppressed when flush with the edge', () => {
    const r = nestParts([mkPart('A', 20, 30, 1), mkPart('B', 15, 30, 1)], 48, 96, KERF, true);
    const cross = cuts(r.sheets[0]).filter((c) => c.kind === 'crosscut');
    expect(cross.map((c) => c.posIn)).toEqual([20, 35.125]);
    expect(cross.map((c) => c.partId)).toEqual(['A', 'B']);
    expect(cross.every((c) => c.shelfIndex === 0)).toBe(true);

    // A full-width part needs no crosscut at all.
    const full = nestParts([mkPart('F', 48, 30, 1)], 48, 96, KERF, true);
    expect(cuts(full.sheets[0]).filter((c) => c.kind === 'crosscut')).toHaveLength(0);
  });

  it('skips the trailing-offcut rip when nothing usable remains', () => {
    // Part fills the whole sheet: zero cuts.
    const whole = nestParts([mkPart('W', 48, 96, 1)], 48, 96, KERF, true);
    expect(cuts(whole.sheets[0])).toHaveLength(0);
    // Leftover below is smaller than the kerf: still no rip.
    const sliver = nestParts([mkPart('S', 48, 95.9375, 1)], 48, 96, KERF, true);
    expect(cuts(sliver.sheets[0])).toHaveLength(0);
    // A real offcut below gets freed by one rip.
    const off = nestParts([mkPart('O', 48, 60, 1)], 48, 96, KERF, true);
    const offCuts = cuts(off.sheets[0]);
    expect(offCuts).toHaveLength(1);
    expect(offCuts[0]).toMatchObject({ kind: 'rip', posIn: 60, sizeIn: 60, order: 1 });
  });

  it('emits a trim right after the crosscut that frees a shorter-than-strip piece', () => {
    // A (20×30) sets the strip height; B (20×20) tucks in beside it and needs a trim.
    const r = nestParts([mkPart('A', 20, 30, 1), mkPart('B', 20, 20, 1)], 48, 96, KERF, true);
    const seq = cuts(r.sheets[0]);
    const bCross = seq.findIndex((c) => c.kind === 'crosscut' && c.partId === 'B');
    const bTrim = seq.findIndex((c) => c.kind === 'trim' && c.partId === 'B');
    expect(bTrim).toBe(bCross + 1);
    expect(seq[bTrim]).toMatchObject({ posIn: 20, sizeIn: 20, shelfIndex: 0 });
    // A is full strip height — no trim for it.
    expect(seq.some((c) => c.kind === 'trim' && c.partId === 'A')).toBe(false);
  });

  it('orders cuts 1..N with all rips before crosscuts, crosscuts ascending within each strip', () => {
    const r = nestParts([mkPart('A', 23.25, 30, 4), mkPart('B', 11, 30, 4), mkPart('C', 15, 20, 4)], 48, 96, KERF, true);
    for (const sheet of r.sheets) {
      const seq = cuts(sheet);
      expect(seq.map((c) => c.order)).toEqual(seq.map((_, i) => i + 1));
      const lastRip = seq.map((c) => c.kind).lastIndexOf('rip');
      const firstCross = seq.findIndex((c) => c.kind !== 'rip');
      if (lastRip >= 0 && firstCross >= 0) expect(lastRip).toBeLessThan(firstCross);
      // Crosscuts can be reshuffled across strips (to batch by fence width), but
      // within a single strip they must still run left-to-right.
      const byShelf = new Map<number, CutStep[]>();
      for (const c of seq.filter((c) => c.kind === 'crosscut')) {
        if (!byShelf.has(c.shelfIndex)) byShelf.set(c.shelfIndex, []);
        byShelf.get(c.shelfIndex)!.push(c);
      }
      for (const list of byShelf.values()) {
        for (let i = 1; i < list.length; i++) expect(list[i].posIn).toBeGreaterThan(list[i - 1].posIn);
      }
    }
  });

  it('batches crosscuts by fence width so each width is one contiguous run', () => {
    // Four strips of two parts each, alternating 22"/23" wide (the door-bank
    // case): distinct heights keep each pair on its own strip. Tallest-first.
    const r = nestParts(
      [
        mkPart('A', 22, 10, 2), mkPart('B', 23, 9, 2),
        mkPart('C', 22, 8, 2), mkPart('D', 23, 7, 2),
      ],
      48, 96, KERF, true,
    );
    const seq = cuts(r.sheets[0]);
    const widths = seq.filter((c) => c.kind === 'crosscut').map((c) => c.sizeIn);
    // Both widths show up...
    expect(new Set(widths)).toEqual(new Set([22, 23]));
    // ...and the stop block is set exactly once per width: each width is a single
    // unbroken run, so the number of runs equals the number of distinct widths.
    const runs = widths.filter((w, i) => i === 0 || w !== widths[i - 1]).length;
    expect(runs).toBe(new Set(widths).size);
  });

  it('no placement straddles a cut line (seed project, straight cuts on)', () => {
    const project = seedProject();
    project.defaults.straightCuts = true;
    const cl = buildCutList(project);
    for (const g of cl.groups) {
      if (!g.nesting?.straightCuts) continue;
      for (const sheet of g.nesting.sheets) {
        const seq = cuts(sheet);
        for (const c of seq) {
          for (const p of sheet.placements) {
            if (c.kind === 'rip') {
              expect(c.posIn <= p.y + 1e-6 || c.posIn >= p.y + p.h - 1e-6).toBe(true);
            } else if (c.kind === 'crosscut' && p.shelfIndex === c.shelfIndex) {
              expect(c.posIn <= p.x + 1e-6 || c.posIn >= p.x + p.w - 1e-6).toBe(true);
            }
          }
        }
      }
    }
  });

  it('dense (MaxRects) layouts carry no cut sequence', () => {
    // Lots of mixed sizes where dense packing wins a sheet: force the comparison.
    const parts = [mkPart('A', 30, 60, 2, false), mkPart('B', 17, 35, 4, false), mkPart('C', 12, 20, 6, false)];
    const r = nestParts(parts, 48, 96, KERF, false);
    if (!r.straightCuts) {
      for (const sheet of r.sheets) {
        expect(sheet.cuts).toBeUndefined();
        expect(sheet.shelves).toBeUndefined();
      }
    }
  });

  it('uses the as-placed footprint for rotated parts', () => {
    const r = nestParts([mkPart('R', 10, 40, 1, false)], 48, 96, KERF, true);
    const p = r.sheets[0].placements[0];
    expect(p.rotated).toBe(true); // 40 wide × 10 tall packs a flatter shelf
    const seq = cuts(r.sheets[0]);
    const rip = seq.find((c) => c.kind === 'rip')!;
    expect(rip.posIn).toBe(10);
    const cross = seq.find((c) => c.kind === 'crosscut')!;
    expect(cross.posIn).toBe(40);
  });
});

describe('node ↔ part link (partId on Node3D)', () => {
  it('every sheet part placed on a diagram maps to at least one 3D node of its cabinet', () => {
    const project = seedProject();
    const cl = buildCutList(project);
    const scene = buildProject(project);
    const taggedIds = new Set(scene.nodes.map((n) => n.partId).filter(Boolean));
    for (const g of cl.groups) {
      for (const p of g.parts) {
        expect(taggedIds.has(p.id), `part ${p.id} has no tagged node`).toBe(true);
      }
    }
  });
});

describe('summarizeSheetParts', () => {
  it('rolls placements up per part with finished dims, even when rotated', () => {
    const parts = [mkPart('A', 10, 40, 3, false), mkPart('B', 20, 30, 2)];
    const r = nestParts(parts, 48, 96, KERF, true);
    let total = 0;
    for (const sheet of r.sheets) {
      const rows = summarizeSheetParts(sheet, parts);
      // Sorted by id, numeric-aware.
      expect(rows.map((x) => x.partId)).toEqual(rows.map((x) => x.partId).slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
      for (const row of rows) {
        const part = parts.find((p) => p.id === row.partId)!;
        expect(row.wIn).toBe(part.wIn);
        expect(row.lIn).toBe(part.lIn);
        expect(row.thicknessIn).toBe(part.thicknessIn);
        const placed = sheet.placements.filter((pl) => pl.partId === row.partId);
        expect(row.qtyOnSheet).toBe(placed.length);
        expect(row.rotatedOnSheet).toBe(placed.filter((pl) => pl.rotated).length);
        total += row.qtyOnSheet;
      }
    }
    expect(total).toBe(3 + 2);
  });
});
