import { describe, expect, it } from 'vitest';
import {
  bandsOverlap,
  bandsCollide,
  bandBlocks,
  freesUpperBand,
  elementsOverlapX,
  freeXForZone,
  clampElementX,
  maxWidthFor,
  minLeftFor,
  resizeLeftEdge,
  moveSeamBetween,
  applyWidthClamped,
  normalizeElement,
  autoExposedSides,
  resolveExposedSides,
} from '../layout';
import { MIN_CABINET_WIDTH, MIN_ELEMENT_WIDTH } from '../constants';
import { projectDefaults } from '../seed';
import type { Cabinet, Wall, WallElement, Zone } from '../types';

let n = 0;
function el(xIn: number, widthIn: number, zone: Zone, extra: Partial<WallElement> = {}): WallElement {
  return { id: `el${n++}`, xIn, widthIn, zone, ...extra };
}
function wall(elements: WallElement[], lengthIn = 120): Wall {
  return { id: 'w', name: 'W', lengthIn, ceilingHeightIn: 96, elements };
}
/** A cabinet element with an explicit depth, for the exposed-side tests. */
function cabEl(xIn: number, widthIn: number, zone: Zone, depthOverrideIn: number): WallElement {
  const cabinet: Cabinet = { id: `c${n}`, widthIn, front: [], depthOverrideIn };
  return el(xIn, widthIn, zone, { cabinet, depthOverrideIn });
}

describe('bandsOverlap', () => {
  it('same band always conflicts', () => {
    expect(bandsOverlap('base', 'base')).toBe(true);
    expect(bandsOverlap('upper', 'upper')).toBe(true);
  });
  it('base and upper are independent', () => {
    expect(bandsOverlap('base', 'upper')).toBe(false);
    expect(bandsOverlap('upper', 'base')).toBe(false);
  });
  it('a tall column spans both base and upper', () => {
    expect(bandsOverlap('tall', 'base')).toBe(true);
    expect(bandsOverlap('tall', 'upper')).toBe(true);
    expect(bandsOverlap('base', 'tall')).toBe(true);
  });
});

describe('freesUpperBand / bandsCollide (a fridge frees the band above it)', () => {
  const fridge = (x: number, w: number) => el(x, w, 'tall', { fixtureId: 'fridge' });
  const pantry = (x: number, w: number) => el(x, w, 'tall', { cabinet: { id: 'p', widthIn: w, front: [] } });

  it('a fridge frees the upper band; a tall pantry does not', () => {
    expect(freesUpperBand(fridge(0, 36))).toBe(true);
    expect(freesUpperBand(pantry(0, 24))).toBe(false);
    expect(freesUpperBand(el(0, 24, 'base'))).toBe(false);
  });
  it('a fridge and an upper over it do not collide, but a fridge and a base do', () => {
    expect(bandsCollide(fridge(0, 36), el(0, 36, 'upper'))).toBe(false);
    expect(bandsCollide(el(0, 36, 'upper'), fridge(0, 36))).toBe(false);
    expect(bandsCollide(fridge(0, 36), el(0, 36, 'base'))).toBe(true);
  });
  it('a tall pantry still collides with an upper above it', () => {
    expect(bandsCollide(pantry(0, 24), el(0, 24, 'upper'))).toBe(true);
  });
  it('bandBlocks lets an upper add-zone run over a fridge but not a pantry', () => {
    expect(bandBlocks(fridge(0, 36), 'upper')).toBe(false);
    expect(bandBlocks(fridge(0, 36), 'base')).toBe(true);
    expect(bandBlocks(pantry(0, 24), 'upper')).toBe(true);
    expect(bandBlocks(el(0, 24, 'upper'), 'tall')).toBe(true); // can't drop a tall over an upper
  });
  it('an upper can be placed/grown across a fridge without being pushed off', () => {
    const upper = el(0, 24, 'upper');
    const w = wall([fridge(20, 36), upper], 200);
    // the fridge no longer caps the upper's growth or shoves it sideways
    expect(maxWidthFor(w, upper)).toBe(200);
    expect(clampElementX(w, upper, 1000)).toBe(200 - 24);
  });
});

describe('elementsOverlapX', () => {
  it('detects an x-overlap but treats an abutting edge as clear', () => {
    expect(elementsOverlapX(el(0, 24, 'base'), el(12, 24, 'base'))).toBe(true);
    expect(elementsOverlapX(el(0, 24, 'base'), el(24, 24, 'base'))).toBe(false);
  });
});

describe('freeXForZone', () => {
  it('returns the right edge of the last element in the band', () => {
    const w = wall([el(0, 24, 'base'), el(24, 30, 'base'), el(0, 24, 'upper')]);
    expect(freeXForZone(w, 'base')).toBe(54);
    expect(freeXForZone(w, 'upper')).toBe(24);
    expect(freeXForZone(w, 'tall')).toBe(0);
  });
});

