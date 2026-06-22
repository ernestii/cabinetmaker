import { afterEach, describe, expect, it } from 'vitest';
import { registerPlugin, __resetRegistryForTests } from '../plugins/registry';
import { registerBuiltins } from '../plugins/builtin';
import { buildProject } from '../geometry/buildProject';
import { buildCutList } from '../cutlist/collectParts';
import { buildAssembly } from '../assembly/steps';
import { defaultMaterials, defaultPricing, projectDefaults } from '../seed';
import type { Project, WallElement } from '../types';
import type { CabinetmakerPlugin } from '../plugins/types';

afterEach(() => {
  __resetRegistryForTests();
  registerBuiltins();
});

/**
 * The headline guarantee: a third party can add a front type, a door style, and
 * a fixture purely through `registerPlugin`, and the whole pipeline — geometry,
 * cut list, shopping, assembly — picks them up with NO edits to core code.
 */
const plugin: CabinetmakerPlugin = {
  id: 'acme',
  doorStyles: [
    {
      id: 'acme-glass',
      label: 'Acme glass',
      buildFace(c) {
        // One slim frame part + a glass marker node — proof the hook runs.
        c.f.add({
          id: c.partId, label: c.label, role: 'face', materialId: c.faceMaterialId, thicknessIn: c.tf,
          wIn: c.faceW, lIn: c.faceHeight, qty: c.leaves, edgeBandEdges: [], joinery: [], grainLocked: true,
          notes: 'Glass insert',
        });
        c.emit({ pos: [c.W / 2, c.cy, c.D + c.tf / 2], size: [c.faceW, c.faceHeight, c.tf], color: '#bcd', kind: 'face' });
      },
    },
  ],
  frontTypes: [
    {
      id: 'acme-vent',
      label: 'Acme vent grille',
      build(c) {
        c.f.add({
          id: `C${c.ctx.index}-VENT${c.ordinal}`, label: 'Vent grille', role: 'face', materialId: 'face',
          thicknessIn: 0.75, wIn: 10, lIn: 4, qty: 1, edgeBandEdges: [], joinery: [], grainLocked: true,
        });
        return { hinges: 0, slidePairs: 0, pulls: 0, pushLatches: 0 };
      },
      steps: ({ ordinal }) => [{ phase: 'faces', text: `Install vent grille ${ordinal}.` }],
    },
  ],
  fixtures: [
    {
      id: 'acme-fountain',
      label: 'Acme water fountain',
      zone: 'base',
      defaultWidthIn: 18,
      countertop: 'break',
      place(c) {
        c.node({ pos: [c.x0 + c.widthIn / 2, 18, 6], size: [c.widthIn, 36, 12], color: '#9cf', kind: 'appliance' });
      },
    },
  ],
};

function project(elements: WallElement[]): Project {
  const length = elements.reduce((mx, e) => Math.max(mx, e.xIn + e.widthIn), 0);
  return {
    id: 'p', name: 't', units: 'in', materials: defaultMaterials(), defaults: projectDefaults(), pricing: defaultPricing(),
    rooms: [{ id: 'r', name: 'r', walls: [{ id: 'w', name: 'w', lengthIn: length, ceilingHeightIn: 96, elements }] }],
  };
}

describe('third-party plugin (no core edits)', () => {
  it('renders a custom door style, front type and fixture end-to-end', () => {
    registerPlugin(plugin);
    const p = project([
      { id: 'b', xIn: 0, widthIn: 24, zone: 'base', cabinet: { id: 'bc', widthIn: 24, front: [
        { id: 'o1', type: 'door', heightIn: 12, doorStyle: 'acme-glass' },
        { id: 'o2', type: 'acme-vent', heightIn: 'auto' },
      ] } },
      { id: 'fx', xIn: 24, widthIn: 18, zone: 'base', fixtureId: 'acme-fountain' },
    ]);

    const scene = buildProject(p);
    // Custom door style + front type produced parts; custom fixture produced a node.
    expect(scene.parts.some((x) => x.notes === 'Glass insert')).toBe(true);
    expect(scene.parts.some((x) => x.id.includes('-VENT'))).toBe(true);
    expect(scene.nodes.some((n) => n.kind === 'appliance')).toBe(true);

    // Downstream consumers see them too, with no special-casing.
    expect(buildCutList(p).groups.length).toBeGreaterThan(0);
    expect(buildAssembly(p).some((a) => a.steps.some((s) => /vent grille/i.test(s.text)))).toBe(true);
  });
});
