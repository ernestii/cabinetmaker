import { describe, expect, it } from 'vitest';
import { layoutFronts, singleFaceWidth, doubleDoorLeafWidth, revealHeightForCount, frontsOverflowIn } from '../geometry/fronts';
import { drawerPanels } from '../geometry/drawerBox';
import { projectDefaults } from '../seed';
import { hingePlan } from '../geometry/doors';
import { carcassHeightForRun, buildCabinet } from '../geometry/buildCabinet';
import { toFraction, parseInches, snapTo } from '../format';
import type { Opening } from '../types';
import { REVEAL, SNAP_DENOM, standardSlideLength } from '../constants';

const op = (o: Partial<Opening>): Opening => ({ id: 'x', type: 'drawer', heightIn: 'auto', ...o });

describe('reveal / front distribution', () => {
  it('sum of face heights equals Hf - n*(2*REVEAL)', () => {
    const Hf = 30;
    const openings = [op({}), op({}), op({})];
    const items = layoutFronts(openings, Hf);
    const sum = items.reduce((s, i) => s + i.faceHeightIn, 0);
    expect(sum).toBeCloseTo(Hf - revealHeightForCount(3), 6);
  });

  it('honors explicit heights and shares leftover with auto', () => {
    const Hf = 30;
    const items = layoutFronts([op({ heightIn: 6 }), op({}), op({})], Hf);
    // Fixed 6" is the module/slot; the face is inset 2×REVEAL → 5.875".
    expect(items[0].faceHeightIn).toBe(6 - 2 * REVEAL);
    expect(items[1].faceHeightIn).toBeCloseTo(items[2].faceHeightIn, 6);
    const sum = items.reduce((s, i) => s + i.faceHeightIn, 0);
    expect(sum).toBeCloseTo(Hf - revealHeightForCount(3), 6);
  });

  it('faces do not overlap and respect 1/8" gaps', () => {
    const items = layoutFronts([op({}), op({}), op({})], 30);
    for (let i = 1; i < items.length; i++) {
      const gap = items[i - 1].bottomY - items[i].topY;
      expect(gap).toBeCloseTo(2 * REVEAL, 6);
    }
    // top reveal
    expect(30 - items[0].topY).toBeCloseTo(REVEAL, 6);
    // bottom reveal
    expect(items[items.length - 1].bottomY).toBeCloseTo(REVEAL, 6);
  });

  it('single face width = W - 1/8', () => {
    expect(singleFaceWidth(24)).toBeCloseTo(24 - 0.125, 6);
  });

  it('double-door leaf width = (W - 1/4)/2', () => {
    expect(doubleDoorLeafWidth(24)).toBeCloseTo((24 - 0.25) / 2, 6);
  });
});

describe('1/16" snapping of fronts', () => {
  const onGrid = (v: number) => expect(Math.abs(v * SNAP_DENOM - Math.round(v * SNAP_DENOM))).toBeLessThan(1e-6);

  it('every auto face lands on the 1/16" grid and the stack never overflows', () => {
    // 7 fronts in a 30" opening → exact division is 4.1607" (off-grid).
    const Hf = 30;
    const items = layoutFronts(Array.from({ length: 7 }, () => op({})), Hf);
    for (const it of items) onGrid(it.faceHeightIn);
    const sum = items.reduce((s, i) => s + i.faceHeightIn, 0);
    const available = Hf - revealHeightForCount(7);
    // snapped faces fill the opening to within one 1/16" unit, never past it
    expect(sum).toBeLessThanOrEqual(available + 1e-9);
    expect(available - sum).toBeLessThan(1 / SNAP_DENOM);
    // no face overlaps its neighbour
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].bottomY - items[i].topY).toBeCloseTo(2 * REVEAL, 6);
    }
  });

  it('reports overflow when fixed fronts exceed the opening', () => {
    const openings = [op({ heightIn: 20 }), op({ heightIn: 20 })]; // 40" of fronts in 30"
    expect(frontsOverflowIn(openings, 30)).toBeGreaterThan(9);
    expect(frontsOverflowIn([op({ heightIn: 10 }), op({})], 30)).toBe(0);
  });
});

describe('standard slide lengths', () => {
  it('snaps down to a purchasable length that fits', () => {
    expect(standardSlideLength(23)).toBe(22);
    expect(standardSlideLength(20)).toBe(20);
    expect(standardSlideLength(19)).toBe(18); // 19" isn't a real slide
    expect(standardSlideLength(9)).toBe(10); // floor to the smallest available
  });
});

