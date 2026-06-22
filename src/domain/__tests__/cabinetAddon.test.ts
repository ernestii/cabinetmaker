import { afterEach, describe, expect, it } from 'vitest';
import { registerPlugin, __resetRegistryForTests } from '../plugins/registry';
import { registerBuiltins } from '../plugins/builtin';
import { buildProject } from '../geometry/buildProject';
import { buildShoppingList } from '../shopping/buildShoppingList';
import { buildAssembly } from '../assembly/steps';
import { sceneToSolids } from '../export';
import { defaultMaterials, defaultPricing, projectDefaults } from '../seed';
import type { Project, WallElement } from '../types';
import type { CabinetmakerPlugin } from '../plugins/types';

afterEach(() => {
  __resetRegistryForTests();
  registerBuiltins();
});

/** Build a project from positioned elements; the wall length is the rightmost extent. */
function project(elements: WallElement[]): Project {
  const length = elements.reduce((mx, e) => Math.max(mx, e.xIn + e.widthIn), 0);
  return {
    id: 'p', name: 't', units: 'in', materials: defaultMaterials(), defaults: projectDefaults(), pricing: defaultPricing(),
    rooms: [{ id: 'r', name: 'r', walls: [{ id: 'w', name: 'w', lengthIn: length, ceilingHeightIn: 96, elements }] }],
  };
}

/** A base cabinet + an upper cabinet (at the same x) whose upper carries the given add-on ids. */
function litUpper(addons: string[]): WallElement[] {
  return [
    { id: 'b', xIn: 0, widthIn: 30, zone: 'base', cabinet: { id: 'cb', widthIn: 30, front: [{ id: 'ob', type: 'door', doorCount: 2, heightIn: 'auto' }] } },
    { id: 'b-up', xIn: 0, widthIn: 30, zone: 'upper', cabinet: { id: 'cu', widthIn: 30, addons, front: [{ id: 'ou', type: 'door', doorCount: 2, heightIn: 'auto', shelves: 1 }] } },
  ];
}

describe('built-in under-cabinet LED add-on', () => {
  const p = project(litUpper(['under-cabinet-led']));
  const scene = buildProject(p);

  it('drops a glowing light node beneath the cabinet', () => {
    const lights = scene.nodes.filter((n) => n.kind === 'light' && !!n.emissive);
    expect(lights.length).toBe(1);
  });

  it('routes a dado into the bottom panel for the plan', () => {
    const bottoms = scene.parts.filter((p) => p.id.endsWith('-BOT'));
    const lit = bottoms.find((b) => b.joinery.includes('groove'));
    expect(lit).toBeTruthy();
    expect(lit!.notes).toMatch(/groove/i);
  });

  it('adds an assembly step and a Lighting shopping line', () => {
    expect(buildAssembly(p).some((a) => a.steps.some((s) => /LED channel|LED strip/i.test(s.text)))).toBe(true);
    const lighting = buildShoppingList(p).sections.find((s) => s.title === 'Lighting');
    expect(lighting?.items.some((i) => /LED strip kit/i.test(i.name))).toBe(true);
  });

  it('is omitted from the STEP export (lighting is not a fabricated part)', () => {
    const solids = sceneToSolids(scene);
    expect(solids.some((s) => s.name.startsWith('light-'))).toBe(false);
    // …but the cabinet's real parts are still exported.
    expect(solids.some((s) => s.name.startsWith('panel-'))).toBe(true);
  });

  it('does nothing when the cabinet has no add-ons', () => {
    const plain = buildProject(project(litUpper([])));
    expect(plain.nodes.some((n) => n.kind === 'light')).toBe(false);
    expect(plain.parts.filter((x) => x.id.endsWith('-BOT')).every((b) => !b.joinery.includes('groove'))).toBe(true);
  });
});

/**
 * Extensibility guarantee: a third party can register a cabinet add-on through
 * `registerPlugin` and have it modify the model + plan with no core edits.
 */
const acmeTray: CabinetmakerPlugin = {
  id: 'acme-addons',
  cabinetAddons: [
    {
      id: 'acme-pullout-tray',
      label: 'Acme pull-out tray',
      slots: ['base'],
      apply({ ctx, f, nodes }) {
        // A real fabricated part (a tray bottom) + a marker node.
        f.add({
          id: `C${ctx.index}-TRAY`, label: 'Pull-out tray bottom', role: 'carcass', materialId: 'carcass',
          thicknessIn: 0.5, wIn: ctx.widthIn - 2, lIn: ctx.depthIn - 2, qty: 1, edgeBandEdges: [], joinery: ['groove'], grainLocked: true,
        });
        nodes.push({ pos: [ctx.widthIn / 2, 4, ctx.depthIn / 2], size: [ctx.widthIn - 2, 0.5, ctx.depthIn - 2], color: '#cdb', kind: 'drawerBox' });
      },
      steps: ({ index }) => [{ phase: 'boxes', text: 'Mount the Acme pull-out tray on its slides.', partIds: [`C${index}-TRAY`] }],
      shopping: ({ cabinet }) => [{ key: `tray-${cabinet.id}`, name: 'Acme pull-out tray kit', detail: 'slides + tray', qty: 1, unit: 'kit', unitPrice: 35, total: 35 }],
    },
  ],
};

describe('third-party cabinet add-on (no core edits)', () => {
  it('augments geometry, cut list, assembly and shopping', () => {
    registerPlugin(acmeTray);
    const p = project([
      { id: 'b', xIn: 0, widthIn: 24, zone: 'base', cabinet: { id: 'cb', widthIn: 24, addons: ['acme-pullout-tray'], front: [{ id: 'o', type: 'door', heightIn: 'auto' }] } },
    ]);
    const scene = buildProject(p);
    expect(scene.parts.some((x) => x.id.endsWith('-TRAY'))).toBe(true);
    expect(buildAssembly(p).some((a) => a.steps.some((s) => /pull-out tray/i.test(s.text)))).toBe(true);
    const addons = buildShoppingList(p).sections.find((s) => s.title === 'Add-ons');
    expect(addons?.items.some((i) => /Acme pull-out tray/i.test(i.name))).toBe(true);
    // The tray bottom is a fabricated part, so it IS in the STEP export.
    expect(sceneToSolids(scene).some((s) => s.name.startsWith('drawerBox-'))).toBe(true);
  });
});
