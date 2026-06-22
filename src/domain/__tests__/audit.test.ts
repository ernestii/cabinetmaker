import { describe, expect, it } from 'vitest';
import { buildCabinet, type BuildCabinetParams } from '../geometry/buildCabinet';
import { auditCabinetGeometry, type CabinetDims } from '../geometry/audit';
import { wallMetrics } from '../geometry/metrics';
import { elementVertical } from '../elements';
import { allWalls } from '../project';
import { DEMOS, projectDefaults } from '../seed';
import type { Cabinet, Opening, RunKind } from '../types';

let n = 0;
const op = (type: string, extra: Partial<Opening> = {}): Opening => ({ id: `o${n++}`, type, heightIn: 'auto', ...extra });
const cab = (front: Opening[], over: Partial<Cabinet> = {}): Cabinet => ({ id: `c${n++}`, widthIn: 24, front, ...over });

function build(c: Cabinet, over: Partial<BuildCabinetParams> = {}): { build: ReturnType<typeof buildCabinet>; dims: CabinetDims } {
  const params: BuildCabinetParams = {
    index: 1, runKind: 'base', depthIn: 24, carcassHeightIn: 30, legHeightIn: 4.5, hasLegs: true,
    materialIdByRole: {}, colorByRole: {}, textureByRole: {}, defaults: projectDefaults(), ...over,
  };
  return {
    build: buildCabinet(c, params),
    dims: { widthIn: c.widthIn, carcassHeightIn: params.carcassHeightIn, depthIn: c.depthOverrideIn ?? params.depthIn },
  };
}

describe('auditCabinetGeometry — a sound carcass passes', () => {
  const cases: [string, Cabinet, Partial<BuildCabinetParams>][] = [
    ['base, three drawers', cab([op('drawer'), op('drawer'), op('drawer')]), {}],
    ['base, doors + shelves (stretcher top)', cab([op('door', { doorCount: 2, shelves: 3 })]), {}],
    ['upper, full top + rails back', cab([op('door', { doorCount: 2 })], { construction: { backStyle: 'rails' } }), { runKind: 'upper', hasLegs: false, legHeightIn: 0, depthIn: 12, carcassHeightIn: 30 }],
    ['tall, open shelves', cab([op('fixed', { shelves: 5 })], { widthIn: 30 }), { runKind: 'tall' as RunKind, carcassHeightIn: 84, depthIn: 24 }],
    ['narrow base, single door', cab([op('door')], { widthIn: 12 }), {}],
    ['wide base (3 legs), drawers', cab([op('drawer'), op('drawer')], { widthIn: 42 }), {}],
    ['deep override + thicker carcass', cab([op('drawer')], { depthOverrideIn: 27, construction: { carcassThicknessIn: 1 } }), {}],
  ];
  for (const [name, c, over] of cases) {
    it(name, () => {
      const { build: b, dims } = build(c, over);
      expect(auditCabinetGeometry(b, dims)).toEqual([]);
    });
  }
});

describe('auditCabinetGeometry — catches broken geometry', () => {
  it('flags a panel that pokes past the width envelope', () => {
    const { build: b, dims } = build(cab([op('door')]));
    const broken = { ...b, nodes: [...b.nodes, { pos: [dims.widthIn + 5, 1, 1] as [number, number, number], size: [2, 2, 2] as [number, number, number], color: '#000', kind: 'panel' as const }] };
    const issues = auditCabinetGeometry(broken, dims);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(' ')).toMatch(/width/);
  });

  it('flags a missing right gable', () => {
    const { build: b, dims } = build(cab([op('door')]));
    // Drop the right side panel (the one whose right edge is at W).
    const nodes = b.nodes.filter((node) => !(node.kind === 'panel' && Math.abs(node.pos[0] + node.size[0] / 2 - dims.widthIn) < 1e-6));
    expect(auditCabinetGeometry({ ...b, nodes }, dims).join(' ')).toMatch(/right gable|width/);
  });

  it('flags a non-positive size', () => {
    const { build: b, dims } = build(cab([op('door')]));
    const broken = { ...b, nodes: [...b.nodes, { pos: [1, 1, 1] as [number, number, number], size: [0, 2, 2] as [number, number, number], color: '#000', kind: 'panel' as const }] };
    expect(auditCabinetGeometry(broken, dims).join(' ')).toMatch(/non-positive/);
  });
});

describe('auditCabinetGeometry — every demo cabinet is conservative', () => {
  for (const demo of DEMOS) {
    it(demo.key, () => {
      const project = demo.build();
      const issues: string[] = [];
      for (const wall of allWalls(project)) {
        const m = wallMetrics(project, wall);
        for (const el of wall.elements ?? []) {
          if (!el.cabinet) continue;
          const v = elementVertical(el, wall, m, project.defaults);
          const sized = { ...el.cabinet, widthIn: el.widthIn };
          const b = buildCabinet(sized, {
            index: 1, runKind: v.runKind, depthIn: el.cabinet.depthOverrideIn ?? v.depthDefault,
            carcassHeightIn: v.carcassH, legHeightIn: v.hasLegs ? m.legH : 0, hasLegs: v.hasLegs,
            materialIdByRole: {}, colorByRole: {}, textureByRole: {}, defaults: project.defaults,
          });
          issues.push(...auditCabinetGeometry(b, { widthIn: el.widthIn, carcassHeightIn: v.carcassH, depthIn: el.cabinet.depthOverrideIn ?? v.depthDefault }));
        }
      }
      expect(issues).toEqual([]);
    });
  }
});
