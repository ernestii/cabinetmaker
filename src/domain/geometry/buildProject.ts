import type { CabinetBuild, HardwareCounts, Material, Node3D, Part, Project, RunKind, Wall, WallElement } from '../types';
import { COUNTER_OVERHANG, REVEAL, STRETCHER_WIDTH, T_CARCASS, T_DRAWER, T_DRAWER_BOTTOM, TOEKICK_RECESS, WORKBENCH_DRAWER_BANK_H, workbenchDrawerCount } from '../constants';
import { drawerPanels, resolveSlideLength, type DrawerSpec } from './drawerBox';
import { shortId, toFraction } from '../format';
import { buildCabinet } from './buildCabinet';
import { wallMetrics, type WallMetrics } from './metrics';
import { elementVertical, effectiveWorkbenchSupport } from '../elements';
import { resolveExposedSides } from '../layout';
import { getFixture } from '../plugins/registry';
// Side effect: register built-in fixtures/front types/door styles before any build.
import '../plugins/builtin';

export interface BuiltScene {
  parts: Part[];
  nodes: Node3D[];
  hardware: HardwareCounts;
}

function offsetNode(n: Node3D, dx: number, dy: number, dz: number): Node3D {
  const out: Node3D = { ...n, pos: [n.pos[0] + dx, n.pos[1] + dy, n.pos[2] + dz] };
  // A door's hinge point rides along with the node so it stays a valid pivot.
  if (n.open?.pivot) {
    out.open = { ...n.open, pivot: [n.open.pivot[0] + dx, n.open.pivot[1] + dy, n.open.pivot[2] + dz] };
  }
  return out;
}

/**
 * Place a wall-frame node into the room: rotate its (x along wall, z depth)
 * footprint by the wall heading and translate to the wall's origin. The box
 * carries the same Y-rotation so the viewer renders it square to its wall.
 */
function transformNode(n: Node3D, ox: number, oz: number, heading: number): Node3D {
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const place = ([x, y, z]: [number, number, number]): [number, number, number] => [
    ox + x * ch - z * sh,
    y,
    oz + x * sh + z * ch,
  ];
  const out: Node3D = { ...n, pos: place(n.pos), rotY: (n.rotY ?? 0) - heading };
  // The hinge point lives in the same frame as pos, so rotate it the same way.
  if (n.open?.pivot) out.open = { ...n.open, pivot: place(n.open.pivot) };
  return out;
}

function materialMaps(materials: Material[]) {
  const idByRole: Record<string, string> = {};
  const colorByRole: Record<string, string> = {};
  const textureByRole: Record<string, string | undefined> = {};
  const thicknessByRole: Record<string, number> = {};
  for (const m of materials) {
    for (const role of m.roles ?? []) {
      if (!(role in idByRole)) {
        idByRole[role] = m.id;
        colorByRole[role] = m.color;
        textureByRole[role] = m.textureUrl;
        thicknessByRole[role] = m.thicknessIn;
      }
    }
  }
  return { idByRole, colorByRole, textureByRole, thicknessByRole };
}

/**
 * Build ONE cabinet's geometry (cabinet-local coords) with the project's
 * material maps + construction defaults. Single source of the per-cabinet
 * `BuildCabinetParams` derivation, shared by the room scene (`place`, which then
 * offsets the nodes into world space) and the Assembly page (which renders the
 * local nodes directly). Keeping it in one place stops the two paths drifting.
 */
export function buildCabinetFor(
  project: Project,
  cab: NonNullable<WallElement['cabinet']>,
  slot: RunKind,
  widthIn: number,
  depthDefault: number,
  carcassHeightIn: number,
  legH: number,
  hasLegs: boolean,
  index: number,
  exposedSides: ('left' | 'right')[] = [],
): CabinetBuild {
  const maps = materialMaps(project.materials);
  return buildCabinet(
    { ...cab, widthIn },
    {
      index, runKind: slot, depthIn: cab.depthOverrideIn ?? depthDefault, carcassHeightIn,
      legHeightIn: hasLegs ? legH : 0, hasLegs,
      materialIdByRole: maps.idByRole, colorByRole: maps.colorByRole, textureByRole: maps.textureByRole,
      thicknessByRole: maps.thicknessByRole, defaults: project.defaults, exposedSides,
    },
  );
}

