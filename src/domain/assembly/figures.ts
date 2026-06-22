import type { Cabinet, Construction, Node3D, Part, ProjectDefaults, RunKind } from '../types';
import { BACK_RAIL_WIDTH, BOTTOM_GROOVE_UP, MM_PER_INCH, REVEAL, STRETCHER_WIDTH, WORKBENCH_DRAWER_BANK_H, workbenchDrawerCount } from '../constants';
import type { WallElement } from '../types';
import { resolveConstruction } from '../geometry/context';
import { layoutFronts, singleFaceWidth, doubleDoorLeafWidth, type FrontLayoutItem } from '../geometry/fronts';
import { hingePlan } from '../geometry/doors';
import { GROOVE_DEPTH, drawerPanels, resolveSlideLength, drawerBoxHeight, slideClearance } from '../geometry/drawerBox';
import { getFrontType } from '../plugins/registry';
import { toFraction } from '../format';

/**
 * Classify a front type for the figure generator. Built-ins resolve by id;
 * plugin front types are bucketed by their `opens` hint (a drawer-like front,
 * e.g. the gridfinity drawer, opens === 'drawer'), so figures reference the
 * right part-id scheme (DR… vs DOOR…) instead of mislabelling them as doors.
 */
function figureClass(type: string): 'drawer' | 'door' | 'fixed' | 'falseFront' {
  if (type === 'drawer' || type === 'door' || type === 'fixed' || type === 'falseFront') return type;
  const def = getFrontType(type);
  return def?.opens === 'drawer' ? 'drawer' : 'door';
}

/**
 * Dimensioned assembly drawings, derived as pure data so they can be unit-tested
 * and rendered by a dumb SVG component. Every figure lives in its own inch
 * coordinate space with y running DOWN (like the cut-list sheet diagram) so it
 * maps straight onto an SVG viewBox. All sizes come from the same geometry
 * helpers the cut list and steps use, so a drawing can never disagree with them.
 */

export type FigPhase = 'carcass' | 'boxes' | 'doors' | 'faces' | 'hardware';

export interface FigBox {
  x: number; y: number; w: number; h: number;
  /** `dado` = routed channel (hatched); `land` = where a mating part sits (dashed outline). */
  cls: 'carcass' | 'face-door' | 'face-drawer' | 'interior' | 'counter' | 'leg' | 'dado' | 'land';
  partId?: string;
  /** Short centred caption (e.g. a face's W × H). */
  label?: string;
}

/** A dimension line with end ticks and a label. Horizontal or vertical only. */
export interface FigDim {
  from: [number, number];
  to: [number, number];
  text: string;
  /** Reveal/gap callouts render smaller. */
  small?: boolean;
  /** Place a horizontal label below its line instead of above (avoids overlap). */
  below?: boolean;
}

/** A bored hole marker — a euro hinge cup, a 5mm shelf pin, or a hinge mounting plate. */
export interface FigHole {
  cx: number; cy: number;
  dIn: number;
  kind: 'cup' | 'pin' | 'plate';
  note?: string;
}

/**
 * A numbered callout: a small marker at a feature point whose full text renders
 * in an HTML legend below the drawing (never as floating SVG text, so long
 * notes can't overflow or collide).
 */
export interface FigLeader {
  at: [number, number];
  text: string;
}

/** A 3D measurement line (cabinet-local inches) with a mid-label. */
export interface Dim3D { from: [number, number, number]; to: [number, number, number]; text: string }
/** A 3D callout note anchored at a point on a part. */
export interface Note3D { at: [number, number, number]; text: string }
export interface Annotations3D { dims: Dim3D[]; notes: Note3D[] }

export interface AssemblyFigure {
  id: string;
  kind: 'carcass' | 'faceMap' | 'drawerBox' | 'hingeBore' | 'frame' | 'gable';
  phase: FigPhase;
  title: string;
  /** viewBox in inches (already padded to fit labels). */
  view: { x: number; y: number; w: number; h: number };
  boxes: FigBox[];
  dims: FigDim[];
  holes?: FigHole[];
  leaders?: FigLeader[];
  partIds?: string[];
  /** Cabinet-local 3D panels for an interactive exploded view (drawer boxes). */
  model?: Node3D[];
  /** Dimension/joinery callouts for the 3D model (drawn at assembled positions). */
  annotations?: Annotations3D;
  /** Offer the "Exploded view" toggle for this model (multi-panel assemblies only). */
  explodable?: boolean;
}

