import { describe, expect, it } from 'vitest';
import { buildLabor } from '../cutlist/labor';
import { seedProject } from '../seed';

describe('labor estimate', () => {
  it('produces task line items and a positive total for the seed project', () => {
    const l = buildLabor(seedProject());
    expect(l.items.length).toBeGreaterThan(0);
    expect(l.totalHours).toBeGreaterThan(0);
    // hours of each item is count × hoursEach
    for (const it of l.items) expect(it.hours).toBeCloseTo(it.count * it.hoursEach, 6);
    expect(l.totalHours).toBeCloseTo(l.items.reduce((s, i) => s + i.hours, 0), 6);
  });

  it('only prices labour when a rate is set', () => {
    const base = seedProject();
    expect(buildLabor(base).cost).toBe(0);
    const priced = { ...base, pricing: { ...base.pricing!, laborPerHour: 40 } };
    const l = buildLabor(priced);
    expect(l.cost).toBeCloseTo(l.totalHours * 40, 6);
  });
});
