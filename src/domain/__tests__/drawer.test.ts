import { describe, expect, it } from 'vitest';
import { buildCabinet, type BuildCabinetParams } from '../geometry/buildCabinet';
import { drawerPanels } from '../geometry/drawerBox';
import { resolveConstruction } from '../geometry/context';
import { buildAssembly } from '../assembly/steps';
import { validateProject } from '../validate';
import { projectDefaults, seedProject } from '../seed';
import type { Cabinet, DrawerJoint } from '../types';

const baseParams = (over: Partial<BuildCabinetParams> = {}): BuildCabinetParams => ({
  index: 1,
  runKind: 'base',
  depthIn: 24,
  carcassHeightIn: 30,
  legHeightIn: 4.5,
  hasLegs: true,
  materialIdByRole: {},
  colorByRole: {},
  textureByRole: {},
  defaults: projectDefaults(),
  ...over,
});

const drawerCab = (joint?: DrawerJoint): Cabinet => ({
  id: 'cab1',
  widthIn: 24,
  front: [{ id: 'd1', type: 'drawer', heightIn: 'auto' }],
  construction: joint ? { drawerJoint: joint } : undefined,
});

describe('resolveConstruction dado clamp (min material remaining)', () => {
  it('caps a dado that would cut through the drawer stock', () => {
    const cab: Cabinet = { id: 'c', widthIn: 24, front: [], construction: { drawerThicknessIn: 0.5, dadoDepthIn: 0.5 } };
    expect(resolveConstruction(cab, 'base').dadoDepthIn).toBe(0.25); // 1/2" stock - 1/4" remaining
  });
  it('caps against the material thickness when the dado comes from the project default', () => {
    const cab: Cabinet = { id: 'c', widthIn: 24, front: [] };
    const c = resolveConstruction(cab, 'base', { drawer: 0.5 }, { ...projectDefaults(), dadoDepthIn: 0.5 });
    expect(c.dadoDepthIn).toBe(0.25);
  });
  it('leaves a safe dado untouched', () => {
    const cab: Cabinet = { id: 'c', widthIn: 24, front: [], construction: { dadoDepthIn: 0.25 } };
    expect(resolveConstruction(cab, 'base', { drawer: 0.5 }).dadoDepthIn).toBe(0.25);
  });
  it('allows a deeper dado in thicker stock', () => {
    const cab: Cabinet = { id: 'c', widthIn: 24, front: [], construction: { drawerThicknessIn: 0.75, dadoDepthIn: 0.5 } };
    expect(resolveConstruction(cab, 'base').dadoDepthIn).toBe(0.5); // 3/4" stock - 1/4" leaves room
  });
});

describe('buildDrawer 3D panels', () => {
  it('renders a drawer box as five panels + one face (not a single block)', () => {
    const { nodes } = buildCabinet(drawerCab(), baseParams());
    expect(nodes.filter((n) => n.kind === 'drawerBox')).toHaveLength(5); // 2 sides, front, back, bottom
    expect(nodes.filter((n) => n.kind === 'face')).toHaveLength(1);
  });

  it('keeps every drawer box inside the carcass interior (no clash with top/bottom panels)', () => {
    // A three-drawer stack: the top/bottom faces are full-overlay (they cover the
    // carcass panels), but the boxes behind them must tuck inside [t, Hc - t].
    const cab: Cabinet = {
      id: 'cab1', widthIn: 24,
      front: [
        { id: 'd1', type: 'drawer', heightIn: 'auto' },
        { id: 'd2', type: 'drawer', heightIn: 'auto' },
        { id: 'd3', type: 'drawer', heightIn: 'auto' },
      ],
    };
    const Hc = 30;
    const t = 0.75; // default carcass thickness
    const { nodes } = buildCabinet(cab, baseParams({ carcassHeightIn: Hc }));
    const boxes = nodes.filter((n) => n.kind === 'drawerBox');
    expect(boxes.length).toBeGreaterThan(0);
    for (const n of boxes) {
      const top = n.pos[1] + n.size[1] / 2;
      const bottom = n.pos[1] - n.size[1] / 2;
      expect(top).toBeLessThanOrEqual(Hc - t + 1e-6); // below the top panel
      expect(bottom).toBeGreaterThanOrEqual(t - 1e-6); // above the bottom panel
    }
  });
});