// --- small builders -------------------------------------------------------

const hd = (x1: number, x2: number, y: number, text: string, small = false): FigDim => ({ from: [x1, y], to: [x2, y], text, small });
const vd = (y1: number, y2: number, x: number, text: string, small = false): FigDim => ({ from: [x, y1], to: [x, y2], text, small });

interface Els { boxes: FigBox[]; dims: FigDim[]; holes: FigHole[]; leaders: FigLeader[] }

/** Compute a padded viewBox enclosing every element. */
function frame(e: Els, pad: number): AssemblyFigure['view'] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pt = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const b of e.boxes) { pt(b.x, b.y); pt(b.x + b.w, b.y + b.h); }
  for (const d of e.dims) { pt(d.from[0], d.from[1]); pt(d.to[0], d.to[1]); }
  for (const h of e.holes) { pt(h.cx - h.dIn / 2, h.cy - h.dIn / 2); pt(h.cx + h.dIn / 2, h.cy + h.dIn / 2); }
  for (const l of e.leaders) pt(l.at[0], l.at[1]);
  if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
  return { x: minX - pad, y: minY - pad, w: (maxX - minX) + 2 * pad, h: (maxY - minY) + 2 * pad };
}

// --- figures --------------------------------------------------------------

interface DrawerGeom { innerW: number; boxOuterW: number; interiorW: number; fbW: number; slideLen: number; boxH: number; dado: number; clr: number; td: number; tbottom: number }

/** 5mm shelf-pin system: rows this far in from the gable's front/back edges, 32mm o.c. */
const PIN_ROW_INSET = 2.5;
const PIN_SPACING = 32 / MM_PER_INCH;
const PIN_D = 5 / MM_PER_INCH;
/** Euro hinge mounting-plate screw line, centred this far off the gable's front edge. */
const PLATE_SETBACK = 37 / MM_PER_INCH;

/**
 * Drawer machining drawing: the side panel and the front/back panel face-on,
 * with the routed work shaded — end dados the front/back seat into, and the
 * bottom groove that runs inside all four panels. Rout everything flat, before
 * any glue-up; the dimensions match the routing step's text exactly.
 */
function drawerMachiningFigure(id: string, title: string, partIds: string[], g: DrawerGeom, grooveUp: number): AssemblyFigure {
  const { slideLen, boxH, td, dado, fbW, tbottom } = g;
  const gap = Math.max(3, slideLen * 0.14);
  const fx = slideLen + gap; // front/back panel x-offset
  const o = Math.max(fx + fbW, boxH) * 0.07;
  const gy = boxH - grooveUp - tbottom; // groove band top edge (svg y-down)

  const boxes: FigBox[] = [
    { x: 0, y: 0, w: slideLen, h: boxH, cls: 'carcass', partId: partIds[0], label: `${partIds[0]} ×2` },
    // End dados (depth `dado`, width = drawer stock), `dado` in from each end.
    { x: dado, y: 0, w: td, h: boxH, cls: 'dado' },
    { x: slideLen - dado - td, y: 0, w: td, h: boxH, cls: 'dado' },
    // Bottom groove along the full length.
    { x: 0, y: gy, w: slideLen, h: tbottom, cls: 'dado' },
    { x: fx, y: 0, w: fbW, h: boxH, cls: 'carcass', partId: partIds[1], label: `${partIds[1]} ×2` },
    { x: fx, y: gy, w: fbW, h: tbottom, cls: 'dado' },
  ];
  const dims: FigDim[] = [
    hd(0, slideLen, -o, toFraction(slideLen)),
    vd(0, boxH, -o, toFraction(boxH)),
    hd(fx, fx + fbW, -o, toFraction(fbW)),
    vd(gy + tbottom, boxH, fx - gap / 2, `${toFraction(grooveUp)} up`, true),
    hd(0, dado + td, boxH + o, `${toFraction(dado)} + ${toFraction(td)}`, true),
  ];
  const leaders: FigLeader[] = [
    { at: [dado + td / 2, boxH * 0.2], text: `${toFraction(dado)}-deep dado, ${toFraction(dado)} from each end — front/back seat in them` },
    { at: [slideLen * 0.62, gy + tbottom / 2], text: `${toFraction(GROOVE_DEPTH)}-deep × ${toFraction(tbottom)} groove for the bottom — inside face, all four panels` },
  ];
  const els = { boxes, dims, holes: [] as FigHole[], leaders };
  return { id, kind: 'drawerBox', phase: 'boxes', title, view: frame(els, o * 2), ...els, partIds };
}

