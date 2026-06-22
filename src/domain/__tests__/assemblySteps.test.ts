import { describe, expect, it } from 'vitest';
import { buildAssembly } from '../assembly/steps';
import { resolveSlideLength } from '../geometry/drawerBox';
import { defaultMaterials, defaultPricing, projectDefaults, seedProject } from '../seed';
import { toFraction } from '../format';
import type { Opening, Project, WallElement } from '../types';

const cabEl = (id: string, x: number, w: number, front: Opening[], depthOverrideIn?: number): WallElement => ({
  id, xIn: x, widthIn: w, zone: 'base',
  cabinet: { id: `${id}c`, widthIn: w, front, depthOverrideIn },
});

/** Build a project from positioned elements; the wall length is the rightmost extent. */
function project(elements: WallElement[]): Project {
  const length = elements.reduce((mx, e) => Math.max(mx, e.xIn + e.widthIn), 0);
  return {
    id: 'p', name: 't', units: 'in', materials: defaultMaterials(), defaults: projectDefaults(), pricing: defaultPricing(),
    rooms: [{ id: 'r', name: 'r', walls: [{ id: 'w', name: 'w', lengthIn: length, ceilingHeightIn: 96, elements }] }],
  };
}

describe('face-hanging step', () => {
  it('is present for a cabinet with doors', () => {
    const cabs = buildAssembly(project([cabEl('a', 0, 24, [{ id: 'o', type: 'door', heightIn: 'auto' }])]));
    expect(cabs[0].steps.some((s) => /hang all faces/i.test(s.text))).toBe(true);
  });

  it('is skipped for open shelving (all fixed fronts — nothing to hang)', () => {
    const cabs = buildAssembly(project([cabEl('a', 0, 24, [{ id: 'o', type: 'fixed', heightIn: 'auto', shelves: 2 }])]));
    expect(cabs[0].steps.some((s) => /hang all faces/i.test(s.text))).toBe(false);
  });
});

describe('shelf step pluralization', () => {
  const shelfStep = (shelves: number) =>
    buildAssembly(project([cabEl('a', 0, 24, [{ id: 'o', type: 'door', heightIn: 'auto', shelves }])]))[0]
      .steps.find((s) => /shelf-pin/i.test(s.text))!.text;

  it('one shelf', () => expect(shelfStep(1)).toContain('1 adjustable shelf.'));
  it('many shelves', () => expect(shelfStep(3)).toContain('3 adjustable shelves.'));
});

describe('drawer step slide length', () => {
  it('quotes the same resolved slide length as the geometry (clamped by depth)', () => {
    // 15"-deep base cabinet: the 22" default slide doesn't fit; the step must
    // quote what buildDrawer actually uses, not the raw default.
    const cabs = buildAssembly(project([cabEl('a', 0, 24, [{ id: 'o', type: 'drawer', heightIn: 'auto' }], 15)]));
    const text = cabs[0].steps.find((s) => s.text.startsWith('Build drawer'))!.text;
    const resolved = resolveSlideLength(15);
    expect(resolved).toBeLessThan(22);
    expect(text).toContain(`${toFraction(resolved)} side-mount`);
  });
});

describe('section kinds', () => {
  it('tags cabinets / workbenches / appliances for the page summary', () => {
    const p = project([cabEl('a', 0, 24, [{ id: 'o', type: 'door', heightIn: 'auto' }])]);
    p.rooms[0].walls[0].elements!.push(
      { id: 'wb', xIn: 24, widthIn: 36, zone: 'base', workbench: true },
      { id: 'dw', xIn: 60, widthIn: 24, zone: 'base', fixtureId: 'dishwasher' },
    );
    p.rooms[0].walls[0].lengthIn = 84;
    const kinds = buildAssembly(p).map((c) => c.kind);
    expect(kinds).toEqual(['cabinet', 'workbench', 'appliance']);
  });

  it('every seed-project section carries a kind', () => {
    for (const c of buildAssembly(seedProject())) {
      expect(['cabinet', 'workbench', 'appliance']).toContain(c.kind);
    }
  });
});
