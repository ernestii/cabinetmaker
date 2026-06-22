import { describe, expect, it } from 'vitest';
import { buildProject } from '../geometry/buildProject';
import { buildCutList } from '../cutlist/collectParts';
import { validateProject } from '../validate';
import { DEMOS } from '../seed';

describe('demo projects', () => {
  it('exposes the kitchen, bar and office demos', () => {
    expect(DEMOS.map((d) => d.key)).toEqual(['kitchen', 'bar', 'office']);
  });

  for (const demo of DEMOS) {
    describe(demo.label, () => {
      const project = demo.build();

      it('every element fits within the wall length', () => {
        for (const wall of project.rooms[0].walls) {
          expect(wall.elements.length).toBeGreaterThan(0);
          for (const el of wall.elements) {
            expect(el.xIn).toBeGreaterThanOrEqual(0);
            expect(el.xIn + el.widthIn).toBeLessThanOrEqual(wall.lengthIn + 1e-6);
          }
        }
      });

      it('builds geometry and a cut list with parts', () => {
        const { nodes, parts } = buildProject(project);
        expect(nodes.length).toBeGreaterThan(0);
        expect(parts.length).toBeGreaterThan(0);
        for (const n of nodes) {
          for (const s of n.size) expect(s).toBeGreaterThan(0);
        }
        expect(buildCutList(project).groups.length).toBeGreaterThan(0);
      });

      it('has no buildability warnings', () => {
        expect(validateProject(project)).toEqual([]);
      });
    });
  }
});