function counterDepthOf(project: Project, carcassDepthIn: number): number {
  return project.defaults.counterDepthIn ?? carcassDepthIn + COUNTER_OVERHANG;
}

function emitCounter(out: BuiltScene, project: Project, idBase: string, startX: number, width: number, depth: number, undersideY: number) {
  const mat = project.materials.find((m) => m.roles?.includes('counter'));
  const t = project.defaults.counterThicknessIn;
  out.parts.push({
    id: `${idBase}-COUNTER`, label: 'Countertop', role: 'counter', cabinetId: idBase, materialId: mat?.id ?? 'counter',
    thicknessIn: t, wIn: depth, lIn: width, qty: 1, edgeBandEdges: [], joinery: [], grainLocked: false,
    notes: 'Slab — cut to length, not from plywood',
  });
  out.nodes.push({
    pos: [startX + width / 2, undersideY + t / 2, depth / 2], size: [width, t, depth],
    color: mat?.color ?? '#3a3a3a', textureUrl: mat?.textureUrl, kind: 'counter', partId: `${idBase}-COUNTER`,
  });
}

/**
 * Break a toekick run into pieces no longer than the stock allows, breaking at
 * cabinet joins so the seams hide behind a leg/divider. A single segment wider
 * than the stock is divided into equal sub-pieces as a fallback.
 */
function splitToekick(segments: number[], maxLen: number): number[] {
  const pieces: number[] = [];
  let cur = 0;
  const flush = () => { if (cur > 1e-6) pieces.push(cur); cur = 0; };
  for (const seg of segments) {
    if (seg > maxLen + 1e-6) {
      flush();
      const n = Math.ceil(seg / maxLen);
      for (let i = 0; i < n; i++) pieces.push(seg / n);
      continue;
    }
    if (cur + seg > maxLen + 1e-6) flush();
    cur += seg;
  }
  flush();
  return pieces;
}

function emitToekick(out: BuiltScene, project: Project, idBase: string, startX: number, depth: number, legH: number, segments: number[]) {
  const mat = project.materials.find((m) => m.roles?.includes('toekick')) ?? project.materials.find((m) => m.roles?.includes('carcass'));
  // A toekick is a long, narrow strip; the longest side it can have is the
  // larger *usable* sheet dimension (after the edge trim). Split so every piece
  // still nests — otherwise a full-length run reads as oversize.
  const maxLen = mat ? Math.max(mat.sheetW, mat.sheetH) - 2 * (mat.edgeTrimIn ?? 0) : Infinity;
  const pieces = splitToekick(segments, maxLen);
  const z = depth - TOEKICK_RECESS - 0.375;
  let cx = startX;
  pieces.forEach((len, i) => {
    const suffix = pieces.length > 1 ? `-${i + 1}` : '';
    out.parts.push({
      id: `${idBase}-TOEKICK${suffix}`, label: pieces.length > 1 ? `Toekick (${i + 1}/${pieces.length})` : 'Toekick',
      role: 'toekick', cabinetId: idBase, materialId: mat?.id ?? 'toekick',
      thicknessIn: 0.75, wIn: legH, lIn: len, qty: 1, edgeBandEdges: ['top'], joinery: ['screw'], grainLocked: false,
      notes: pieces.length > 1 ? `Recessed ${TOEKICK_RECESS}"; butt-join at cabinet seam; clips to legs` : `Recessed ${TOEKICK_RECESS}" from face; clips to legs`,
    });
    out.nodes.push({
      pos: [cx + len / 2, legH / 2, z], size: [len, legH, 0.75],
      color: mat?.color ?? '#222', kind: 'toekick', partId: `${idBase}-TOEKICK${suffix}`,
    });
    cx += len;
  });
}

const LEG_SECTION = 3;

/** A base/tall cabinet a workbench top can lean on (so it skips a leg on that side). */
function baseSupportAt(els: WallElement[], xEdge: number): boolean {
  return els.some(
    (e) => !!e.cabinet && (e.zone === 'base' || e.zone === 'tall') &&
      (Math.abs(e.xIn - xEdge) < 1e-6 || Math.abs(e.xIn + e.widthIn - xEdge) < 1e-6),
  );
}