describe('clampElementX', () => {
  it('rests against a right neighbour instead of overlapping it', () => {
    const a = el(0, 24, 'base');
    const w = wall([a, el(40, 24, 'base')]);
    expect(clampElementX(w, a, 1000)).toBe(40 - 24);
  });
  it('rests against a left neighbour', () => {
    const a = el(40, 24, 'base');
    const w = wall([el(0, 24, 'base'), a]);
    expect(clampElementX(w, a, -1000)).toBe(24);
  });
  it('clamps to the wall when there is no neighbour', () => {
    const a = el(0, 24, 'base');
    const w = wall([a], 100);
    expect(clampElementX(w, a, 1000)).toBe(100 - 24);
    expect(clampElementX(w, a, -50)).toBe(0);
  });
  it('a tall column blocks a base element', () => {
    const base = el(0, 24, 'base');
    const w = wall([base, el(50, 24, 'tall')]);
    expect(clampElementX(w, base, 1000)).toBe(50 - 24);
  });
  it('ignores an upper neighbour for a base element', () => {
    const base = el(0, 24, 'base');
    const w = wall([base, el(30, 24, 'upper')], 200);
    expect(clampElementX(w, base, 1000)).toBe(200 - 24);
  });
});

describe('maxWidthFor', () => {
  it('caps growth at the nearest right neighbour', () => {
    const a = el(0, 24, 'base');
    const w = wall([a, el(40, 24, 'base')]);
    expect(maxWidthFor(w, a)).toBe(40);
  });
  it('caps growth at the wall end with no neighbour to the right', () => {
    const a = el(30, 24, 'base');
    expect(maxWidthFor(wall([a], 120), a)).toBe(90);
  });
});

describe('minLeftFor', () => {
  it('rests against a left neighbour, else the wall start', () => {
    const a = el(40, 24, 'base');
    expect(minLeftFor(wall([el(0, 24, 'base'), a]), a)).toBe(24);
    expect(minLeftFor(wall([a]), a)).toBe(0);
  });
});

describe('resizeLeftEdge (drag the left edge, right edge pinned)', () => {
  it('moves the left edge in, keeping the right edge put (a gap opens to the left)', () => {
    const a = el(24, 24, 'base'); // right edge at 48
    resizeLeftEdge(wall([a]), a, 36);
    expect(a.xIn).toBe(36);
    expect(a.xIn + a.widthIn).toBe(48); // right edge unchanged
    expect(a.widthIn).toBe(12);
  });
  it('cannot cross a left neighbour (clamps the left edge at its right edge)', () => {
    const a = el(24, 24, 'base'); // abuts a cabinet ending at 24
    resizeLeftEdge(wall([el(0, 24, 'base'), a]), a, 10);
    expect(a.xIn).toBe(24); // pinned at the neighbour
    expect(a.widthIn).toBe(24);
  });
  it('keeps at least the cabinet minimum width', () => {
    const a = el(0, 24, 'base', { cabinet: { id: 'c', widthIn: 24, front: [] } }); // right edge 24
    resizeLeftEdge(wall([a]), a, 1000);
    expect(a.widthIn).toBe(MIN_CABINET_WIDTH);
    expect(a.xIn + a.widthIn).toBe(24);
  });
});

describe('moveSeamBetween (resize both, outer edges pinned)', () => {
  it('slides the shared seam, keeping the pair span constant', () => {
    const left = el(0, 24, 'base'); // 0..24
    const right = el(24, 24, 'base'); // 24..48
    moveSeamBetween(left, right, 30);
    expect(left.xIn).toBe(0);
    expect(left.widthIn).toBe(30);
    expect(right.xIn).toBe(30);
    expect(right.xIn + right.widthIn).toBe(48); // right edge pinned
    expect(left.widthIn + right.widthIn).toBe(48); // span unchanged
  });
  it('clamps the seam so neither side drops below its minimum', () => {
    const left = el(0, 24, 'base', { cabinet: { id: 'l', widthIn: 24, front: [] } });
    const right = el(24, 24, 'base', { cabinet: { id: 'r', widthIn: 24, front: [] } });
    moveSeamBetween(left, right, 1000); // push the seam fully right
    expect(right.widthIn).toBe(MIN_CABINET_WIDTH);
    expect(left.widthIn).toBe(48 - MIN_CABINET_WIDTH);
  });
});

describe('applyWidthClamped', () => {
  it('clamps a plain element to maxW and the shared minimum', () => {
    const a = el(0, 24, 'base');
    applyWidthClamped(a, 100, 30);
    expect(a.widthIn).toBe(30);
    applyWidthClamped(a, 1, Infinity);
    expect(a.widthIn).toBe(MIN_ELEMENT_WIDTH);
  });
  it('snaps a locked appliance to the largest standard width that fits', () => {
    const fridge = el(0, 36, 'tall', { fixtureId: 'fridge', fixture: { widthLocked: true } });
    applyWidthClamped(fridge, 48, 40); // standards [30,33,36,42,48]; 42/48 don't fit 40
    expect(fridge.widthIn).toBe(36);
  });
});