describe('drawer box', () => {
  const sideSpec = { joint: 'dado' as const, slideType: 'side' as const, drawerThicknessIn: 0.5, dadoDepthIn: 0.25 };
  it('side-mount box outer width = innerW - 1 (1/2" per side)', () => {
    const d = drawerPanels(24, 0.75, 22, 4, sideSpec);
    expect(d.boxOuterWidthIn).toBeCloseTo(24 - 1.5 - 1, 6); // 21.5
    expect(d.boxDepthIn).toBe(22);
  });
  it('front/back seat into the side dados (interior + 2× dado depth)', () => {
    const d = drawerPanels(24, 0.75, 22, 4, sideSpec);
    expect(d.fbWidthIn).toBeCloseTo(d.interiorWidthIn + 2 * 0.25, 6);
  });
  it('bottom is captured in grooves on all four sides', () => {
    const d = drawerPanels(24, 0.75, 22, 4, sideSpec);
    expect(d.bottomWidthIn).toBeCloseTo(d.interiorWidthIn + 2 * 0.25, 6);
    expect(d.bottomLengthIn).toBeCloseTo(d.interiorDepthIn + 2 * 0.25, 6);
  });
  it('under-mount box is wider than side-mount (less clearance)', () => {
    const under = drawerPanels(24, 0.75, 22, 4, { ...sideSpec, slideType: 'under' });
    const side = drawerPanels(24, 0.75, 22, 4, sideSpec);
    expect(under.boxOuterWidthIn).toBeGreaterThan(side.boxOuterWidthIn);
  });
});

describe('hinges', () => {
  it('2 hinges for short doors, 3 for tall', () => {
    expect(hingePlan(30).count).toBe(2);
    expect(hingePlan(48).count).toBe(3);
    expect(hingePlan(30).positionsIn).toHaveLength(2);
  });
});

describe('carcass height per run kind', () => {
  it('base = counter - legs - counter thickness', () => {
    expect(carcassHeightForRun('base', { counterHeightIn: 36, legHeightIn: 4.5, counterThicknessIn: 1.5 })).toBe(30);
  });
  it('tall = height - legs', () => {
    expect(carcassHeightForRun('tall', { heightIn: 84, legHeightIn: 4.5, counterThicknessIn: 1.5 })).toBe(79.5);
  });
  it('upper = height', () => {
    expect(carcassHeightForRun('upper', { heightIn: 30, legHeightIn: 4.5, counterThicknessIn: 1.5 })).toBe(30);
  });
});