/** Workbench legs (the countertop is emitted by the merged-counter pass). */
function buildWorkbenchFrame(el: WallElement, project: Project, out: BuiltScene, undersideY: number, supportedLeft: boolean, supportedRight: boolean) {
  const d = project.defaults;
  // A workbench lives in the base band, so it matches the base-cabinet depth by
  // default (the cabinets it sits beside), not the tall depth.
  const depthIn = el.depthOverrideIn ?? d.baseDepthIn;
  const x0 = el.xIn;
  const width = el.widthIn;
  if (width <= 0) return;
  const carcassMat = project.materials.find((m) => m.roles?.includes('carcass'));
  const matId = carcassMat?.id ?? 'carcass';
  const legColor = carcassMat?.color ?? '#caa472';
  const id = (s: string) => `WB${shortId(el.id)}-${s}`;
  const legTop = undersideY;
  const inset = LEG_SECTION / 2 + 0.5;
  const legZs = [inset, depthIn - inset];

  // Non-legs schemes lean on the cabinets the bench abuts; without one on both
  // sides they fall back to legs (a free-standing table).
  const support = effectiveWorkbenchSupport(el.workbenchSupport, supportedLeft, supportedRight);

  // Legs on free ends (a side abutting a cabinet hangs off that cabinet) — every
  // scheme stands on these, except 'none' (fully carried by the cabinets it's
  // screwed to). The drawer box hangs under the counter and the legs carry it
  // where there's no neighbour to screw to.
  const legXs: number[] = [];
  if (support !== 'none') {
    if (!supportedLeft) legXs.push(x0 + inset);
    if (!supportedRight) legXs.push(x0 + width - inset);
    // Centre leg for a wide bench — only in the plain-legs scheme; stretchers and
    // the drawer box brace the span themselves.
    if (width > 60 && support === 'legs') legXs.push(x0 + width / 2);
  }

  for (const lx of legXs) for (const lz of legZs) {
    out.nodes.push({ pos: [lx, legTop / 2, lz], size: [LEG_SECTION, legTop, LEG_SECTION], color: legColor, kind: 'leg' });
  }
  // Legs are a bought adjustable pole (IKEA-style), not a fabricated part — tally
  // them as hardware for the shopping list rather than emitting a cut part.
  out.hardware.legs += legXs.length * legZs.length;

  // Apron stretchers: front + back rails on edge just under the top, tying the
  // legs together against racking (the "reinforced" bench). They run the full
  // clear span, extending to an abutting cabinet on a supported side so they can
  // be screwed into it.
  if (support === 'stretchers') {
    const sLeft = supportedLeft ? x0 : x0 + inset;
    const sRight = supportedRight ? x0 + width : x0 + width - inset;
    const railLen = sRight - sLeft;
    const railY = legTop - STRETCHER_WIDTH / 2 - 0.25;
    for (const lz of legZs) {
      out.nodes.push({ pos: [(sLeft + sRight) / 2, railY, lz], size: [railLen, STRETCHER_WIDTH, 0.75], color: legColor, kind: 'panel' });
    }
    const abuts = supportedLeft || supportedRight;
    out.parts.push({
      id: id('STRETCHER'), label: 'Workbench stretcher', role: 'carcass', cabinetId: el.id, materialId: matId,
      thicknessIn: 0.75, wIn: STRETCHER_WIDTH, lIn: railLen, qty: 2, edgeBandEdges: ['top'],
      joinery: ['dowel', 'screw'], grainLocked: false,
      notes: `Apron rail front & back — ties the legs together against racking${abuts ? '; runs into the adjacent cabinet for screwing' : ''}`,
    });
  }

  // Drawer bank: a row of real drawers under the worktop, carried on full-height
  // end panels (no separate legs). The drawer count scales with width; the bank
  // height is configurable. Each drawer gets a full box + a slide pair.
  if (support === 'drawer') {
    emitWorkbenchDrawers(el, project, out, { depthIn, x0, width, legTop, matId, legColor, id, supportedLeft, supportedRight });
  }
}

interface WbDrawerCtx {
  depthIn: number; x0: number; width: number; legTop: number; matId: string; legColor: string;
  id: (s: string) => string; supportedLeft: boolean; supportedRight: boolean;
}