/**
 * Door boring drawing: the leaf face-on with one Ø35mm cup per hinge on the
 * hinge edge — cup centres dimensioned off the bottom (leader per cup) and the
 * 22.5mm edge inset dimensioned along the top.
 */
function hingeBoreFigure(C: string, doorNo: number, faceW: number, faceH: number, leaves: 1 | 2): AssemblyFigure {
  const hp = hingePlan(faceH);
  const cupEdge = hp.cupEdgeMm / MM_PER_INCH;
  const cupD = hp.cupDiameterMm / MM_PER_INCH;
  const o = Math.max(faceW, faceH) * 0.08;
  const partId = `${C}-DOOR${doorNo}`;

  const boxes: FigBox[] = [{ x: 0, y: 0, w: faceW, h: faceH, cls: 'face-door', partId, label: partId }];
  const holes: FigHole[] = hp.positionsIn.map((pos) => ({
    cx: cupEdge, cy: faceH - pos, dIn: cupD, kind: 'cup', note: `cup centre ${toFraction(pos)} from bottom`,
  }));
  // Markers sit beside the cups (not on them) so the Ø35 circles stay visible.
  // The first callout carries the full boring spec; the rest just their height.
  const leaders: FigLeader[] = hp.positionsIn.map((pos, i) => ({
    at: [cupEdge + cupD * 1.3, faceH - pos],
    text: i === 0
      ? `Ø35mm cup, centre ${toFraction(pos)} up from the bottom. The ${hp.cupEdgeMm}mm dim (top) is the cup centre's inset from the hinge edge — leaving a normal ~3/16" rim.`
      : `Ø35mm cup, centre ${toFraction(pos)} up from the bottom`,
  }));
  const dims: FigDim[] = [
    hd(0, faceW, faceH + o, toFraction(faceW)),
    vd(0, faceH, faceW + o, toFraction(faceH)),
    hd(0, cupEdge, -o * 0.6, `${hp.cupEdgeMm}mm`, true),
  ];
  dims[0].below = true;
  const els = { boxes, dims, holes, leaders };
  const title = `Door ${doorNo} hinge boring — ${hp.count}× Ø35mm${leaves === 2 ? ' per leaf' : ''}, hinge edge left`;
  return { id: `${C}-door${doorNo}`, kind: 'hingeBore', phase: 'doors', title, view: frame(els, o * 2), ...els, partIds: [partId] };
}

/**
 * Gable (side panel) drilling & joinery drawing, face-on at the panel's INSIDE
 * face. One drawing per gable: the left gable shows its front edge on the
 * right; the right gable is the mirror. Dashed "lands" show where the
 * back/bottom/top members sit; shelf-pin rows are bored on both gables, but
 * euro hinge mounting plates land only on the gable each door hinges on.
 */
