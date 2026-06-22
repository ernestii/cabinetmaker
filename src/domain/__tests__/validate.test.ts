import { describe, expect, it } from 'vitest';
import { validateProject, type WarningKind } from '../validate';
import { defaultMaterials, defaultPricing, projectDefaults } from '../seed';
import type { Material, Opening, Project, ProjectDefaults, WallElement } from '../types';

let n = 0;
const op = (type: Opening['type'], extra: Partial<Opening> = {}): Opening => ({ id: `op-${(n += 1)}`, type, heightIn: 'auto', ...extra });

const cabEl = (x: number, w: number, front: Opening[], extra: Partial<WallElement> = {}): WallElement => ({
  id: `el-${(n += 1)}`, xIn: x, widthIn: w, zone: 'base', cabinet: { id: `cab-${n}`, widthIn: w, front }, ...extra,
});
const applianceEl = (x: number, w: number, fixtureId: string, zone: WallElement['zone'] = 'base'): WallElement => ({
  id: `el-${(n += 1)}`, xIn: x, widthIn: w, zone, fixtureId,
});

const project = (elements: WallElement[], defaults: Partial<ProjectDefaults> = {}, materials?: Material[]): Project => ({
  id: 'p', name: 'T', units: 'in',
  materials: materials ?? defaultMaterials(),
  defaults: { ...projectDefaults(), ...defaults },
  pricing: defaultPricing(),
  rooms: [{ id: 'r', name: 'R', walls: [{ id: 'w', name: 'W', lengthIn: 480, ceilingHeightIn: 96, elements }] }],
});

const ofKind = (p: Project, kind: WarningKind) => validateProject(p).filter((w) => w.kind === kind);

// A sane 24" base door cabinet (with a shelf) as the quiet baseline.
const quietBase = (x = 0, w = 24) => cabEl(x, w, [op('door', { doorCount: 1, shelves: 1 })]);

describe('door sanity', () => {
  it('flags a huge single door and suggests a pair', () => {
    const warns = ofKind(project([cabEl(0, 40, [op('door', { doorCount: 1 })])]), 'door');
    expect(warns.length).toBe(1);
    expect(warns[0].message).toMatch(/single door/);
    expect(warns[0].message).toMatch(/pair/);
  });

  it('flags a pair whose leaves are still too wide', () => {
    // 60" cabinet → ~29 7/8" per leaf even as a pair.
    const p = project([cabEl(0, 60, [op('door', { doorCount: 2 })])]);
    expect(ofKind(p, 'door').some((w) => /leaf/.test(w.message) && /split/.test(w.message))).toBe(true);
  });

  it('flags a pair of slivers on a narrow cabinet', () => {
    // 8" cabinet → ~3 7/8" per leaf.
    const p = project([cabEl(0, 8, [op('door', { doorCount: 2, shelves: 1 })])]);
    expect(ofKind(p, 'door').some((w) => /single door/.test(w.message))).toBe(true);
  });

  it('stays quiet for ordinary doors', () => {
    const p = project([quietBase(0, 24), cabEl(24, 36, [op('door', { doorCount: 2, shelves: 1 })])]);
    expect(ofKind(p, 'door')).toEqual([]);
  });
});

describe('shelfless cavity', () => {
  it('flags a tall door cabinet with no shelves', () => {
    const p = project([cabEl(0, 24, [op('door', { doorCount: 2 })], { zone: 'tall' })]);
    const warns = ofKind(p, 'shelves');
    expect(warns.length).toBe(1);
    expect(warns[0].message).toMatch(/no shelves/);
  });

  it('stays quiet once shelves are added, and for short base doors', () => {
    expect(ofKind(project([cabEl(0, 24, [op('door', { doorCount: 2, shelves: 4 })], { zone: 'tall' })]), 'shelves')).toEqual([]);
    expect(ofKind(project([quietBase()]), 'shelves')).toEqual([]); // ~30" base opening: fine without shelves
  });
});

describe('cabinet footprint sanity', () => {
  it('flags too-wide, too-narrow and weird-depth cabinets', () => {
    const p = project([
      cabEl(0, 60, [op('door', { doorCount: 2, shelves: 1 })]),
      cabEl(70, 7, [op('door', { doorCount: 1, shelves: 1 })]),
      cabEl(90, 24, [op('door', { doorCount: 1, shelves: 1 })], { depthOverrideIn: 36 }),
    ]);
    const msgs = ofKind(p, 'cabinetSize').map((w) => w.message);
    expect(msgs.some((m) => /split it/.test(m))).toBe(true);
    expect(msgs.some((m) => /too narrow/.test(m))).toBe(true);
    expect(msgs.some((m) => /unusual carcass depth/.test(m))).toBe(true);
  });

  it('does not flag a standard 48" range (appliances are not cabinets)', () => {
    expect(ofKind(project([applianceEl(0, 48, 'range'), applianceEl(0, 48, 'hood', 'upper')]), 'cabinetSize')).toEqual([]);
  });
});