describe('normalizeElement', () => {
  it('a standalone appliance clears the cabinet and adopts its band', () => {
    const e = el(0, 36, 'base', { fixtureId: 'fridge', cabinet: { id: 'c', widthIn: 36, front: [] } });
    normalizeElement(e);
    expect(e.cabinet).toBeUndefined();
    expect(e.zone).toBe('tall');
  });
  it('keeps an integratable cooktop alongside a cabinet', () => {
    const e = el(0, 30, 'base', { fixtureId: 'cooktop', cabinet: { id: 'c', widthIn: 30, front: [] } });
    normalizeElement(e);
    expect(e.cabinet).toBeTruthy();
    expect(e.fixtureId).toBe('cooktop');
  });
  it('drops an unknown fixture id', () => {
    const e = el(0, 24, 'base', { fixtureId: 'no-such-thing' });
    normalizeElement(e);
    expect(e.fixtureId).toBeUndefined();
  });
  it('cabinet wins over a stray workbench', () => {
    const e = el(0, 24, 'base', { cabinet: { id: 'c', widthIn: 24, front: [] }, workbench: true });
    normalizeElement(e);
    expect(e.cabinet).toBeTruthy();
    expect(e.workbench).toBeUndefined();
  });
});

describe('autoExposedSides (finished ends from the layout)', () => {
  const d = projectDefaults();

  it('hides both ends of a single cabinet that fills the wall (corners)', () => {
    const a = cabEl(0, 120, 'base', 24);
    expect(autoExposedSides(wall([a]), a, d)).toEqual([]);
  });

  it('finishes a mid-wall open end but hides a shared seam', () => {
    const a = cabEl(10, 30, 'base', 24);
    const b = cabEl(40, 30, 'base', 24);
    const w = wall([a, b]);
    // a's left faces open space; its right abuts b (equal depth → hidden).
    expect(autoExposedSides(w, a, d)).toEqual(['left']);
    // b's left abuts a (hidden); its right faces open space.
    expect(autoExposedSides(w, b, d)).toEqual(['right']);
  });

  it('hides an end tucked into the wall corner', () => {
    const a = cabEl(0, 30, 'base', 24); // left flush at x=0 (corner)
    const b = cabEl(90, 30, 'base', 24); // right flush at x=120 (corner)
    const w = wall([a, b]);
    // a: left at corner (hidden), right at x=30 open → exposed.
    expect(autoExposedSides(w, a, d)).toEqual(['right']);
    // b: left at x=90 open → exposed, right at wall end (hidden).
    expect(autoExposedSides(w, b, d)).toEqual(['left']);
  });

  it('finishes a side facing an appliance bay (only a carcass neighbour hides it)', () => {
    const a = cabEl(10, 24, 'base', 24);
    const appliance = el(34, 30, 'base', { fixtureId: 'dishwasher' }); // no cabinet
    const w = wall([a, appliance]);
    expect(autoExposedSides(w, a, d)).toEqual(['left', 'right']);
  });

  it('finishes a tall side that only a base cabinet abuts (upper band left open)', () => {
    // A base cabinet beside a tall covers only the base band; the tall protrudes
    // up past it, so the side is still finished.
    const tall = cabEl(40, 24, 'tall', 24);
    const base = cabEl(16, 24, 'base', 24);
    expect(autoExposedSides(wall([base, tall]), tall, d)).toContain('left');
  });

  it('hides a tall side only when both bands are covered by deep-enough neighbours', () => {
    const tall = cabEl(40, 24, 'tall', 24);
    const baseLeft = cabEl(16, 24, 'base', 24); // covers the base band
    const upperLeft = cabEl(16, 24, 'upper', 24); // and a deep upper covers the upper band
    const w = wall([baseLeft, upperLeft, tall]);
    // Left fully covered → hidden; right faces open space → finished.
    expect(autoExposedSides(w, tall, d)).toEqual(['right']);
  });

  it('finishes a tall side when the covering upper is shallower than the tall', () => {
    const tall = cabEl(40, 24, 'tall', 24);
    const baseLeft = cabEl(16, 24, 'base', 24); // deep enough on the base band
    const shallowUpper = cabEl(16, 24, 'upper', 12); // 12" upper can't hide a 24" pantry
    const w = wall([baseLeft, shallowUpper, tall]);
    expect(autoExposedSides(w, tall, d)).toContain('left');
  });
});

describe('resolveExposedSides (manual override wins over auto)', () => {
  const d = projectDefaults();

  it('uses an explicit override, including an empty one', () => {
    const a = cabEl(10, 30, 'base', 24); // auto would expose ['left']
    a.cabinet!.exposedSides = ['right'];
    expect(resolveExposedSides(wall([a]), a, d)).toEqual(['right']);
    a.cabinet!.exposedSides = []; // force none
    expect(resolveExposedSides(wall([a]), a, d)).toEqual([]);
  });

  it('falls back to auto when no override is set', () => {
    const a = cabEl(10, 30, 'base', 24);
    expect(resolveExposedSides(wall([a]), a, d)).toEqual(['left', 'right']);
  });
});