function gableFigure(C: string, c: Required<Construction>, D: number, Hc: number, items: FrontLayoutItem[], side: 'left' | 'right', finished: boolean): AssemblyFigure {
  const t = c.carcassThicknessIn;
  const tb = c.backThicknessIn;
  const y = (yUp: number) => Hc - yUp; // carcass y-up → svg y-down
  // Mirror helpers: x runs back(0)→front(D) on the left gable, flipped on the right.
  const px = (x: number) => (side === 'left' ? x : D - x);
  const span = (x: number, w: number) => (side === 'left' ? x : D - x - w);
  const o = Math.max(D, Hc) * 0.08;
  // An exposed/finished end is cut from face stock, so it's a different part id.
  const sidePartId = finished ? `${C}-SIDE-FIN` : `${C}-SIDE`;

  const boxes: FigBox[] = [{ x: 0, y: 0, w: D, h: Hc, cls: 'carcass', partId: sidePartId, label: sidePartId }];
  const dims: FigDim[] = [hd(0, D, -o, toFraction(D)), vd(0, Hc, -o, toFraction(Hc))];
  const holes: FigHole[] = [];
  const leaders: FigLeader[] = [];

  // Back: a full inset panel land, or the two hanging-rail lands.
  if (c.backStyle === 'rails') {
    boxes.push({ x: span(0, tb), y: 0, w: tb, h: BACK_RAIL_WIDTH, cls: 'land' });
    boxes.push({ x: span(0, tb), y: y(t + BACK_RAIL_WIDTH), w: tb, h: BACK_RAIL_WIDTH, cls: 'land' });
    leaders.push({ at: [px(tb / 2), BACK_RAIL_WIDTH / 2], text: `back rails (${toFraction(tb)}) land on the rear edge — pocket/screw` });
  } else {
    boxes.push({ x: span(0, tb), y: 0, w: tb, h: Hc - t, cls: 'land' });
    leaders.push({ at: [px(tb / 2), (Hc - t) * 0.3], text: `back (${toFraction(tb)}) lands on the rear edge — screw line` });
  }
  // Bottom land across the foot of the gable.
  boxes.push({ x: span(tb, D - tb), y: Hc - t, w: D - tb, h: t, cls: 'land' });
  leaders.push({ at: [D * 0.5, Hc - t / 2], text: 'bottom lands here — pocket screws' });
  // Top: stretchers (base) or a full top land.
  if (c.topStyle === 'stretchers') {
    const sw = c.stretcherWidthIn;
    boxes.push({ x: span(D - sw, sw), y: 0, w: sw, h: t, cls: 'land' });
    boxes.push({ x: span(tb, sw), y: 0, w: sw, h: t, cls: 'land' });
    leaders.push({ at: [px(D - sw / 2), t / 2], text: 'stretchers land at the top — pocket screws' });
  } else {
    boxes.push({ x: span(tb, D - tb), y: 0, w: D - tb, h: t, cls: 'land' });
    leaders.push({ at: [D * 0.5, t / 2], text: 'top lands here — pocket screws' });
  }

  // Shelf-pin rows: two columns per shelf-hosting opening, 32mm o.c., kept 2"
  // clear of the opening's ends. Exact shelf height is up to the pins.
  let notedPins = false;
  let notedPlates = false;
  for (const it of items) {
    const cls = figureClass(it.opening.type);
    const shelves = (cls === 'door' || cls === 'fixed') ? (it.opening.shelves ?? 0) : 0;
    if (shelves > 0) {
      const lo = it.bottomY + 2;
      const hi = it.topY - 2;
      for (const col of [tb + PIN_ROW_INSET, D - PIN_ROW_INSET]) {
        for (let p = lo; p <= hi + 1e-6; p += PIN_SPACING) holes.push({ cx: px(col), cy: y(p), dIn: PIN_D, kind: 'pin', note: '5mm shelf pin' });
      }
      if (!notedPins) {
        notedPins = true;
        leaders.push({ at: [px(D - PIN_ROW_INSET), y(hi)], text: `5mm shelf-pin rows — ${toFraction(PIN_ROW_INSET)} off the front/back edges, 32mm between holes` });
        const x0 = span(D - PIN_ROW_INSET, PIN_ROW_INSET);
        dims.push(hd(x0, x0 + PIN_ROW_INSET, y(hi) - o * 0.15, toFraction(PIN_ROW_INSET), true));
      }
    }
    // Plates land on the gable the door hinges on (a pair hinges on both).
    const leaves = it.opening.doorCount === 2 ? 2 : 1;
    const hingesHere = leaves === 2 || (it.opening.hingeSide ?? 'left') === side;
    if (cls === 'door' && hingesHere) {
      const hp = hingePlan(it.faceHeightIn);
      for (const pos of hp.positionsIn) {
        holes.push({ cx: px(D - PLATE_SETBACK), cy: y(it.bottomY + pos), dIn: 0.45, kind: 'plate', note: `hinge plate — centre ${toFraction(it.bottomY + pos)} from carcass bottom` });
      }
      if (!notedPlates) {
        notedPlates = true;
        const firstY = y(it.bottomY + hp.positionsIn[0]);
        leaders.push({ at: [px(D - PLATE_SETBACK), firstY], text: `hinge mounting plates — 37mm off the front edge, centres at ${hp.positionsIn.map((p) => toFraction(it.bottomY + p)).join(', ')} from the carcass bottom` });
      }
    }
  }

  const els = { boxes, dims, holes, leaders };
  return {
    id: `${C}-gable-${side}`, kind: 'gable', phase: 'carcass',
    title: `${side === 'left' ? 'Left' : 'Right'} gable ${sidePartId}${finished ? ' (finished end)' : ''} — inside face, front edge ${side === 'left' ? 'right' : 'left'}`,
    view: frame(els, o * 2), ...els, partIds: [sidePartId],
  };
}

