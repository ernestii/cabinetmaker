import type { Part } from '../types';
import { BACK_RAIL_WIDTH, TOEKICK_RECESS } from '../constants';
import {
  colorFor,
  materialFor,
  textureFor,
  type BuildContext,
  type PartFactory,
} from './context';

/**
 * Build carcass panels (sides, bottom, top/stretchers, back) + legs.
 * Frame: x∈[0,W], y∈[0,Hc] (carcass), z∈[0,D], wall at z=0.
 */
export function buildCarcass(ctx: BuildContext, f: PartFactory): void {
  const { widthIn: W, depthIn: D, carcassHeightIn: Hc, index, c } = ctx;
  const t = c.carcassThicknessIn;
  const tb = c.backThicknessIn;
  const id = (s: string) => `C${index}-${s}`;

  const carcassMat = materialFor(ctx, 'carcass');
  const carcassColor = colorFor(ctx, 'carcass');
  const carcassTex = textureFor(ctx, 'carcass');
  const backMat = materialFor(ctx, 'back');
  const backColor = colorFor(ctx, 'back');

  const panel = (
    partId: string,
    label: string,
    role: Part['role'],
    matId: string,
    thickness: number,
    wIn: number,
    lIn: number,
    qty: number,
    edges: Part['edgeBandEdges'],
    joinery: Part['joinery'],
  ) => {
    f.add({
      id: partId,
      label,
      role,
      materialId: matId,
      thicknessIn: thickness,
      wIn,
      lIn,
      qty,
      edgeBandEdges: edges,
      joinery,
      grainLocked: true,
    });
  };

  // --- Sides (gables) ---
  // A side can be marked "exposed/finished" (typical for an end-of-run cabinet):
  // it's cut from visible 'face' stock instead of hidden carcass ply. With no
  // exposed side this stays one qty-2 carcass Part (unchanged); each finished
  // side splits off into its own 'face' Part so the cut list/cost are right.
  const exposed = ctx.exposedSides;
  const leftFin = exposed.includes('left');
  const rightFin = exposed.includes('right');
  const finCount = (leftFin ? 1 : 0) + (rightFin ? 1 : 0);
  const carcassCount = 2 - finCount;
  const faceMat = materialFor(ctx, 'face');
  const faceColor = colorFor(ctx, 'face');
  const faceTex = textureFor(ctx, 'face');
  if (carcassCount > 0) panel(id('SIDE'), 'Side panel', 'carcass', carcassMat, t, D, Hc, carcassCount, ['right'], ['pocket', 'dowel']);
  if (finCount > 0) panel(id('SIDE-FIN'), 'Finished side panel', 'face', faceMat, t, D, Hc, finCount, ['right'], ['pocket', 'dowel']);
  // left side x∈[0,t], right side x∈[W-t,W]; each node carries its own side's material.
  const sideNode = (x: number, fin: boolean) =>
    f.node({
      pos: [x, Hc / 2, D / 2], size: [t, Hc, D],
      color: fin ? faceColor : carcassColor, textureUrl: fin ? faceTex : carcassTex,
      kind: 'panel', partId: fin ? id('SIDE-FIN') : id('SIDE'),
    });
  sideNode(t / 2, leftFin);
  sideNode(W - t / 2, rightFin);

  // --- Bottom (between sides, full depth so it captures the back) ---
  // Full depth: the bottom runs all the way to the wall, so the inset back rests
  // on its rear edge (and the top tucks over the back). Set-back panels would only
  // butt the back edge-on, leaving it captured by the sides alone.
  const innerW = W - 2 * t;
  const bottomD = D;
  panel(id('BOT'), 'Bottom', 'carcass', carcassMat, t, innerW, bottomD, 1, ['top'], ['pocket']);
  f.node({ pos: [W / 2, t / 2, bottomD / 2], size: [innerW, t, bottomD], color: carcassColor, textureUrl: carcassTex, kind: 'panel', partId: id('BOT') });

  // --- Top: stretchers (base) or full panel (upper/tall) ---
  if (c.topStyle === 'stretchers') {
    const sw = c.stretcherWidthIn;
    panel(id('STR'), 'Top stretcher', 'carcass', carcassMat, t, innerW, sw, 2, [], ['pocket']);
    // front stretcher near the opening, back stretcher against the wall (over the back)
    f.node({ pos: [W / 2, Hc - t / 2, D - sw / 2], size: [innerW, t, sw], color: carcassColor, textureUrl: carcassTex, kind: 'panel', partId: id('STR') });
    f.node({ pos: [W / 2, Hc - t / 2, sw / 2], size: [innerW, t, sw], color: carcassColor, textureUrl: carcassTex, kind: 'panel', partId: id('STR') });
  } else {
    panel(id('TOP'), 'Top', 'carcass', carcassMat, t, innerW, bottomD, 1, ['top'], ['pocket']);
    f.node({ pos: [W / 2, Hc - t / 2, bottomD / 2], size: [innerW, t, bottomD], color: carcassColor, textureUrl: carcassTex, kind: 'panel', partId: id('TOP') });
  }

  // --- Back: a full inset panel, or top+bottom hanging rails (saves ply) ---
  if (c.backStyle === 'rails') {
    const rw = BACK_RAIL_WIDTH;
    // Rails are hidden utility stock — let them rotate freely when nesting.
    f.add({
      id: id('BACK-RAIL'), label: 'Back hanging rail', role: 'back', materialId: backMat,
      thicknessIn: tb, wIn: innerW, lIn: rw, qty: 2, edgeBandEdges: [], joinery: ['pocket', 'screw'],
      grainLocked: false, notes: 'Hanging rail — screw through into the wall studs',
    });
    // Bottom rail just above the floor, top rail tucked under the top.
    f.node({ pos: [W / 2, t + rw / 2, tb / 2], size: [innerW, rw, tb], color: backColor, kind: 'back', partId: id('BACK-RAIL') });
    f.node({ pos: [W / 2, Hc - rw / 2, tb / 2], size: [innerW, rw, tb], color: backColor, kind: 'back', partId: id('BACK-RAIL') });
  } else {
    // Captured between the bottom and top panels: rests on the bottom, tucks under the top.
    const backH = Hc - 2 * t;
    panel(id('BACK'), 'Back', 'back', backMat, tb, innerW, backH, 1, [], ['pocket', 'screw']);
    f.node({ pos: [W / 2, t + backH / 2, tb / 2], size: [innerW, backH, tb], color: backColor, kind: 'back', partId: id('BACK') });
  }

  // --- Legs (levelers; viz only). Front legs sit BEHIND the toekick. ---
  if (ctx.hasLegs && ctx.legHeightIn > 0) {
    const lh = ctx.legHeightIn;
    const inset = 3;
    const xs = W > 36 ? [inset, W / 2, W - inset] : [inset, W - inset];
    const frontZ = D - TOEKICK_RECESS - 1; // tuck behind the recessed toekick
    const zs = [inset, frontZ];
    for (const x of xs) {
      for (const z of zs) {
        f.node({ pos: [x, -lh / 2, z], size: [2, lh, 2], color: '#2b2b2e', kind: 'leg' });
      }
    }
  }
}