function emitWorkbenchDrawers(el: WallElement, project: Project, out: BuiltScene, c: WbDrawerCtx) {
  const { depthIn, x0, width, legTop, matId, legColor, id, supportedLeft, supportedRight } = c;
  const d = project.defaults;
  const n = workbenchDrawerCount(width);
  const bankH = Math.min(Math.max(el.workbenchDrawerHeightIn ?? WORKBENCH_DRAWER_BANK_H, 2), legTop - 1);
  const faceMat = project.materials.find((m) => m.roles?.includes('face'));
  const faceMatId = faceMat?.id ?? 'face';
  const faceColor = faceMat?.color ?? '#b9824a';
  const faceTex = faceMat?.textureUrl; // wood grain etc. — so the faces aren't flat colour
  const carcassMat = project.materials.find((m) => m.roles?.includes('carcass'));
  const boxTex = carcassMat?.textureUrl;
  const drawerMat = project.materials.find((m) => m.roles?.includes('drawer')) ?? carcassMat;
  const drawerColor = drawerMat?.color ?? legColor;
  const drawerTex = drawerMat?.textureUrl;
  const endT = T_CARCASS;
  const divT = T_CARCASS;
  const gap = REVEAL;
  const bankCY = legTop - bankH / 2;

  // A self-contained drawer BOX hung under the worktop — its own sides/top/
  // bottom/back, screwed up to the counter. Carried by the legs/cabinets above.
  void supportedLeft; void supportedRight;
  const cx0 = x0 + width / 2;
  const bankBotY = legTop - bankH;
  const innerW = width - 2 * endT; // between the two box sides
  if (innerW <= 0) return;

  // Box carcass: sides (bank-height), a top screwed to the counter, a bottom, a back.
  const panel = (pos: [number, number, number], size: [number, number, number]) =>
    out.nodes.push({ pos, size, color: legColor, textureUrl: boxTex, kind: 'panel' });
  panel([x0 + endT / 2, bankCY, depthIn / 2], [endT, bankH, depthIn]);
  panel([x0 + width - endT / 2, bankCY, depthIn / 2], [endT, bankH, depthIn]);
  panel([cx0, legTop - 0.375, depthIn / 2], [innerW, 0.75, depthIn]);
  panel([cx0, bankBotY + 0.375, depthIn / 2], [innerW, 0.75, depthIn]);
  out.nodes.push({ pos: [cx0, bankCY, 0.5], size: [innerW, bankH, 0.5], color: legColor, textureUrl: boxTex, kind: 'back' });
  out.parts.push({ id: id('END'), label: 'Drawer-box side', role: 'carcass', cabinetId: el.id, materialId: matId, thicknessIn: endT, wIn: depthIn, lIn: bankH, qty: 2, edgeBandEdges: ['top'], joinery: ['dado', 'screw'], grainLocked: false, notes: 'Drawer-box side' });
  out.parts.push({ id: id('BOX-TOP'), label: 'Drawer-box top', role: 'carcass', cabinetId: el.id, materialId: matId, thicknessIn: 0.75, wIn: depthIn, lIn: innerW, qty: 1, edgeBandEdges: [], joinery: ['dado', 'screw'], grainLocked: false, notes: 'Screws up into the worktop' });
  out.parts.push({ id: id('BOX-BOT'), label: 'Drawer-box bottom', role: 'carcass', cabinetId: el.id, materialId: matId, thicknessIn: 0.75, wIn: depthIn, lIn: innerW, qty: 1, edgeBandEdges: ['top'], joinery: ['dado', 'screw'], grainLocked: false });
  out.parts.push({ id: id('DBACK'), label: 'Drawer-box back', role: 'carcass', cabinetId: el.id, materialId: matId, thicknessIn: 0.5, wIn: bankH, lIn: innerW, qty: 1, edgeBandEdges: [], joinery: ['groove'], grainLocked: false });

  // Each drawer overlays an equal slice of the box front (full-overlay face),
  // with a real box behind it sized to fit its compartment.
  const faceH = bankH - gap;
  const faceW = (width - (n + 1) * gap) / n;          // n full-overlay faces across the box
  const spec: DrawerSpec = { joint: d.drawerJoint, slideType: d.slideType, drawerThicknessIn: T_DRAWER, dadoDepthIn: d.dadoDepthIn };
  const slideLen = resolveSlideLength(depthIn);
  const boxHeight = Math.max(2, faceH - 1);
  const panels = drawerPanels(faceW + 2 * divT, divT, slideLen, boxHeight, spec); // interior ≈ faceW
  const barW = Math.min(Math.max(faceW * 0.5, 4), 12);

  // Dividers in the reveals between faces.
  for (let i = 1; i < n; i++) {
    panel([x0 + gap + i * (faceW + gap) - gap / 2, bankCY, depthIn / 2], [divT, bankH, depthIn - 1]);
  }
  if (n > 1) {
    out.parts.push({ id: id('DDIV'), label: 'Drawer-box divider', role: 'carcass', cabinetId: el.id, materialId: matId, thicknessIn: divT, wIn: depthIn, lIn: bankH, qty: n - 1, edgeBandEdges: ['top'], joinery: ['dado', 'screw'], grainLocked: false });
  }

  out.parts.push({ id: id('DR-SIDE'), label: 'Drawer side', role: 'drawer', cabinetId: el.id, materialId: matId, thicknessIn: T_DRAWER, wIn: slideLen, lIn: boxHeight, qty: 2 * n, edgeBandEdges: [], joinery: spec.joint === 'dadoScrew' ? ['dado', 'screw'] : ['dado'], grainLocked: false });
  out.parts.push({ id: id('DR-FB'), label: 'Drawer front/back', role: 'drawer', cabinetId: el.id, materialId: matId, thicknessIn: T_DRAWER, wIn: panels.fbWidthIn, lIn: boxHeight, qty: 2 * n, edgeBandEdges: [], joinery: ['dado'], grainLocked: false });
  out.parts.push({ id: id('DR-BOT'), label: 'Drawer bottom', role: 'drawerBottom', cabinetId: el.id, materialId: matId, thicknessIn: T_DRAWER_BOTTOM, wIn: panels.bottomWidthIn, lIn: panels.bottomLengthIn, qty: n, edgeBandEdges: [], joinery: ['groove'], grainLocked: false });
  out.parts.push({ id: id('DFACE'), label: 'Workbench drawer face', role: 'face', cabinetId: el.id, materialId: faceMatId, thicknessIn: 0.75, wIn: faceW, lIn: faceH, qty: n, edgeBandEdges: ['top', 'bottom', 'left', 'right'], joinery: [], grainLocked: true, notes: `${n} drawer${n > 1 ? 's' : ''} on ${toFraction(slideLen)} slides` });

  out.hardware.slidePairs += n;
  out.hardware.pulls += n;

  // 3D: per drawer, a sliding box body + the overlay face (with grain) + a pull.
  for (let i = 0; i < n; i++) {
    const fx = x0 + gap + i * (faceW + gap) + faceW / 2;
    const openId = `${el.id}-wbdr${i}`;
    const open = { id: openId, kind: 'drawer' as const, travel: slideLen };
    out.nodes.push({ pos: [fx, bankCY, depthIn - slideLen / 2], size: [panels.boxOuterWidthIn, boxHeight, slideLen], color: drawerColor, textureUrl: drawerTex, kind: 'drawerBox', open });
    // Face sits flush with an adjacent cabinet's faces: front at depth + 0.75.
    out.nodes.push({ pos: [fx, bankCY, depthIn + 0.375], size: [faceW, faceH, 0.75], color: faceColor, textureUrl: faceTex, kind: 'face', open });
    out.nodes.push({ pos: [fx, bankCY + faceH / 2 - Math.min(1.5, faceH / 2), depthIn + 1.1], size: [barW, 0.5, 0.75], color: '#c7ccd3', kind: 'handle', open });
  }
}

