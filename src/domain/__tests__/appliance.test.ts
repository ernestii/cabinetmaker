import { describe, expect, it } from 'vitest';
import { buildProject } from '../geometry/buildProject';
import { buildShoppingList } from '../shopping/buildShoppingList';
import { defaultMaterials, defaultPricing, projectDefaults } from '../seed';
import { getFixture, listFixtures } from '../plugins/registry';
import { validateProject } from '../validate';
import type { FixtureConfig, Project, WallElement, Zone } from '../types';

/** Mirrors the Inspector's zone-aware appliance dropdown filter. */
const offeredFor = (zone: Zone) =>
  listFixtures().filter((d) => d.zone === zone && !d.integratable).map((d) => d.id);

describe('zone-aware appliance list', () => {
  it('base offers the dishwasher and range but not the (integratable) cooktop', () => {
    const ids = offeredFor('base');
    expect(ids).toContain('dishwasher');
    expect(ids).toContain('range');
    expect(ids).not.toContain('cooktop'); // reached via the drop-in toggle, not the list
  });
  it('upper offers the hood and never a base appliance', () => {
    const ids = offeredFor('upper');
    expect(ids).toContain('hood');
    expect(ids).not.toContain('range');
    expect(ids).not.toContain('cooktop');
  });
  it('tall offers the fridge and never a base appliance', () => {
    const ids = offeredFor('tall');
    expect(ids).toContain('fridge');
    expect(ids).not.toContain('dishwasher');
  });
});

const baseEl = (id: string, x: number, w: number): WallElement => ({
  id, xIn: x, widthIn: w, zone: 'base',
  cabinet: { id: `${id}c`, widthIn: w, front: [{ id: `${id}o`, type: 'door', heightIn: 'auto' }] },
});
const applianceEl = (id: string, x: number, w: number, fixtureId: string, fixture?: FixtureConfig): WallElement => ({
  id, xIn: x, widthIn: w, zone: getFixture(fixtureId)?.zone ?? 'base', fixtureId, fixture,
});

/** Build a project from positioned elements; the wall length is the rightmost extent. */
function project(elements: WallElement[]): Project {
  const length = elements.reduce((mx, e) => Math.max(mx, e.xIn + e.widthIn), 0);
  return {
    id: 'p', name: 't', units: 'in', materials: defaultMaterials(), defaults: projectDefaults(), pricing: defaultPricing(),
    rooms: [{ id: 'r', name: 'r', walls: [{ id: 'w', name: 'w', lengthIn: length, ceilingHeightIn: 96, elements }] }],
  };
}

const counters = (p: Project) => buildProject(p).parts.filter((x) => x.role === 'counter');

