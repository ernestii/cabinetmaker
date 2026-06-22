import { describe, expect, it } from 'vitest';
import { buildProject } from '../geometry/buildProject';
import { defaultMaterials, defaultPricing, projectDefaults } from '../seed';
import { getFixture } from '../plugins/registry';
import type { FixtureConfig, Project, WallElement } from '../types';

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

describe('LED strip light', () => {
  it('emits a glowing light node', () => {
    const built = buildProject(project([applianceEl('led', 0, 36, 'led-strip')]));
    const light = built.nodes.find((n) => n.kind === 'light');
    expect(light?.emissive).toBeTruthy();
  });
});

describe('gridfinity drawer', () => {
  const gridfinityCabinet = () =>
    project([
      { id: 'b', xIn: 0, widthIn: 24, zone: 'base',
        cabinet: { id: 'bc', widthIn: 24, front: [{ id: 'o1', type: 'gridfinity-drawer', heightIn: 'auto' }] } },
    ]);

  it('produces the same drawer box + face parts as a stock drawer', () => {
    const ids = buildProject(gridfinityCabinet()).parts.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['C1-DR1-SIDE', 'C1-DR1-FB', 'C1-DR1-BOT', 'C1-DR1-FACE']));
  });

  it('overlays bin nodes that slide with the drawer and reports capacity', () => {
    const nodes = buildProject(gridfinityCabinet()).nodes;
    // The baseplate carries the capacity badge; bins + baseplate share the drawer open group.
    const baseplate = nodes.find((n) => n.badge);
    expect(baseplate?.open?.id).toBe('C1-DR1-FACE');
    // 24" cabinet, side-mount slides → 20.5" / 21" interior → 12 × 12 cells.
    expect(baseplate!.badge).toMatch(/^12×12×\d+u$/);
    // Plenty of bin boxes overlaid inside, all tagged to slide with the drawer.
    const bins = nodes.filter((n) => n.kind === 'drawerBox' && n.open?.id === 'C1-DR1-FACE' && n.color === '#6b7785');
    expect(bins.length).toBeGreaterThan(100);
  });
});
