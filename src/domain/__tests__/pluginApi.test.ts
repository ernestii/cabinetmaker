import { describe, expect, it } from 'vitest';
import { buildProject } from '../geometry/buildProject';
import { getFrontType } from '../plugins/registry';
import { defaultMaterials, defaultPricing, projectDefaults } from '../seed';
import type { Opening, Project, WallElement } from '../types';

function project(elements: WallElement[]): Project {
  const length = elements.reduce((mx, e) => Math.max(mx, e.xIn + e.widthIn), 0);
  return {
    id: 'p', name: 't', units: 'in', materials: defaultMaterials(), defaults: projectDefaults(), pricing: defaultPricing(),
    rooms: [{ id: 'r', name: 'r', walls: [{ id: 'w', name: 'w', lengthIn: length, ceilingHeightIn: 96, elements }] }],
  };
}

const BIN_COLOR = '#6b7785';
const gridBase = (front: Opening[]): WallElement => ({ id: 'b', xIn: 0, widthIn: 24, zone: 'base', cabinet: { id: 'bc', widthIn: 24, front } });

describe('plugin per-instance settings (Opening.settings)', () => {
  it('a gridfinity setting changes the built geometry', () => {
    const shown = buildProject(project([gridBase([{ id: 'o', type: 'gridfinity-drawer', heightIn: 'auto' }])]));
    const hidden = buildProject(project([gridBase([{ id: 'o', type: 'gridfinity-drawer', heightIn: 'auto', settings: { showBins: false } }])]));
    const bins = (s: ReturnType<typeof buildProject>) => s.nodes.filter((n) => n.color === BIN_COLOR).length;
    expect(bins(shown)).toBeGreaterThan(0);
    expect(bins(hidden)).toBe(0); // showBins:false drops the per-cell bins, keeps the baseplate
    expect(hidden.nodes.some((n) => n.badge)).toBe(true);
  });

  it('the gridfinity baseplate carries a hover tooltip', () => {
    const built = buildProject(project([gridBase([{ id: 'o', type: 'gridfinity-drawer', heightIn: 'auto' }])]));
    const baseplate = built.nodes.find((n) => n.badge);
    expect(baseplate?.tooltip).toMatch(/Gridfinity .*bins/);
  });
});

describe('plugin commands (layout generators)', () => {
  it('fill-bank generates a stack of gridfinity drawers', () => {
    const cmd = getFrontType('gridfinity-drawer')?.commands?.find((c) => c.id === 'fill-bank');
    expect(cmd).toBeTruthy();
    let n = 0;
    const result = cmd!.run({
      opening: { id: 'o', type: 'gridfinity-drawer', heightIn: 'auto', handle: 'pull' },
      cabinet: { id: 'c', widthIn: 24, front: [] },
      widthIn: 24, carcassHeightIn: 30, depthIn: 24, defaults: projectDefaults(),
      newId: (p) => `${p}-${n++}`,
    });
    expect('front' in result).toBe(true);
    if ('front' in result) {
      expect(result.front.length).toBeGreaterThanOrEqual(2);
      expect(result.front.every((o) => o.type === 'gridfinity-drawer')).toBe(true);
      expect(result.front.every((o) => o.handle === 'pull')).toBe(true); // carried over from the source front
    }
  });
});

describe('add-on per-instance settings (Cabinet.addonSettings)', () => {
  const ledUpper = (addonSettings?: Record<string, Record<string, unknown>>): WallElement => ({
    id: 'b', xIn: 0, widthIn: 24, zone: 'upper',
    cabinet: { id: 'u', widthIn: 24, front: [{ id: 'o', type: 'door', heightIn: 'auto' }], addons: ['under-cabinet-led'], addonSettings },
  });

  it('switches the LED colour when tone is cool', () => {
    const warm = buildProject(project([ledUpper()]));
    const cool = buildProject(project([ledUpper({ 'under-cabinet-led': { tone: 'cool' } })]));
    const light = (s: ReturnType<typeof buildProject>) => s.nodes.find((n) => n.kind === 'light');
    expect(light(warm)?.emissive).toBe('#fff1cf');
    expect(light(cool)?.emissive).toBe('#dfe9ff');
  });
});

describe('declarative field migration', () => {
  it('built-in front types and fixtures declare fields instead of ui/panels flags', () => {
    for (const id of ['drawer', 'door', 'fixed', 'gridfinity-drawer']) {
      expect((getFrontType(id)?.fields?.length ?? 0)).toBeGreaterThan(0);
    }
  });
});
