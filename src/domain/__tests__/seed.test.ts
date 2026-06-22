import { describe, expect, it } from 'vitest';
import {
  buildNewProject,
  defaultMaterialIds,
  defaultMaterials,
  materialsFromPresets,
  SHEET_PRESETS,
} from '../seed';

describe('sheet presets', () => {
  it('defaultMaterials is the preset-flagged stock, with sheet dims stamped on', () => {
    const mats = defaultMaterials();
    expect(mats.map((m) => m.id)).toEqual(defaultMaterialIds());
    expect(mats.every((m) => m.sheetW === 48 && m.sheetH === 96 && m.kerfIn === 0.125)).toBe(true);
    // every preset carries no leftover catalogue-only fields
    const first = mats[0] as unknown as Record<string, unknown>;
    expect(first.hint).toBeUndefined();
    expect(first.preset).toBeUndefined();
  });

  it('materialsFromPresets keeps catalogue order and only the requested ids', () => {
    const ids = ['m-face', 'm-carcass']; // requested out of order
    const mats = materialsFromPresets(ids);
    expect(mats.map((m) => m.id)).toEqual(['m-carcass', 'm-face']); // catalogue order wins
  });

  it('covers the carcass, face and counter roles in the default set', () => {
    const roles = new Set(defaultMaterials().flatMap((m) => m.roles));
    for (const r of ['carcass', 'face', 'counter', 'drawer', 'back'] as const) {
      expect(roles.has(r)).toBe(true);
    }
  });
});

describe('buildNewProject', () => {
  it('merges default overrides and seeds a starter base cabinet element', () => {
    const p = buildNewProject({
      name: '  Shop  ',
      lengthIn: 120,
      ceilingHeightIn: 90,
      defaults: { counterHeightIn: 34, drawerHandle: 'routerCutout', backStyle: 'rails' },
    });
    expect(p.name).toBe('Shop'); // trimmed
    expect(p.defaults.counterHeightIn).toBe(34);
    expect(p.defaults.drawerHandle).toBe('routerCutout');
    expect(p.defaults.backStyle).toBe('rails');
    expect(p.defaults.slideType).toBe('side'); // untouched default survives
    const wall = p.rooms[0].walls[0];
    expect(wall.lengthIn).toBe(120);
    expect(wall.ceilingHeightIn).toBe(90);
    expect(wall.elements).toHaveLength(1);
    expect(wall.elements[0].zone).toBe('base');
    expect(wall.elements[0].cabinet).toBeTruthy();
  });

  it('seeds the chosen sheet presets as the material list', () => {
    const p = buildNewProject({ name: 'x', lengthIn: 96, ceilingHeightIn: 96, materialIds: ['m-carcass', 'm-counter'] });
    expect(p.materials.map((m) => m.id)).toEqual(['m-carcass', 'm-counter']);
  });

  it('falls back to the default materials when none are chosen', () => {
    const p = buildNewProject({ name: 'x', lengthIn: 96, ceilingHeightIn: 96, materialIds: [] });
    expect(p.materials.map((m) => m.id)).toEqual(defaultMaterialIds());
  });

  it('every preset id is unique', () => {
    const ids = SHEET_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