/** Does the merged base countertop run over this element? */
function contributesCounter(el: WallElement): boolean {
  if (el.zone !== 'base') return false;
  // A fixture decides first: a break-fixture (slide-in range/fridge) interrupts
  // the counter even when integrated with a cabinet; a pass-fixture (dishwasher,
  // drop-in cooktop) keeps it running.
  if (el.fixtureId) {
    const def = getFixture(el.fixtureId);
    if (def?.countertop === 'break') return false;
    if (def?.zone === 'base' && def?.countertop === 'pass') return true;
  }
  if (el.cabinet) return true; // a plain base cabinet (incl. one with a drop-in cooktop)
  if (el.workbench) return true;
  return false;
}

/** Counter depth key for an element (drives where a span breaks on depth change). */
function counterDepthKey(el: WallElement, project: Project): number {
  const d = project.defaults;
  if (el.workbench) return counterDepthOf(project, el.depthOverrideIn ?? d.baseDepthIn);
  if (el.cabinet) return counterDepthOf(project, el.cabinet.depthOverrideIn ?? d.baseDepthIn);
  return counterDepthOf(project, d.baseDepthIn);
}

/** Does this element stand a base/tall carcass on legs (so it gets a toekick)? */
function hasToekick(el: WallElement): boolean {
  return !!el.cabinet && (el.zone === 'base' || el.zone === 'tall');
}

