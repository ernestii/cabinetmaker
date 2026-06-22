import { describe, expect, it } from 'vitest';
import { buildProject } from '../geometry/buildProject';
import { exportProjectStep, sceneToSolids, solidsToStep } from '../export';
import { seedProject } from '../seed';

describe('STEP export', () => {
  const project = seedProject();
  const scene = buildProject(project);
  const solids = sceneToSolids(scene);
  const step = solidsToStep(solids, { name: 'Test', date: '2026-06-08T00:00:00' });

  it('emits a well-formed ISO-10303-21 file', () => {
    expect(step.startsWith('ISO-10303-21;')).toBe(true);
    expect(step.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
    expect(step).toContain('FILE_SCHEMA');
    expect(step).toContain('MANIFOLD_SOLID_BREP');
  });

  it('exports only fabricated parts (drops decoration, appliances and lighting)', () => {
    const skip = new Set(['wall', 'ceiling', 'appliance', 'light']);
    const fabricated = scene.nodes.filter((n) => !skip.has(n.kind));
    expect(solids.length).toBe(fabricated.length);
    expect(scene.nodes.some((n) => n.kind === 'wall')).toBe(true); // sanity: decoration to drop
    expect(scene.nodes.some((n) => n.kind === 'appliance')).toBe(true); // seed has a dishwasher + range to drop
  });

  it('gives each box six faces and each leg N+2', () => {
    const legSolids = solids.filter((s) => s.name.startsWith('leg-'));
    const boxSolids = solids.filter((s) => !s.name.startsWith('leg-'));
    expect(boxSolids.length).toBeGreaterThan(0);
    for (const s of boxSolids) expect(s.faces.length).toBe(6);
    expect(legSolids.length).toBeGreaterThan(0);
    for (const s of legSolids) expect(s.faces.length).toBe(26); // 24 sides + 2 caps
  });

  it('names solids uniquely and by kind', () => {
    const names = solids.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((n) => /^panel-\d\d$/.test(n))).toBe(true);
  });

  it('declares an inch length unit (25.4 mm conversion)', () => {
    expect(step).toContain("CONVERSION_BASED_UNIT('INCH'");
    expect(step).toContain('LENGTH_MEASURE(25.4)');
  });

  it("keeps the model's bounding box (within rounding)", () => {
    const skip = new Set(['wall', 'ceiling', 'appliance', 'light']);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of scene.nodes) {
      if (skip.has(n.kind)) continue;
      minX = Math.min(minX, n.pos[0] - n.size[0] / 2); maxX = Math.max(maxX, n.pos[0] + n.size[0] / 2);
      minY = Math.min(minY, n.pos[1] - n.size[1] / 2); maxY = Math.max(maxY, n.pos[1] + n.size[1] / 2);
      minZ = Math.min(minZ, n.pos[2] - n.size[2] / 2); maxZ = Math.max(maxZ, n.pos[2] + n.size[2] / 2);
    }
    let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity, sMinZ = Infinity, sMaxZ = -Infinity;
    for (const solid of solids) {
      for (const face of solid.faces) {
        for (const [x, y, z] of face) {
          sMinX = Math.min(sMinX, x); sMaxX = Math.max(sMaxX, x);
          sMinY = Math.min(sMinY, y); sMaxY = Math.max(sMaxY, y);
          sMinZ = Math.min(sMinZ, z); sMaxZ = Math.max(sMaxZ, z);
        }
      }
    }
    // Faceted legs sit just inside their bounding box, so allow a small slack.
    const slack = 0.02;
    expect(sMinX).toBeGreaterThanOrEqual(minX - slack);
    expect(sMaxX).toBeLessThanOrEqual(maxX + slack);
    expect(sMinY).toBeCloseTo(minY, 6);
    expect(sMaxY).toBeCloseTo(maxY, 6);
    expect(sMinZ).toBeGreaterThanOrEqual(minZ - slack);
    expect(sMaxZ).toBeLessThanOrEqual(maxZ + slack);
  });

  it('is deterministic', () => {
    const again = solidsToStep(sceneToSolids(buildProject(seedProject())), { name: 'Test', date: '2026-06-08T00:00:00' });
    expect(again).toBe(step);
  });

  it('exposes a project-level helper with a slugified filename', () => {
    const { text, filename } = exportProjectStep(seedProject());
    expect(filename.endsWith('.step')).toBe(true);
    expect(text).toContain('ISO-10303-21;');
  });
});
