import { describe, expect, it } from 'vitest';
import { elementVertical } from '../elements';
import { wallMetrics } from '../geometry/metrics';
import { projectDefaults } from '../seed';
import type { Project, Wall, WallElement } from '../types';

const d = projectDefaults();
const wall: Wall = { id: 'w', name: 'W', lengthIn: 120, ceilingHeightIn: 96, elements: [] };
const m = wallMetrics({ defaults: d } as Project, wall);
const el = (zone: WallElement['zone'], extra: Partial<WallElement> = {}): WallElement => ({ id: 'e', xIn: 0, widthIn: 24, zone, ...extra });

describe('elementVertical ceiling-gap override', () => {
  it('drops an upper below the ceiling without changing its height', () => {
    const base = elementVertical(el('upper'), wall, m, d);
    const dropped = elementVertical(el('upper', { ceilingGapOverrideIn: 14 }), wall, m, d);
    expect(dropped.carcassH).toBe(base.carcassH); // height unchanged
    expect(base.yBottom - dropped.yBottom).toBeCloseTo(14); // hangs 14" lower
    expect(dropped.yBottom + dropped.carcassH).toBeCloseTo(wall.ceilingHeightIn - 14); // top is 14" below ceiling
  });

  it('shortens a tall column from the top, keeping it on the floor', () => {
    const base = elementVertical(el('tall'), wall, m, d);
    const shortened = elementVertical(el('tall', { ceilingGapOverrideIn: 12 }), wall, m, d);
    expect(shortened.yBottom).toBe(base.yBottom); // still stands on its legs
    expect(base.carcassH - shortened.carcassH).toBeCloseTo(12);
    expect(shortened.yBottom + shortened.carcassH).toBeCloseTo(wall.ceilingHeightIn - 12);
  });

  it('never produces a negative carcass height', () => {
    const v = elementVertical(el('tall', { ceilingGapOverrideIn: 1000 }), wall, m, d);
    expect(v.carcassH).toBeGreaterThan(0);
  });
});