function toekickDepthKey(el: WallElement, project: Project): number {
  const d = project.defaults;
  return el.zone === 'tall' ? (el.cabinet?.depthOverrideIn ?? d.tallDepthIn) : d.baseDepthIn;
}

/**
 * Walk elements left→right, grouping contiguous ones that match the predicate
 * and share a key (depth), and emit one span each. Elements must be pre-sorted
 * by x; a gap between elements (or a non-matching one) breaks the span.
 */
function emitSpansX(
  els: WallElement[],
  predicate: (e: WallElement) => boolean,
  keyOf: (e: WallElement) => number,
  onSpan: (startX: number, width: number, key: number, idBase: string, segments: number[]) => void,
) {
  let startX = -1;
  let endX = 0;
  let width = 0;
  let key = NaN;
  let idBase = '';
  let segments: number[] = [];
  const flush = () => { if (startX >= 0) onSpan(startX, width, key, idBase, segments); startX = -1; width = 0; segments = []; };
  for (const el of els) {
    if (predicate(el)) {
      const k = keyOf(el);
      const contiguous = startX >= 0 && Math.abs(el.xIn - endX) < 1e-6 && Math.abs(k - key) < 1e-6;
      if (contiguous) {
        width += el.widthIn; segments.push(el.widthIn); endX = el.xIn + el.widthIn;
      } else {
        flush();
        startX = el.xIn; width = el.widthIn; key = k; idBase = `BAY${shortId(el.id)}`; segments = [el.widthIn]; endX = el.xIn + el.widthIn;
      }
    } else {
      flush();
    }
  }
  flush();
}

function buildWallScene(project: Project, wall: Wall, out: BuiltScene, startIndex: number): number {
  const d = project.defaults;
  const m: WallMetrics = wallMetrics(project, wall);
  const { legH } = m;
  const els = wall.elements ?? [];

  let index = startIndex;

  const place = (
    cab: NonNullable<WallElement['cabinet']>, slot: RunKind, x: number, width: number,
    depthDefault: number, carcassH: number, yBottom: number, hasLegs: boolean,
    exposedSides: ('left' | 'right')[],
  ) => {
    const build = buildCabinetFor(project, cab, slot, width, depthDefault, carcassH, legH, hasLegs, index, exposedSides);
    out.parts.push(...build.parts);
    for (const n of build.nodes) out.nodes.push(offsetNode(n, x, yBottom, 0));
    out.hardware.hinges += build.hardware.hinges;
    out.hardware.slidePairs += build.hardware.slidePairs;
    out.hardware.pulls += build.hardware.pulls;
    out.hardware.pushLatches += build.hardware.pushLatches;
    index += 1;
  };

  // 1) Per-element geometry: cabinets, integrated/standalone fixtures, workbenches.
  //    Element array order drives the cabinet index, so part ids stay stable.
  for (const el of els) {
    const v = elementVertical(el, wall, m, d);
    // Tag every node this element emits with its id (cabinet, workbench, fixture)
    // so the 3D view can highlight the current selection. Merged counter/toekick
    // spans below are deliberately left owner-less — they belong to no one bay.
    const start = out.nodes.length;
    if (el.cabinet) {
      place(el.cabinet, v.runKind, el.xIn, el.widthIn, v.depthDefault, v.carcassH, v.yBottom, v.hasLegs, resolveExposedSides(wall, el, d));
    }
    if (el.workbench) {
      buildWorkbenchFrame(el, project, out, m.counterUndersideY, baseSupportAt(els, el.xIn), baseSupportAt(els, el.xIn + el.widthIn));
    }
    if (el.fixtureId) {
      const def = getFixture(el.fixtureId);
      def?.place({
        element: el, project,
        add: (part) => out.parts.push(part),
        node: (n) => out.nodes.push(n),
        x0: el.xIn, widthIn: el.widthIn, config: el.fixture, metrics: m, idBase: `APP${shortId(el.id)}`,
      });
    }
    for (let i = start; i < out.nodes.length; i++) {
      if (!out.nodes[i].ownerId) out.nodes[i] = { ...out.nodes[i], ownerId: el.id };
    }
  }

  // 2) Merged countertop spans (consecutive base cabinets / pass-fixtures / workbenches
  //    of equal depth). Skipped entirely when countertops are turned off.
  if (d.countertopEnabled !== false) {
    const counterOccupiers = els
      .filter((e) => e.zone === 'base' || e.zone === 'tall')
      .sort((a, b) => a.xIn - b.xIn);
    emitSpansX(
      counterOccupiers,
      contributesCounter,
      (e) => counterDepthKey(e, project),
      (startX, width, depth, idBase) => emitCounter(out, project, idBase, startX, width, depth, m.counterUndersideY),
    );
  }

  // 3) Merged toekick spans (consecutive base/tall carcasses on legs).
  const toekickCabs = els.filter(hasToekick).sort((a, b) => a.xIn - b.xIn);
  emitSpansX(
    toekickCabs,
    () => true,
    (e) => toekickDepthKey(e, project),
    (startX, _width, depth, idBase, segments) => { if (legH > 0) emitToekick(out, project, idBase, startX, depth, legH, segments); },
  );

  return index;
}