describe('counter ↔ upper clearance', () => {
  // Ceiling 96", upper 30" tall; a 22" ceiling gap drops its bottom to 44" — only 8" over a 36" counter.
  const lowUpper = (extra: Partial<WallElement> = {}) =>
    cabEl(0, 24, [op('door', { doorCount: 2, shelves: 1 })], { zone: 'upper', ceilingGapOverrideIn: 22, ...extra });

  it('flags an upper hovering just above the counter', () => {
    const warns = ofKind(project([quietBase(), lowUpper()]), 'clearance');
    expect(warns.length).toBe(1);
    expect(warns[0].message).toMatch(/between the countertop and the upper/);
  });

  it('stays quiet with nothing below, or at a normal height', () => {
    expect(ofKind(project([lowUpper({ xIn: 60 })]), 'clearance')).toEqual([]);
    expect(ofKind(project([quietBase(), cabEl(0, 24, [op('door', { doorCount: 2, shelves: 1 })], { zone: 'upper' })]), 'clearance')).toEqual([]);
  });
});

describe('upper deeper than the base below', () => {
  const upperAt = (depth: number) => cabEl(0, 24, [op('door', { doorCount: 2, shelves: 1 })], { zone: 'upper', depthOverrideIn: depth });

  it('flags an upper as deep as the base (head-banger)', () => {
    const warns = ofKind(project([quietBase(), upperAt(24)]), 'depth');
    expect(warns.some((w) => /hit your head/.test(w.message))).toBe(true);
  });

  it('flags an upper that leaves a sliver of open counter', () => {
    const warns = ofKind(project([quietBase(), upperAt(20)]), 'depth');
    expect(warns.some((w) => /open counter/.test(w.message))).toBe(true);
  });

  it('stays quiet for a standard 12" upper over a 24" base', () => {
    expect(ofKind(project([quietBase(), upperAt(12)]), 'depth')).toEqual([]);
  });
});

describe('uneven adjacent depths', () => {
  it('flags touching base cabinets at different depths', () => {
    const p = project([quietBase(0, 24), cabEl(24, 24, [op('door', { doorCount: 1, shelves: 1 })], { depthOverrideIn: 21 })]);
    const warns = ofKind(p, 'depth');
    expect(warns.length).toBe(1);
    expect(warns[0].message).toMatch(/different depths/);
  });

  it('ignores cabinets separated by a gap', () => {
    const p = project([quietBase(0, 24), cabEl(36, 24, [op('door', { doorCount: 1, shelves: 1 })], { depthOverrideIn: 21 })]);
    expect(ofKind(p, 'depth')).toEqual([]);
  });
});

describe('range with no hood', () => {
  it('flags a range without a hood overlapping above', () => {
    const warns = ofKind(project([applianceEl(0, 30, 'range')]), 'missingHood');
    expect(warns.length).toBe(1);
    expect(warns[0].message).toMatch(/hood/);
  });

  it('is satisfied by a hood overlapping the range in x', () => {
    expect(ofKind(project([applianceEl(0, 30, 'range'), applianceEl(0, 30, 'hood', 'upper')]), 'missingHood')).toEqual([]);
  });

  it('a hood off to the side does not count', () => {
    expect(ofKind(project([applianceEl(0, 30, 'range'), applianceEl(60, 30, 'hood', 'upper')]), 'missingHood').length).toBe(1);
  });
});

describe('toe kick sanity', () => {
  it('flags a missing and a too-low toe kick', () => {
    expect(ofKind(project([quietBase()], { legHeightIn: 0 }), 'toekick')[0].message).toMatch(/No toe kick/);
    expect(ofKind(project([quietBase()], { legHeightIn: 1.5 }), 'toekick')[0].message).toMatch(/too low/);
  });

  it('only nags when something stands on the floor', () => {
    const uppersOnly = project([cabEl(0, 24, [op('door', { doorCount: 2, shelves: 1 })], { zone: 'upper' })], { legHeightIn: 0 });
    expect(ofKind(uppersOnly, 'toekick')).toEqual([]);
  });
});

describe('counter setup sanity', () => {
  it('flags an unusable counter height (gated on a base run existing)', () => {
    expect(ofKind(project([quietBase()], { counterHeightIn: 24 }), 'counter')[0].message).toMatch(/unusually low/);
    expect(ofKind(project([quietBase()], { counterHeightIn: 50 }), 'counter')[0].message).toMatch(/unusually high/);
    expect(ofKind(project([], { counterHeightIn: 24 }), 'counter')).toEqual([]);
  });

  it('flags a weird counter thickness', () => {
    expect(ofKind(project([quietBase()], { counterThicknessIn: 0.25 }), 'counter')[0].message).toMatch(/too thin/);
    expect(ofKind(project([quietBase()], { counterThicknessIn: 4 }), 'counter')[0].message).toMatch(/unusually thick/);
    expect(ofKind(project([quietBase()]), 'counter')).toEqual([]); // the 1.5" default is fine
  });
});

describe('questionable sheet stock', () => {
  it('flags panels too thin for their role', () => {
    const thin: Material[] = [
      ...defaultMaterials(),
      { id: 'm-thin', name: '1/4" Lauan', thicknessIn: 0.25, color: '#ccc', grained: false, roles: ['carcass', 'face'], sheetW: 48, sheetH: 96, kerfIn: 0.125 },
    ];
    const msgs = ofKind(project([quietBase()], {}, thin), 'material').map((w) => w.message);
    expect(msgs.some((m) => /carcass panels/.test(m))).toBe(true);
    expect(msgs.some((m) => /hinge cup/.test(m))).toBe(true);
  });

  it('stays quiet on the default stock list', () => {
    expect(ofKind(project([quietBase()]), 'material')).toEqual([]);
  });
});
