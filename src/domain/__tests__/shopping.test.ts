import { describe, expect, it } from 'vitest';
import { buildShoppingList } from '../shopping/buildShoppingList';
import { buildCost } from '../cutlist/cost';
import { seedProject } from '../seed';

describe('buildShoppingList', () => {
  const project = seedProject();
  const list = buildShoppingList(project);

  it('groups the buy into departments with positive subtotals', () => {
    expect(list.sections.length).toBeGreaterThan(0);
    const titles = list.sections.map((s) => s.title);
    expect(titles).toContain('Sheet goods');
    expect(titles).toContain('Hardware');
    for (const sec of list.sections) {
      expect(sec.items.length).toBeGreaterThan(0);
      expect(sec.subtotal).toBeGreaterThan(0);
      // each subtotal is the sum of its line totals
      const sum = sec.items.reduce((s, i) => s + i.total, 0);
      expect(Math.abs(sum - sec.subtotal)).toBeLessThan(0.02);
    }
  });

  it('total reconciles with the cost estimate', () => {
    const cost = buildCost(project);
    expect(Math.abs(list.total - cost.total)).toBeLessThan(0.05);
  });

  it('includes a countertop department for the seed (counters on)', () => {
    expect(list.sections.some((s) => s.title === 'Countertops')).toBe(true);
  });

  it('drops the countertop department when counters are turned off', () => {
    const off = { ...project, defaults: { ...project.defaults, countertopEnabled: false } };
    const offList = buildShoppingList(off);
    expect(offList.sections.some((s) => s.title === 'Countertops')).toBe(false);
    expect(offList.total).toBeLessThan(list.total);
  });
});
