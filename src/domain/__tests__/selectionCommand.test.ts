import { describe, expect, it } from 'vitest';
import { getSelectionCommand, listSelectionCommands } from '../plugins';
import { spreadEvenly, stretchEvenly } from '../plugins/builtin/selectionCommands';
import type { SelectionCommandContext } from '../plugins/types';
import type { Project, ProjectDefaults, Wall, WallElement } from '../types';

/** A bare element — only the fields the spread math reads (zone/xIn/widthIn). */
function el(id: string, xIn: number, widthIn: number, zone: WallElement['zone'] = 'base'): WallElement {
  return { id, xIn, widthIn, zone };
}
/** spreadEvenly.run only touches `elements`; stub the rest of the context. */
function run(elements: WallElement[]) {
  const ctx = { elements, wall: {} as Wall, project: {} as Project, defaults: {} as ProjectDefaults } as SelectionCommandContext;
  return spreadEvenly.run(ctx);
}
function patchX(res: ReturnType<typeof run>, id: string): number | undefined {
  return res.elements?.find((p) => p.id === id)?.patch.xIn;
}

/** stretchEvenly.run, with the same element-only context stub. */
function runStretch(elements: WallElement[]) {
  const ctx = { elements, wall: {} as Wall, project: {} as Project, defaults: {} as ProjectDefaults } as SelectionCommandContext;
  return stretchEvenly.run(ctx);
}
function patch(res: ReturnType<typeof run>, id: string) {
  return res.elements?.find((p) => p.id === id)?.patch;
}

describe('selection command registry (Axis 6)', () => {
  it('registers the built-in spread-evenly + stretch-evenly commands', () => {
    expect(getSelectionCommand('spread-evenly')).toBe(spreadEvenly);
    expect(getSelectionCommand('stretch-evenly')).toBe(stretchEvenly);
    expect(listSelectionCommands().map((c) => c.id)).toEqual(expect.arrayContaining(['spread-evenly', 'stretch-evenly']));
  });
});

describe('spread-evenly', () => {
  it('redistributes gaps equally, keeping the outer edges fixed', () => {
    // 0..10, 15..25, 60..70 → span 0..70, 30" used, 40" gap over 2 slots = 20" each.
    const res = run([el('a', 0, 10), el('b', 15, 10), el('c', 60, 10)]);
    expect(patchX(res, 'a')).toBeCloseTo(0);
    expect(patchX(res, 'b')).toBeCloseTo(30);
    expect(patchX(res, 'c')).toBeCloseTo(60);
  });

  it('sorts by position, so selection order does not matter', () => {
    const res = run([el('c', 60, 10), el('a', 0, 10), el('b', 15, 10)]);
    expect(patchX(res, 'b')).toBeCloseTo(30);
  });

  it('spreads each band independently (base vs upper share the wall x-axis)', () => {
    const res = run([
      el('b1', 0, 10, 'base'), el('b2', 40, 10, 'base'),
      el('u1', 0, 10, 'upper'), el('u2', 20, 10, 'upper'),
    ]);
    // Base span 0..50 → middle stays put against the right edge math; upper span
    // 0..30 → its pair abuts (10" each, no leftover). Each row computes on its own.
    expect(patchX(res, 'b2')).toBeCloseTo(40);
    expect(patchX(res, 'u2')).toBeCloseTo(20);
  });

  it('is a no-op offer when no band has two selected (enabledFor false)', () => {
    expect(spreadEvenly.enabledFor!({ elements: [el('a', 0, 10, 'base'), el('b', 20, 10, 'upper')] } as SelectionCommandContext)).toBe(false);
    expect(spreadEvenly.enabledFor!({ elements: [el('a', 0, 10), el('b', 20, 10)] } as SelectionCommandContext)).toBe(true);
  });
});

describe('stretch-evenly', () => {
  it('resizes to equal widths that fill the span edge-to-edge, outer edges fixed', () => {
    // span 0..70 over 3 sections → 70/3 wide each, packed from x=0.
    const res = runStretch([el('a', 0, 10), el('b', 15, 10), el('c', 60, 10)]);
    const w = 70 / 3;
    expect(patch(res, 'a')).toMatchObject({ xIn: 0 });
    expect(patch(res, 'a')!.widthIn).toBeCloseTo(w);
    expect(patch(res, 'b')!.xIn).toBeCloseTo(w);
    expect(patch(res, 'b')!.widthIn).toBeCloseTo(w);
    expect(patch(res, 'c')!.xIn).toBeCloseTo(2 * w);
    // The right edge of the last section lands back on the original span end.
    expect(patch(res, 'c')!.xIn! + patch(res, 'c')!.widthIn!).toBeCloseTo(70);
  });

  it('stretches each band independently', () => {
    const res = runStretch([
      el('b1', 0, 10, 'base'), el('b2', 40, 10, 'base'),
      el('u1', 0, 10, 'upper'), el('u2', 20, 10, 'upper'),
    ]);
    expect(patch(res, 'b1')!.widthIn).toBeCloseTo(25); // base span 0..50 / 2
    expect(patch(res, 'u1')!.widthIn).toBeCloseTo(15); // upper span 0..30 / 2
  });
});
