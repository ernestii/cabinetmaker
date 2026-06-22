import { describe, expect, it } from 'vitest';
import { buildProject } from '../geometry/buildProject';
import { buildCutList } from '../cutlist/collectParts';
import { buildCost } from '../cutlist/cost';
import { seedProject } from '../seed';

describe('countertop enable toggle', () => {
  it('seed builds a counter slab by default', () => {
    const p = seedProject();
    const out = buildProject(p);
    expect(out.nodes.some((n) => n.kind === 'counter')).toBe(true);
    expect(out.parts.some((part) => part.role === 'counter')).toBe(true);
    expect(buildCutList(p).linearStock.length).toBeGreaterThan(0);
    expect(buildCost(p).counter.slabs).toBeGreaterThan(0);
  });

  it('skips counters everywhere when disabled', () => {
    const p = seedProject();
    p.defaults.countertopEnabled = false;
    const out = buildProject(p);
    expect(out.nodes.some((n) => n.kind === 'counter')).toBe(false);
    expect(out.parts.some((part) => part.role === 'counter')).toBe(false);
    expect(buildCutList(p).linearStock.length).toBe(0);
    const cost = buildCost(p);
    expect(cost.counter.slabs).toBe(0);
    expect(cost.counterCost).toBe(0);
  });

  it('counts extra slabs for a run longer than one slab', () => {
    // A run longer than the counter material's slab length needs >1 slab.
    const p = seedProject();
    const counterMat = p.materials.find((m) => m.roles.includes('counter'))!;
    const cost = buildCost(p);
    const longRun = buildCutList(p).linearStock.some((part) => part.lIn > counterMat.sheetH);
    if (longRun) expect(cost.counter.slabs).toBeGreaterThan(1);
    expect(cost.counter.slabs).toBeGreaterThanOrEqual(1);
  });
});