/**
 * 2D machining drawings for one cabinet: the gable drilling/joinery sheet, a
 * per-drawer routing drawing (dados + grooves), and per-door hinge boring. The
 * overall carcass orientation is the interactive 3D figure; these carry the
 * shop-floor detail. Parallels `cabinetSteps` so `buildAssembly` calls both in
 * one loop.
 */
export function cabinetFigures(
  cab: Cabinet,
  slot: RunKind,
  index: number,
  widthIn: number,
  carcassHeight: number,
  defaults: ProjectDefaults,
  parts: Part[],
  exposedSides: ('left' | 'right')[] = [],
): AssemblyFigure[] {
  const C = `C${index}`;
  const c = resolveConstruction(cab, slot, undefined, defaults);
  const W = widthIn;
  const Hc = carcassHeight;
  // A fully-exposed cabinet has only `-SIDE-FIN`; match either for the depth.
  const side = parts.find((p) => p.id === `${C}-SIDE` || p.id === `${C}-SIDE-FIN`);
  const D = side?.wIn ?? (slot === 'upper' ? defaults.upperDepthIn : slot === 'tall' ? defaults.tallDepthIn : defaults.baseDepthIn);

  const figs: AssemblyFigure[] = [];

  const items = layoutFronts(cab.front, Hc);
  const clr = slideClearance(c.slideType);
  const innerW = W - 2 * c.carcassThicknessIn;

  // The gable sheets first: they're the panels every other member registers
  // against. One drawing per gable — hinge plates land only on their side.
  figs.push(gableFigure(C, c, D, Hc, items, 'left', exposedSides.includes('left')));
  figs.push(gableFigure(C, c, D, Hc, items, 'right', exposedSides.includes('right')));

  // Drawer boxes — collapse identical ones into a single "×N" figure.
  const groups = new Map<string, { g: DrawerGeom; nos: number[]; ids: string[] }>();
  let drawerNo = 0, doorNo = 0;
  for (const it of items) {
    if (figureClass(it.opening.type) === 'drawer') {
      drawerNo += 1;
      const slideLen = resolveSlideLength(D, it.opening.drawer?.slideLenIn);
      const boxH = drawerBoxHeight(it);
      const p = drawerPanels(W, c.carcassThicknessIn, slideLen, boxH, { joint: c.drawerJoint, slideType: c.slideType, drawerThicknessIn: c.drawerThicknessIn, dadoDepthIn: c.dadoDepthIn });
      const g: DrawerGeom = { innerW, boxOuterW: p.boxOuterWidthIn, interiorW: p.interiorWidthIn, fbW: p.fbWidthIn, slideLen, boxH, dado: c.dadoDepthIn, clr, td: c.drawerThicknessIn, tbottom: c.drawerBottomThicknessIn };
      const sig = `${g.boxOuterW}|${g.slideLen}|${g.boxH}`;
      const existing = groups.get(sig);
      if (existing) { existing.nos.push(drawerNo); existing.ids.push(`${C}-DR${drawerNo}-FACE`); }
      else groups.set(sig, { g, nos: [drawerNo], ids: [`${C}-DR${drawerNo}-SIDE`, `${C}-DR${drawerNo}-FB`, `${C}-DR${drawerNo}-BOT`] });
    } else if (it.opening.type === 'door') {
      doorNo += 1;
      const leaves: 1 | 2 = it.opening.doorCount === 2 ? 2 : 1;
      const faceW = leaves === 2 ? doubleDoorLeafWidth(W) : singleFaceWidth(W);
      figs.push(hingeBoreFigure(C, doorNo, faceW, it.faceHeightIn, leaves));
    }
  }
  for (const { g, nos, ids } of groups.values()) {
    const title = nos.length > 1 ? `Drawer box machining ×${nos.length}` : `Drawer ${nos[0]} box machining`;
    figs.push(drawerMachiningFigure(`${C}-drawer${nos[0]}`, title, ids, g, BOTTOM_GROOVE_UP));
  }
  return figs;
}