const WALL_THICK = 4; // drywall slab behind the cabinets (viewer only)
const WALL_COLOR = '#dfe2e7'; // painted drywall white
const CEIL_COLOR = '#eceef1';

/** Build the entire project into world-space geometry. */
export function buildProject(project: Project): BuiltScene {
  const out: BuiltScene = { parts: [], nodes: [], hardware: { hinges: 0, slidePairs: 0, pulls: 0, pushLatches: 0, legs: 0 } };
  let index = 1;
  let maxCeiling = 0;
  for (const room of project.rooms) {
    // Walls connect end-to-end; turnDeg bends the run at each junction so the
    // chain traces the room outline (straight, L, U, …).
    let ox = 0;
    let oz = 0;
    let heading = 0;
    for (const wall of room.walls) {
      heading += ((wall.turnDeg ?? 0) * Math.PI) / 180;
      maxCeiling = Math.max(maxCeiling, wall.ceilingHeightIn);
      const local: BuiltScene = { parts: [], nodes: [], hardware: { hinges: 0, slidePairs: 0, pulls: 0, pushLatches: 0, legs: 0 } };
      index = buildWallScene(project, wall, local, index);
      // The wall surface (viewer decoration): a thin slab behind the run at z=0.
      local.nodes.push({ pos: [wall.lengthIn / 2, wall.ceilingHeightIn / 2, -WALL_THICK / 2], size: [wall.lengthIn, wall.ceilingHeightIn, WALL_THICK], color: wall.color ?? WALL_COLOR, kind: 'wall' });
      for (const n of local.nodes) out.nodes.push(transformNode(n, ox, oz, heading));
      out.parts.push(...local.parts);
      out.hardware.hinges += local.hardware.hinges;
      out.hardware.slidePairs += local.hardware.slidePairs;
      out.hardware.pulls += local.hardware.pulls;
      out.hardware.pushLatches += local.hardware.pushLatches;
      out.hardware.legs += local.hardware.legs;
      // Advance the origin to the end of this wall along its heading.
      ox += wall.lengthIn * Math.cos(heading);
      oz += wall.lengthIn * Math.sin(heading);
    }
  }

  // One ceiling slab over the room footprint (centroid-based bounds; approximate).
  if (out.nodes.length > 0 && maxCeiling > 0) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of out.nodes) {
      minX = Math.min(minX, n.pos[0]); maxX = Math.max(maxX, n.pos[0]);
      minZ = Math.min(minZ, n.pos[2]); maxZ = Math.max(maxZ, n.pos[2]);
    }
    const pad = 24;
    out.nodes.push({
      // Underside sits at the ceiling height, above all cabinetry.
      pos: [(minX + maxX) / 2, maxCeiling + WALL_THICK / 2, (minZ + maxZ) / 2],
      size: [maxX - minX + pad, WALL_THICK, maxZ - minZ + pad],
      color: CEIL_COLOR, kind: 'ceiling',
    });
  }
  return out;
}