describe('drawer joinery is configurable', () => {
  it('dado joint tags sides with dado and no screws', () => {
    const { parts } = buildCabinet(drawerCab('dado'), baseParams());
    const side = parts.find((p) => p.id === 'C1-DR1-SIDE')!;
    expect(side.joinery).toContain('dado');
    expect(side.joinery).not.toContain('screw');
  });

  it('dado + screws adds the screw tag to the sides', () => {
    const { parts } = buildCabinet(drawerCab('dadoScrew'), baseParams());
    const side = parts.find((p) => p.id === 'C1-DR1-SIDE')!;
    expect(side.joinery).toContain('dado');
    expect(side.joinery).toContain('screw');
  });

  it('front/back seat into the dados — wider than a plain butt joint', () => {
    const { parts } = buildCabinet(drawerCab('dado'), baseParams());
    const fb = parts.find((p) => p.id === 'C1-DR1-FB')!;
    // fbWidth is independent of box height, so any height reproduces it.
    const panels = drawerPanels(24, 0.75, 22, fb.lIn, {
      joint: 'dado', slideType: 'side', drawerThicknessIn: 0.5, dadoDepthIn: 0.25,
    });
    expect(fb.wIn).toBeCloseTo(panels.fbWidthIn, 6);
    expect(fb.wIn).toBeGreaterThan(panels.interiorWidthIn);
  });

  it('a per-cabinet override beats the project default', () => {
    // Project default is dado (no screws); cabinet overrides to dado + screws.
    const params = baseParams({ defaults: { ...projectDefaults(), drawerJoint: 'dado' } });
    const { parts } = buildCabinet(drawerCab('dadoScrew'), params);
    expect(parts.find((p) => p.id === 'C1-DR1-SIDE')!.joinery).toContain('screw');
  });
});

describe('slide type changes the box width', () => {
  it('under-mount produces a wider box than side-mount', () => {
    const side = buildCabinet(drawerCab(), baseParams({ defaults: { ...projectDefaults(), slideType: 'side' } }));
    const under = buildCabinet(drawerCab(), baseParams({ defaults: { ...projectDefaults(), slideType: 'under' } }));
    const fbW = (b: typeof side) => b.parts.find((p) => p.id === 'C1-DR1-FB')!.wIn;
    expect(fbW(under)).toBeGreaterThan(fbW(side));
  });
});

describe('assembly steps reflect the joint + slide type', () => {
  it('mentions dados, screws, and side-mount for the default seed project', () => {
    const text = buildAssembly(seedProject())
      .flatMap((c) => c.steps)
      .map((s) => s.text)
      .find((t) => t.startsWith('Build drawer'))!;
    expect(text).toMatch(/dado/i);
    expect(text).toMatch(/screw/i); // seed default is dado + screws
    expect(text).toMatch(/side-mount/i);
  });

  it('honours project defaults (not just the constants)', () => {
    const p = seedProject();
    p.defaults = { ...p.defaults, drawerJoint: 'dado', slideType: 'under' };
    const text = buildAssembly(p)
      .flatMap((c) => c.steps)
      .map((s) => s.text)
      .find((t) => t.startsWith('Build drawer'))!;
    expect(text).not.toMatch(/screws per corner/i); // 'dado' (glue), not dado+screws
    expect(text).toMatch(/under-mount/i);
  });
});

describe('drawer validation', () => {
  it('warns when a requested slide is deeper than the cabinet', () => {
    const p = seedProject();
    // Drop a too-deep slide onto the first drawer we can find.
    outer: for (const room of p.rooms) {
      for (const wall of room.walls) {
        for (const el of wall.elements) {
          const op = el.cabinet?.front.find((o) => o.type === 'drawer');
          if (op) { op.drawer = { slideLenIn: 99 }; break outer; }
        }
      }
    }
    expect(validateProject(p).some((w) => w.kind === 'drawer')).toBe(true);
  });
});
