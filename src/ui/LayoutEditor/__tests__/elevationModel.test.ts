import { describe, expect, it } from 'vitest';
import { buildWallModel } from '../elevationModel';
import { seedProject } from '../../../domain/seed';
import { MIN_CABINET_WIDTH } from '../../../domain/constants';
import type { Wall, WallElement } from '../../../domain/types';

/** A bare base cabinet element occupying [xIn, xIn+widthIn]. */
function cab(xIn: number, widthIn: number): WallElement {
  return { id: `el-${xIn}`, xIn, widthIn, zone: 'base', cabinet: { id: `c-${xIn}`, widthIn, front: [] } };
}

describe('buildWallModel add-zones respect the cabinet minimum gap', () => {
  it('skips a sub-12" gap but offers wider gaps and the wall tail', () => {
    const project = seedProject();
    // base band: cab[0..24], 8" gap, cab[32..56], 14" gap, cab[70..94], 26" tail.
    const wall: Wall = {
      id: 'w', name: 'W', lengthIn: 120, ceilingHeightIn: 96,
      elements: [cab(0, 24), cab(32, 24), cab(70, 24)],
    };
    const widths = buildWallModel(project, wall).addZones
      .filter((z) => z.zone === 'base')
      .map((z) => Math.round(z.w));

    expect(widths).not.toContain(8); // the 8" gap is too narrow for a usable cabinet
    expect(widths).toContain(14); // the 14" gap is offered
    expect(widths.every((w) => w >= MIN_CABINET_WIDTH)).toBe(true);
  });
});