/** A workbench frame: the counter slab on legs, plus its under-top bracing
 *  (stretchers or a drawer bank). */
export function workbenchFigure(idBase: string, widthIn: number, counterUndersideY: number, counterT: number, support: WallElement['workbenchSupport'] = 'legs', drawerHeightIn?: number): AssemblyFigure[] {
  const W = widthIn;
  const legH = counterUndersideY;
  const totalH = legH + counterT;
  const S = Math.max(W, totalH);
  const o = S * 0.08;
  const legSection = 3;
  const inset = legSection / 2 + 0.5;
  const boxes: FigBox[] = [{ x: 0, y: 0, w: W, h: counterT, cls: 'counter' }];
  const partIds: string[] = [];
  // Legs on the free ends for every scheme except 'none' (carried by cabinets).
  // Bought adjustable poles, so they're drawn but carry no cut-part id to link.
  if (support !== 'none') {
    boxes.push({ x: inset - legSection / 2, y: counterT, w: legSection, h: legH, cls: 'leg' });
    boxes.push({ x: W - inset - legSection / 2, y: counterT, w: legSection, h: legH, cls: 'leg' });
    if (support === 'legs' && W > 60) boxes.push({ x: W / 2 - legSection / 2, y: counterT, w: legSection, h: legH, cls: 'leg' });
  }
  if (support === 'stretchers') {
    boxes.push({ x: inset, y: counterT, w: W - 2 * inset, h: STRETCHER_WIDTH, cls: 'carcass', partId: `${idBase}-STRETCHER` });
    partIds.push(`${idBase}-STRETCHER`);
  }
  if (support === 'drawer') {
    // A box hung under the top: bank-height ends + a row of drawer faces.
    const endT = 0.75;
    const bankH = Math.min(Math.max(drawerHeightIn ?? WORKBENCH_DRAWER_BANK_H, 2), legH - 1);
    const n = workbenchDrawerCount(W);
    const gap = REVEAL;
    const innerW = W - 2 * endT;
    const faceW = (innerW - (n + 1) * gap) / n;
    boxes.push({ x: 0, y: counterT, w: endT, h: bankH, cls: 'carcass', partId: `${idBase}-END` });
    boxes.push({ x: W - endT, y: counterT, w: endT, h: bankH, cls: 'carcass', partId: `${idBase}-END` });
    for (let i = 0; i < n; i++) boxes.push({ x: endT + gap + i * (faceW + gap), y: counterT, w: faceW, h: bankH - gap, cls: 'face-drawer', partId: `${idBase}-DFACE` });
    partIds.push(`${idBase}-END`, `${idBase}-DFACE`);
  }
  const dims: FigDim[] = [
    hd(0, W, -o, toFraction(W)),
    vd(0, totalH, -o, toFraction(totalH)),
    vd(counterT, totalH, W + o, `${toFraction(legH)} leg`, true),
  ];
  const els = { boxes, dims, holes: [], leaders: [] };
  return [{ id: `${idBase}-frame`, kind: 'frame', phase: 'carcass', title: 'Frame', view: frame(els, S * 0.16), ...els, partIds }];
}

/** A simple rough-opening rectangle for an appliance/fixture bay, plus any panels. */
export function applianceFigure(idBase: string, label: string, widthIn: number, heightIn: number, parts: Part[]): AssemblyFigure[] {
  const W = widthIn;
  const H = heightIn;
  const S = Math.max(W, H);
  const o = S * 0.08;
  const boxes: FigBox[] = [{ x: 0, y: 0, w: W, h: H, cls: 'interior' }];
  const dims: FigDim[] = [hd(0, W, -o, toFraction(W)), vd(0, H, -o, toFraction(H))];
  const els = { boxes, dims, holes: [], leaders: [] };
  void idBase;
  return [{ id: `${idBase}-frame`, kind: 'frame', phase: 'carcass', title: `${label} opening`, view: frame(els, S * 0.16), ...els, partIds: parts.map((p) => p.id) }];
}