describe('appliance fixtures', () => {
  it('runs the countertop continuously over a dishwasher (pass-through)', () => {
    const c = counters(project([baseEl('b1', 0, 24), applianceEl('dw', 24, 24, 'dishwasher'), baseEl('b2', 48, 24)]));
    expect(c).toHaveLength(1);
    expect(c[0].lIn).toBeCloseTo(72, 4);
  });

  it('breaks the countertop on both sides of a range', () => {
    const c = counters(project([baseEl('b1', 0, 24), applianceEl('rg', 24, 30, 'range'), baseEl('b2', 54, 24)]));
    expect(c).toHaveLength(2);
    expect(c.map((x) => x.lIn).sort((a, b) => a - b)).toEqual([24, 24]);
  });

  it('places an appliance volume node for each fixture', () => {
    const nodes = buildProject(project([applianceEl('rg', 0, 30, 'range')])).nodes;
    expect(nodes.some((n) => n.kind === 'appliance')).toBe(true);
  });

  it('emits a dishwasher front panel as a face part when requested', () => {
    const parts = buildProject(project([applianceEl('dw', 0, 24, 'dishwasher', { frontPanel: true })])).parts;
    const front = parts.find((p) => p.id.endsWith('-FRONT'));
    expect(front?.role).toBe('face');
  });

  it('finishes a tall cabinet side a base cabinet only partly covers (open upper band)', () => {
    // Base at the corner, then a tall mid-wall: the base covers only the tall's
    // base band, so the tall protrudes up past it and its left side is finished.
    const tall: WallElement = {
      id: 't', xIn: 24, widthIn: 24, zone: 'tall',
      cabinet: { id: 'tc', widthIn: 24, front: [{ id: 'to', type: 'door', heightIn: 'auto' }] },
    };
    const parts = buildProject(project([baseEl('b', 0, 24), tall])).parts;
    const fin = parts.find((p) => p.cabinetId === 'tc' && p.id.endsWith('-SIDE-FIN'));
    expect(fin?.role).toBe('face');
    expect(fin?.qty).toBe(1);
  });

  it('emits fridge end + overhead panels when requested', () => {
    const parts = buildProject(project([applianceEl('fr', 0, 36, 'fridge', { sidePanels: true, overheadPanel: true })])).parts;
    expect(parts.find((p) => p.id.endsWith('-SIDE'))?.qty).toBe(2);
    expect(parts.find((p) => p.id.endsWith('-TOP'))).toBeTruthy();
  });

  it('does not price appliances on the shopping list', () => {
    // Appliances are user-sourced at real prices — we deliberately keep them off
    // the shopping list and out of the cost total rather than inventing a number.
    const list = buildShoppingList(project([applianceEl('dw', 0, 24, 'dishwasher'), baseEl('b', 24, 24)]));
    expect(list.sections.some((s) => s.title === 'Appliances')).toBe(false);
    expect(list.sections.flatMap((s) => s.items).some((i) => /dishwasher/i.test(i.name))).toBe(false);
  });

  it('builds an upper cabinet above a base-zone appliance (dishwasher)', () => {
    // A base-zone fixture element, plus an independent upper cabinet element at the same x.
    const dw = applianceEl('dw', 0, 24, 'dishwasher');
    const upper: WallElement = {
      id: 'dw-up', xIn: 0, widthIn: 24, zone: 'upper',
      cabinet: { id: 'u', widthIn: 24, front: [{ id: 'uo', type: 'door', heightIn: 'auto' }] },
    };
    const built = buildProject(project([dw, upper]));
    // The appliance volume is still placed…
    expect(built.nodes.some((n) => n.kind === 'appliance')).toBe(true);
    // …and the upper cabinet contributes a real carcass, sitting in the upper zone.
    expect(built.parts.some((p) => p.role === 'carcass')).toBe(true);
    expect(built.nodes.some((n) => n.kind === 'face' && n.pos[1] > 60)).toBe(true);
  });

  it('an upper-zone fixture (hood) leaves no carcass on its own', () => {
    const hd = applianceEl('hd', 0, 30, 'hood');
    const built = buildProject(project([hd]));
    // The hood occupies the upper zone with no cabinet, so no carcass is built.
    expect(built.parts.some((p) => p.role === 'carcass')).toBe(false);
  });

  it('a drop-in cooktop integrated over a base cabinet keeps the counter continuous', () => {
    // One element carries BOTH a base cabinet and the cooktop fixture.
    const cook: WallElement = {
      id: 'ck', xIn: 24, widthIn: 30, zone: 'base', fixtureId: 'cooktop',
      cabinet: { id: 'ckc', widthIn: 30, front: [{ id: 'cko', type: 'drawer', heightIn: 'auto' }] },
    };
    const built = buildProject(project([baseEl('b1', 0, 24), cook, baseEl('b2', 54, 24)]));
    const c = built.parts.filter((x) => x.role === 'counter');
    expect(c).toHaveLength(1); // pass-fixture → counter runs over all three
    expect(c[0].lIn).toBeCloseTo(78, 4);
    expect(built.parts.some((p) => p.cabinetId === 'ckc' && p.role === 'carcass')).toBe(true); // the cabinet is still built
  });

  it('an integrated slide-in range breaks the counter even over a cabinet', () => {
    const rng: WallElement = {
      id: 'rg', xIn: 24, widthIn: 30, zone: 'base', fixtureId: 'range',
      cabinet: { id: 'rgc', widthIn: 30, front: [{ id: 'rgo', type: 'door', heightIn: 'auto' }] },
    };
    const c = counters(project([baseEl('b1', 0, 24), rng, baseEl('b2', 54, 24)]));
    expect(c).toHaveLength(2); // break-fixture interrupts the counter on both sides
  });

  it('offers washer + dryer as standalone base appliances that break the counter', () => {
    const ids = offeredFor('base');
    expect(ids).toContain('washer');
    expect(ids).toContain('dryer');
    expect(getFixture('washer')?.countertop).toBe('break');
    // A washer between two base cabinets interrupts the counter on both sides.
    const c = counters(project([baseEl('b1', 0, 24), applianceEl('ws', 24, 27, 'washer'), baseEl('b2', 51, 24)]));
    expect(c).toHaveLength(2);
  });

  it('places a washer volume and an extra pedestal volume when configured', () => {
    const plain = buildProject(project([applianceEl('ws', 0, 27, 'washer')])).nodes.filter((n) => n.kind === 'appliance');
    const ped = buildProject(project([applianceEl('wp', 0, 27, 'washer', { settings: { pedestal: true } })]))
      .nodes.filter((n) => n.kind === 'appliance');
    // The pedestal adds at least one more volume and lifts the stack taller.
    expect(ped.length).toBeGreaterThan(plain.length);
  });

  it('exposes a 2D elevation schematic for appliances', () => {
    const el = applianceEl('dr', 0, 27, 'dryer');
    const shapes = getFixture('dryer')!.elevation!({ element: el, config: el.fixture, x: 0, y: 0, w: 27, h: 38 });
    // A porthole door (circle) plus body/console rects make a recognisable unit.
    expect(shapes.some((s) => s.kind === 'circle')).toBe(true);
    expect(shapes.some((s) => s.kind === 'rect')).toBe(true);
  });

  it('models fridge configuration + counter-depth', () => {
    const apps = (p: Project) => buildProject(p).nodes.filter((n) => n.kind === 'appliance');
    const std = apps(project([applianceEl('f1', 0, 36, 'fridge', { settings: { style: 'french' } })]));
    const cd = apps(project([applianceEl('f2', 0, 36, 'fridge', { settings: { style: 'sideBySide', counterDepth: true } })]));
    // Body + freezer + doors (+ seam) → several appliance nodes.
    expect(std.length).toBeGreaterThan(2);
    // A counter-depth fridge body is shallower than a standard-depth one.
    const frontZ = (ns: typeof std) => Math.max(...ns.map((n) => n.pos[2] + n.size[2] / 2));
    expect(frontZ(cd)).toBeLessThan(frontZ(std));
  });
});

