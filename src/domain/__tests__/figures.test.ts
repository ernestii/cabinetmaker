import { describe, expect, it } from 'vitest';
import { cabinetFigures } from '../assembly/figures';
import { buildAssembly } from '../assembly/steps';
import { nodeAssemblyPhase } from '../assembly/nodePhase';
import { buildCabinet } from '../geometry/buildCabinet';
import { hingePlan } from '../geometry/doors';
import { drawerPanels, resolveSlideLength } from '../geometry/drawerBox';
import { projectDefaults, seedProject } from '../seed';
import { toFraction } from '../format';
import type { Cabinet, Node3D } from '../types';

const Hc = 30;
const params = { index: 1, runKind: 'base' as const, depthIn: 24, carcassHeightIn: Hc, legHeightIn: 4.5, hasLegs: true, materialIdByRole: {}, colorByRole: {}, textureByRole: {}, defaults: projectDefaults() };
const partsFor = (cab: Cabinet) => buildCabinet(cab, params).parts;
const figuresFor = (cab: Cabinet) => cabinetFigures(cab, 'base', 1, cab.widthIn, Hc, projectDefaults(), partsFor(cab));

// 24"w base: an 8" drawer over an auto door (the golden-dimensions cabinet).
const golden: Cabinet = { id: 'A', widthIn: 24, front: [{ id: 'd', type: 'drawer', heightIn: 8 }, { id: 'o', type: 'door', doorCount: 1, heightIn: 'auto', shelves: 2 }] };

// The overall carcass orientation is the interactive 3D figure; the 2D figures
// carry the shop-floor machining detail (dados, grooves, borings). The carcass/
// face dimensions stay locked by the goldenDimensions + scene suites.

