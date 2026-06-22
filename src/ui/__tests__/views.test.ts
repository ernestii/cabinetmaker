import { describe, expect, it } from 'vitest';
import { VIEWS, NAV_GROUPS, groupForView } from '../views';

// The mobile bottom-nav collapses the flat view list into grouped tabs. These
// guard that the grouping stays a total partition of the views — every view is
// reachable through exactly one group (so nothing falls off the phone nav).
describe('nav groups', () => {
  it('cover every view exactly once', () => {
    const grouped = NAV_GROUPS.flatMap((g) => g.views);
    expect([...grouped].sort()).toEqual(VIEWS.map((v) => v.key).sort());
    expect(grouped.length).toBe(new Set(grouped).size); // no view in two groups
  });

  it('map each view back to its group', () => {
    for (const v of VIEWS) {
      const g = groupForView(v.key);
      expect(g.views).toContain(v.key);
    }
  });

  it('keep Layout/3D and the three plan views together', () => {
    expect(groupForView('layout').key).toBe('design');
    expect(groupForView('3d').key).toBe('design');
    expect(groupForView('cutlist').key).toBe('plan');
    expect(groupForView('shopping').key).toBe('plan');
    expect(groupForView('assembly').key).toBe('plan');
  });
});