/** Set the project-wide counter height (floor → surface). */
function withCounterHeight(p: Project, h: number): Project {
  return { ...p, defaults: { ...p.defaults, counterHeightIn: h } };
}

describe('upper cabinet above a fridge', () => {
  const upperEl = (id: string, x: number, w: number): WallElement => ({
    id, xIn: x, widthIn: w, zone: 'upper',
    cabinet: { id: `${id}c`, widthIn: w, front: [{ id: `${id}o`, type: 'door', heightIn: 'auto' }] },
  });

  it('a fridge and an upper sharing its x-range is not flagged as an overlap', () => {
    const p = project([applianceEl('fr', 0, 36, 'fridge'), upperEl('up', 0, 36)]);
    expect(validateProject(p).some((w) => w.kind === 'overlap')).toBe(false);
  });

  it('the upper builds a real carcass up in the upper band, above the fridge body', () => {
    const built = buildProject(project([applianceEl('fr', 0, 36, 'fridge'), upperEl('up', 0, 36)]));
    expect(built.parts.some((part) => part.cabinetId === 'upc' && part.role === 'carcass')).toBe(true);
  });

  it('warns when a low ceiling makes the fridge body reach into the upper above it', () => {
    // A fridge body ~70" tall under a low 78" ceiling leaves no room for an upper.
    const low: Project = {
      ...project([applianceEl('fr', 0, 36, 'fridge'), upperEl('up', 0, 36)]),
    };
    low.rooms[0].walls[0].ceilingHeightIn = 78;
    expect(validateProject(low).some((w) => /reaches/.test(w.message))).toBe(true);
  });
});

describe('appliance vs non-standard counter height', () => {
  it('warns when the counter is too low for a standard dishwasher', () => {
    const p = withCounterHeight(project([applianceEl('dw', 0, 24, 'dishwasher')]), 30);
    const warns = validateProject(p).filter((w) => w.kind === 'applianceFit');
    expect(warns.length).toBe(1);
    expect(warns[0].message).toMatch(/dishwasher/i);
    expect(warns[0].message).toMatch(/below/);
  });

  it('warns when the counter is too high for a standard range', () => {
    const p = withCounterHeight(project([applianceEl('rg', 0, 30, 'range')]), 40);
    const warns = validateProject(p).filter((w) => w.kind === 'applianceFit');
    expect(warns.some((w) => /range/i.test(w.message) && /above/.test(w.message))).toBe(true);
  });

  it('stays quiet at a standard 36" counter height', () => {
    const p = project([applianceEl('dw', 0, 24, 'dishwasher'), applianceEl('rg', 30, 30, 'range')]);
    expect(validateProject(p).some((w) => w.kind === 'applianceFit')).toBe(false);
  });
});