describe('drawer machining figure', () => {
  it('draws the side + front/back with end dados and the bottom groove, dimensioned', () => {
    const fig = figuresFor(golden).find((f) => f.kind === 'drawerBox')!;
    const slideLen = resolveSlideLength(24);
    const p = drawerPanels(24, 0.75, slideLen, 7, { joint: 'dadoScrew', slideType: 'side', drawerThicknessIn: 0.5, dadoDepthIn: 0.25 });
    const dados = fig.boxes.filter((b) => b.cls === 'dado');
    expect(dados).toHaveLength(4); // 2 end dados + groove on the side, groove on F/B
    // End dados: 1/4 in from each end of the side, drawer-stock wide.
    expect(dados[0]).toMatchObject({ x: 0.25, w: 0.5 });
    expect(dados[1].x).toBeCloseTo(slideLen - 0.25 - 0.5, 6);
    const dimTexts = fig.dims.map((d) => d.text);
    expect(dimTexts).toContain(toFraction(slideLen)); // side length
    expect(dimTexts).toContain(toFraction(p.fbWidthIn)); // front/back width
    expect(fig.leaders!.some((l) => /dado/.test(l.text))).toBe(true);
    expect(fig.leaders!.some((l) => /groove/.test(l.text))).toBe(true);
    expect(fig.model).toBeUndefined(); // 2D drawing, not a 3D inset
  });

  it('collapses identical drawer boxes into one ×N figure', () => {
    const bank: Cabinet = { id: 'B', widthIn: 30, front: [
      { id: '1', type: 'drawer', heightIn: 'auto' },
      { id: '2', type: 'drawer', heightIn: 'auto' },
      { id: '3', type: 'drawer', heightIn: 'auto' },
    ] };
    const boxes = figuresFor(bank).filter((f) => f.kind === 'drawerBox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].title).toContain('×3');
  });
});

describe('hinge boring figure', () => {
  it('draws the leaf with one Ø35mm cup per hinge at the planned positions', () => {
    const fig = figuresFor(golden).find((f) => f.kind === 'hingeBore')!;
    // Door is the auto front over an 8" drawer slot: 30 − 8 module → 21.875" face.
    const doorFaceH = 21.875;
    const hp = hingePlan(doorFaceH);
    const cups = fig.holes!.filter((h) => h.kind === 'cup');
    expect(cups).toHaveLength(hp.count);
    const cupEdgeIn = hp.cupEdgeMm / 25.4;
    cups.forEach((c) => expect(c.cx).toBeCloseTo(cupEdgeIn, 6));
    // svg y-down: cup at `pos` from the bottom sits at faceH - pos.
    expect(cups.map((c) => doorFaceH - c.cy).sort((a, b) => a - b).map((v) => +v.toFixed(4)))
      .toEqual([...hp.positionsIn].sort((a, b) => a - b).map((v) => +v.toFixed(4)));
    expect(fig.title).toContain('Ø35mm');
    expect(fig.leaders).toHaveLength(hp.count); // a position callout per cup
  });
});

describe('gable drilling & joinery figures', () => {
  const gables = figuresFor(golden).filter((f) => f.kind === 'gable');
  const left = gables.find((f) => f.id.endsWith('left'))!;
  const right = gables.find((f) => f.id.endsWith('right'))!;

  it('draws one figure per gable, leading the figure list, both linking the side panel', () => {
    expect(gables).toHaveLength(2);
    expect(figuresFor(golden)[0].kind).toBe('gable');
    for (const f of gables) {
      expect(f.partIds).toEqual(['C1-SIDE']);
      expect(f.phase).toBe('carcass');
      expect(f.title).toContain('C1-SIDE');
      expect(f.boxes[0].label).toBe('C1-SIDE'); // part number on the drawing itself
    }
  });

  it('shows back/bottom/top lands on both, mirrored', () => {
    for (const f of gables) expect(f.boxes.filter((b) => b.cls === 'land').length).toBeGreaterThanOrEqual(3);
    // The back land hugs x=0 on the left gable and x=D-tb on the right (mirror).
    const backL = left.boxes.find((b) => b.cls === 'land' && b.h > 20)!;
    const backR = right.boxes.find((b) => b.cls === 'land' && b.h > 20)!;
    expect(backL.x).toBe(0);
    expect(backR.x + backR.w).toBeCloseTo(24, 6);
  });

  it('bores shelf-pin rows on both gables, mirrored', () => {
    for (const f of gables) {
      const pins = f.holes!.filter((h) => h.kind === 'pin');
      expect(pins.length).toBeGreaterThan(4);
      expect([...new Set(pins.map((p) => +p.cx.toFixed(3)))]).toHaveLength(2); // two columns
    }
    const colsL = [...new Set(left.holes!.filter((h) => h.kind === 'pin').map((p) => +p.cx.toFixed(3)))].sort((a, b) => a - b);
    const colsR = [...new Set(right.holes!.filter((h) => h.kind === 'pin').map((p) => +p.cx.toFixed(3)))].sort((a, b) => a - b);
    expect(colsR).toEqual(colsL.map((x) => +(24 - x).toFixed(3)).sort((a, b) => a - b));
  });

  it('puts hinge plates only on the gable the door hinges on (default: left)', () => {
    const platesL = left.holes!.filter((h) => h.kind === 'plate');
    const platesR = right.holes!.filter((h) => h.kind === 'plate');
    expect(platesL).toHaveLength(hingePlan(21.75).count);
    expect(platesR).toHaveLength(0);
    platesL.forEach((p) => expect(p.cx).toBeCloseTo(24 - 37 / 25.4, 6)); // 37mm off the front edge
  });

  it('a double door puts plates on both gables', () => {
    const pair: Cabinet = { id: 'P', widthIn: 30, front: [{ id: 'o', type: 'door', doorCount: 2, heightIn: 'auto' }] };
    for (const f of figuresFor(pair).filter((x) => x.kind === 'gable')) {
      expect(f.holes!.filter((h) => h.kind === 'plate').length).toBeGreaterThan(0);
    }
  });
});

describe('buildAssembly threads valid figures', () => {
  const cabs = buildAssembly(seedProject());

  it('any detail-inset figure has a sane viewBox', () => {
    expect(cabs.length).toBeGreaterThan(0);
    for (const c of cabs) {
      // A cabinet may now have zero 2D insets (carcass/faces are the 3D figure);
      // whatever insets it does have must be well-formed.
      for (const f of c.figures) {
        expect(Number.isFinite(f.view.w) && f.view.w > 0).toBe(true);
        expect(Number.isFinite(f.view.h) && f.view.h > 0).toBe(true);
      }
    }
  });

  it('figure part IDs resolve to real parts (cabinet numbering stays in sync)', () => {
    for (const c of cabs) {
      const ids = new Set(c.parts.map((p) => p.id));
      for (const f of c.figures) {
        for (const pid of f.partIds ?? []) expect(ids.has(pid)).toBe(true);
      }
    }
  });

  it('cabinet sections carry 3D nodes for the interactive figure', () => {
    const cabinetSections = cabs.filter((c) => c.title.startsWith('Cabinet '));
    expect(cabinetSections.length).toBeGreaterThan(0);
    for (const c of cabinetSections) expect(c.nodes.length).toBeGreaterThan(0);
  });
});

describe('nodeAssemblyPhase', () => {
  const node = (kind: Node3D['kind'], open?: Node3D['open']): Node3D =>
    ({ pos: [0, 0, 0], size: [1, 1, 1], color: '#fff', kind, open });

  it('maps node kind + open-group onto the build phase', () => {
    expect(nodeAssemblyPhase(node('panel'))).toBe('carcass');
    expect(nodeAssemblyPhase(node('back'))).toBe('carcass');
    expect(nodeAssemblyPhase(node('leg'))).toBe('carcass');
    expect(nodeAssemblyPhase(node('drawerBox', { id: 'd', kind: 'drawer', travel: 20 }))).toBe('boxes');
    expect(nodeAssemblyPhase(node('face', { id: 'd', kind: 'drawer', travel: 20 }))).toBe('faces');
    expect(nodeAssemblyPhase(node('face', { id: 'o', kind: 'door', pivot: [0, 0, 0], swing: 1 }))).toBe('doors');
    expect(nodeAssemblyPhase(node('handle', { id: 'o', kind: 'door', pivot: [0, 0, 0], swing: 1 }))).toBe('doors');
  });
});