describe('buildCabinet integration', () => {
  const params = {
    index: 1,
    runKind: 'base' as const,
    depthIn: 24,
    carcassHeightIn: 30,
    legHeightIn: 4.5,
    hasLegs: true,
    materialIdByRole: {},
    colorByRole: {},
    textureByRole: {},
    defaults: projectDefaults(),
  };

  it('a 3-drawer base cabinet produces carcass + 3 boxes + 3 faces', () => {
    const cab = {
      id: 'cab1',
      widthIn: 24,
      front: [op({ id: 'a' }), op({ id: 'b' }), op({ id: 'c' })],
    };
    const { parts } = buildCabinet(cab, params);
    const faces = parts.filter((p) => p.role === 'face');
    expect(faces).toHaveLength(3);
    // carcass: 2 sides + bottom + 2 stretchers + back (qty-collapsed by id)
    expect(parts.find((p) => p.id === 'C1-SIDE')?.qty).toBe(2);
    expect(parts.find((p) => p.id === 'C1-STR')?.qty).toBe(2);
    expect(parts.find((p) => p.id === 'C1-BACK')).toBeTruthy();
    // all face IDs unique
    const ids = parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('back style "rails" yields two hanging rails, not a full back panel', () => {
    const railCab = { id: 'cr', widthIn: 24, front: [op({ type: 'door', doorCount: 2, heightIn: 'auto' })], construction: { backStyle: 'rails' as const } };
    const { parts } = buildCabinet(railCab, params);
    expect(parts.find((p) => p.id === 'C1-BACK')).toBeUndefined();
    const rail = parts.find((p) => p.id === 'C1-BACK-RAIL');
    expect(rail?.qty).toBe(2);
    // Rails use far less sheet than a full back.
    const panelCab = { id: 'cp', widthIn: 24, front: railCab.front, construction: { backStyle: 'panel' as const } };
    const back = buildCabinet(panelCab, params).parts.find((p) => p.id === 'C1-BACK')!;
    expect(rail!.wIn * rail!.lIn * rail!.qty).toBeLessThan(back.wIn * back.lIn);
  });

  it('a false front produces a cut face part', () => {
    const cab = { id: 'cf', widthIn: 18, front: [op({ id: 'ff', type: 'falseFront', heightIn: 6 })] };
    const { parts } = buildCabinet(cab, params);
    const faces = parts.filter((p) => p.role === 'face');
    expect(faces).toHaveLength(1);
    expect(faces[0].label).toContain('False front');
    expect(faces[0].wIn).toBeCloseTo(singleFaceWidth(18), 6);
  });

  it('a fixed opening produces no face', () => {
    const cab = { id: 'cx', widthIn: 18, front: [op({ id: 'fx', type: 'fixed', heightIn: 6 })] };
    const { parts } = buildCabinet(cab, params);
    expect(parts.filter((p) => p.role === 'face')).toHaveLength(0);
  });

  describe('enclosed open bays (fixed dividers)', () => {
    const divs = (parts: { id: string }[]) => parts.filter((p) => /^C1-DIV/.test(p.id)).map((p) => p.id).sort();

    it('a lone open bay spanning the carcass needs no divider (carcass closes it)', () => {
      const cab = { id: 'c', widthIn: 24, front: [op({ id: 'fx', type: 'fixed', heightIn: 'auto' as const })] };
      expect(divs(buildCabinet(cab, params).parts)).toEqual([]);
    });

    it('Door / Open / Drawer encloses the open bay top and bottom', () => {
      const cab = {
        id: 'c', widthIn: 24,
        front: [
          op({ id: 'd', type: 'door', heightIn: 'auto' as const }),
          op({ id: 'o', type: 'fixed', heightIn: 'auto' as const }),
          op({ id: 'r', type: 'drawer', heightIn: 'auto' as const }),
        ],
      };
      const { parts } = buildCabinet(cab, params);
      // One ordinal-1 fixed front → an upper + lower divider, deduped to two panels.
      expect(divs(parts)).toEqual(['C1-DIV1B', 'C1-DIV1T']);
      const div = parts.find((p) => p.id === 'C1-DIV1B')!;
      expect(div.role).toBe('carcass');
      expect(div.joinery).toEqual(['dado', 'glue']);
      expect(div.qty).toBe(1);
      // Full interior width, like the carcass bottom (W - 2*carcass thickness).
      expect(div.wIn).toBeCloseTo(24 - 2 * 0.75, 6);
    });

    it('two stacked open bays share one divider at the boundary (no double panel)', () => {
      const cab = {
        id: 'c', widthIn: 24,
        front: [
          op({ id: 'a', type: 'fixed', heightIn: 'auto' as const }),
          op({ id: 'b', type: 'fixed', heightIn: 'auto' as const }),
          op({ id: 'r', type: 'drawer', heightIn: 'auto' as const }),
        ],
      };
      const { parts, nodes } = buildCabinet(cab, params);
      // a's bottom (shared a|b), b's bottom (b|drawer); b's top is owned by a, not duplicated.
      expect(divs(parts)).toEqual(['C1-DIV1B', 'C1-DIV2B']);
      // exactly two physical divider nodes
      expect(nodes.filter((n) => n.partId?.startsWith('C1-DIV'))).toHaveLength(2);
    });

    it('the Enclose toggle off restores a bare open reveal', () => {
      const cab = {
        id: 'c', widthIn: 24,
        front: [
          op({ id: 'd', type: 'door', heightIn: 'auto' as const }),
          op({ id: 'o', type: 'fixed', heightIn: 'auto' as const, settings: { enclose: false } }),
          op({ id: 'r', type: 'drawer', heightIn: 'auto' as const }),
        ],
      };
      expect(divs(buildCabinet(cab, params).parts)).toEqual([]);
    });
  });

  describe('door section dividers', () => {
    const ddivs = (parts: { id: string }[]) => parts.filter((p) => /^C1-DDIV/.test(p.id)).map((p) => p.id).sort();
    const door = (id: string, divider?: boolean) =>
      op({ id, type: 'door' as const, heightIn: 'auto' as const, ...(divider ? { settings: { divider: true } } : {}) });

    it('plain stacked doors share one cavity (no dividers by default)', () => {
      const cab = { id: 'c', widthIn: 24, front: [door('a'), door('b'), door('c')] };
      const { parts } = buildCabinet(cab, params);
      expect(ddivs(parts)).toEqual([]);
      // still three real door faces
      expect(parts.filter((p) => p.role === 'face')).toHaveLength(3);
    });

    it('three divided doors yield two interior dividers (deduped, carcass closes the ends)', () => {
      const cab = { id: 'c', widthIn: 24, front: [door('a', true), door('b', true), door('c', true)] };
      const { parts, nodes } = buildCabinet(cab, params);
      expect(ddivs(parts)).toEqual(['C1-DDIV1B', 'C1-DDIV2B']);
      expect(nodes.filter((n) => n.partId?.startsWith('C1-DDIV'))).toHaveLength(2);
      const div = parts.find((p) => p.id === 'C1-DDIV1B')!;
      expect(div.role).toBe('carcass');
      expect(div.joinery).toEqual(['dado', 'glue']);
      expect(div.wIn).toBeCloseTo(24 - 2 * 0.75, 6);
      // three door faces survive alongside the dividers
      expect(parts.filter((p) => p.role === 'face')).toHaveLength(3);
    });

    it('a single divided middle door walls itself off top and bottom', () => {
      const cab = { id: 'c', widthIn: 24, front: [door('a'), door('b', true), door('c')] };
      expect(ddivs(buildCabinet(cab, params).parts)).toEqual(['C1-DDIV2B', 'C1-DDIV2T']);
    });

    it('door DDIV ids never clash with an open bay DIV in the same cabinet', () => {
      const cab = {
        id: 'c', widthIn: 24,
        front: [door('a', true), op({ id: 'o', type: 'fixed', heightIn: 'auto' as const }), door('c', true)],
      };
      const { parts } = buildCabinet(cab, params);
      const ids = parts.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length); // all unique
    });
  });

  it('side panel length equals carcass height', () => {
    const cab = { id: 'c', widthIn: 24, front: [op({ type: 'door', doorCount: 2, heightIn: 'auto' })] };
    const { parts } = buildCabinet(cab, params);
    const side = parts.find((p) => p.id === 'C1-SIDE')!;
    expect(side.lIn).toBe(30);
    expect(side.wIn).toBe(24);
  });

  it('an exposed side splits off a finished face-stock panel', () => {
    const cab = { id: 'c', widthIn: 24, front: [op({ type: 'door', doorCount: 2, heightIn: 'auto' })] };
    const { parts } = buildCabinet(cab, { ...params, exposedSides: ['left'] });
    // One side stays carcass, the exposed one becomes a face part — same dims.
    const carc = parts.find((p) => p.id === 'C1-SIDE')!;
    const fin = parts.find((p) => p.id === 'C1-SIDE-FIN')!;
    expect(carc.qty).toBe(1);
    expect(carc.role).toBe('carcass');
    expect(fin.qty).toBe(1);
    expect(fin.role).toBe('face');
    expect(fin.materialId).toBe('face');
    expect([fin.wIn, fin.lIn]).toEqual([carc.wIn, carc.lIn]);
  });

  it('two exposed sides emit a single qty-2 finished panel and no carcass side', () => {
    const cab = { id: 'c', widthIn: 24, front: [op({ type: 'door', doorCount: 2, heightIn: 'auto' })] };
    const { parts } = buildCabinet(cab, { ...params, exposedSides: ['left', 'right'] });
    expect(parts.find((p) => p.id === 'C1-SIDE')).toBeUndefined();
    expect(parts.find((p) => p.id === 'C1-SIDE-FIN')?.qty).toBe(2);
  });

  it('drawer + back thickness follow the assigned material thickness', () => {
    const cab = { id: 'c', widthIn: 24, front: [op({ id: 'a' })] };
    // One 3/4" material serving every role (the "single material" case).
    const thicknessByRole = { carcass: 0.75, drawer: 0.75, drawerBottom: 0.75, back: 0.75, face: 0.75 };
    const { parts } = buildCabinet(cab, { ...params, thicknessByRole });
    expect(parts.find((p) => p.id === 'C1-DR1-SIDE')?.thicknessIn).toBe(0.75);
    expect(parts.find((p) => p.id === 'C1-DR1-BOT')?.thicknessIn).toBe(0.75);
    expect(parts.find((p) => p.id === 'C1-BACK')?.thicknessIn).toBe(0.75);
  });

  it('a per-cabinet construction override still wins over the material thickness', () => {
    const cab = { id: 'c', widthIn: 24, front: [op({ id: 'a' })], construction: { drawerThicknessIn: 0.5 } };
    const { parts } = buildCabinet(cab, { ...params, thicknessByRole: { drawer: 0.75 } });
    expect(parts.find((p) => p.id === 'C1-DR1-SIDE')?.thicknessIn).toBe(0.5);
  });
});

describe('fraction formatting', () => {
  it('formats common values', () => {
    expect(toFraction(23.25)).toBe('23 1/4"');
    expect(toFraction(0.0625)).toBe('1/16"');
    expect(toFraction(30)).toBe('30"');
    expect(toFraction(21.5)).toBe('21 1/2"');
  });
  it('round-trips with parseInches', () => {
    expect(parseInches('23 1/4')).toBeCloseTo(23.25, 6);
    expect(parseInches('1/2')).toBeCloseTo(0.5, 6);
    expect(parseInches('30')).toBe(30);
  });
  it('rejects division by zero and non-finite input', () => {
    expect(parseInches('1/0')).toBeNull();
    expect(parseInches('1 1/0')).toBeNull();
    expect(parseInches('abc')).toBeNull();
  });
  it('snapTo rounds to the nearest 1/16"', () => {
    expect(snapTo(4.1607)).toBeCloseTo(4.1875, 6); // 4 3/16"
    expect(snapTo(0.05)).toBe(0.0625); // nearest sixteenth
    expect(snapTo(0.03)).toBe(0); // rounds down below 1/32"
    expect(snapTo(30)).toBe(30);
  });
});
