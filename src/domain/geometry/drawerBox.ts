import {
  BOTTOM_GROOVE_UP,
  REVEAL,
  SCREWS_PER_JOINT,
  SLIDE_CLEARANCE,
  UNDERMOUNT_CLEARANCE,
  standardSlideLength,
} from '../constants';
import { toFraction } from '../format';
import type { DrawerJoint, Joinery, Node3D, NodeOpen, SlideType } from '../types';
import { colorFor, materialFor, textureFor, type BuildContext, type PartFactory } from './context';
import { doubleDoorLeafWidth, singleFaceWidth, type FrontLayoutItem } from './fronts';
import { edgePullExtension, handleNodes, handleNote } from './handles';
import { getDoorStyle } from '../plugins/registry';

/** Drawer-bottom capture groove depth (routed inside all four box panels). */
export const GROOVE_DEPTH = 0.25;

/** Inputs that shape a drawer box beyond its raw dimensions. */
export interface DrawerSpec {
  joint: DrawerJoint;
  slideType: SlideType;
  drawerThicknessIn: number;
  /** Depth the front/back seat into the side dados. */
  dadoDepthIn: number;
}

export interface DrawerPanels {
  boxOuterWidthIn: number;
  boxDepthIn: number;
  boxHeightIn: number;
  /** Clear inside dimensions (between sides / between front & back). */
  interiorWidthIn: number;
  interiorDepthIn: number;
  /** Front/back width including the dado seating allowance on each end. */
  fbWidthIn: number;
  /** Bottom panel size including groove capture on all four sides. */
  bottomWidthIn: number;
  bottomLengthIn: number;
  /** Slide clearance used per side (depends on slide type). */
  clearancePerSideIn: number;
}

/** Per-side slide clearance for the chosen mounting style. */
export function slideClearance(slideType: SlideType): number {
  return slideType === 'under' ? UNDERMOUNT_CLEARANCE : SLIDE_CLEARANCE;
}

/**
 * Canonical drawer-box geometry — the single source of truth used by the
 * builder, the assembly steps, and the tests. The front/back seat into dados
 * cut in the sides, so they run wider than the clear interior by 2× dado depth.
 */
export function drawerPanels(
  cabinetWidthIn: number,
  carcassThicknessIn: number,
  slideLenIn: number,
  boxHeightIn: number,
  spec: DrawerSpec,
): DrawerPanels {
  const td = spec.drawerThicknessIn;
  const clearance = slideClearance(spec.slideType);
  const innerW = cabinetWidthIn - 2 * carcassThicknessIn;
  const boxOuterWidthIn = innerW - 2 * clearance;
  const boxDepthIn = slideLenIn;
  const interiorWidthIn = boxOuterWidthIn - 2 * td;
  const interiorDepthIn = boxDepthIn - 2 * td;
  return {
    boxOuterWidthIn,
    boxDepthIn,
    boxHeightIn,
    interiorWidthIn,
    interiorDepthIn,
    fbWidthIn: interiorWidthIn + 2 * spec.dadoDepthIn,
    bottomWidthIn: interiorWidthIn + 2 * GROOVE_DEPTH,
    bottomLengthIn: interiorDepthIn + 2 * GROOVE_DEPTH,
    clearancePerSideIn: clearance,
  };
}

/** Box height for a drawer face, honoring an explicit override. */
export function drawerBoxHeight(item: FrontLayoutItem): number {
  return item.opening.drawer?.boxHeightIn ?? Math.max(2, item.faceHeightIn - 1);
}

/** Real, purchasable slide length that fits the cabinet depth (or the request). */
export function resolveSlideLength(depthIn: number, requestedIn?: number): number {
  const maxSlide = depthIn - 1; // ~1" behind the box for the slide hardware
  return requestedIn != null && requestedIn <= maxSlide ? requestedIn : standardSlideLength(maxSlide);
}

export function buildDrawer(
  ctx: BuildContext,
  f: PartFactory,
  item: FrontLayoutItem,
  drawerNo: number,
): void {
  const { widthIn: W, depthIn: D, index, c } = ctx;
  const td = c.drawerThicknessIn;
  const tbottom = c.drawerBottomThicknessIn;
  const id = (s: string) => `C${index}-DR${drawerNo}-${s}`;

  const slideLen = resolveSlideLength(D, item.opening.drawer?.slideLenIn);
  // The face is full-overlay — it covers the carcass top/bottom panels — but the
  // box must live *inside* the carcass, between those panels. Clamp the box into
  // the interior [t, Hc-t] (less a reveal of air on each side) so the top drawer
  // box never pokes up through the cabinet top (and the bottom one through the
  // bottom). For a degenerate full-height drawer this also caps the box height.
  const interiorBottomY = c.carcassThicknessIn + REVEAL;
  const interiorTopY = ctx.carcassHeightIn - c.carcassThicknessIn - REVEAL;
  const boxHeight = Math.min(drawerBoxHeight(item), interiorTopY - interiorBottomY);
  const spec: DrawerSpec = {
    joint: c.drawerJoint,
    slideType: c.slideType,
    drawerThicknessIn: td,
    dadoDepthIn: c.dadoDepthIn,
  };
  const panels = drawerPanels(W, c.carcassThicknessIn, slideLen, boxHeight, spec);
  const { boxOuterWidthIn: boxOuterW, interiorWidthIn: interiorW, interiorDepthIn: interiorD } = panels;

  const drawerMat = materialFor(ctx, 'drawer');
  const bottomMat = materialFor(ctx, 'drawerBottom');

  const screws = c.drawerJoint === 'dadoScrew';
  const sideJoinery: Joinery[] = screws ? ['dado', 'screw'] : ['dado'];
  const sideNote = `${toFraction(c.dadoDepthIn)} dado, ${toFraction(c.dadoDepthIn)} from each end${
    screws ? `; ${SCREWS_PER_JOINT} screws/joint` : ' (glue)'
  }`;

  // Box sides (left/right) — full depth; carry the dados that capture front/back.
  f.add({
    id: id('SIDE'), label: `Drawer ${drawerNo} side`, role: 'drawer', materialId: drawerMat,
    thicknessIn: td, wIn: slideLen, lIn: boxHeight, qty: 2, edgeBandEdges: [], joinery: sideJoinery, grainLocked: false,
    notes: sideNote,
  });
  // Front + back — seat into the side dados (wider than the clear interior).
  f.add({
    id: id('FB'), label: `Drawer ${drawerNo} front/back`, role: 'drawer', materialId: drawerMat,
    thicknessIn: td, wIn: panels.fbWidthIn, lIn: boxHeight, qty: 2, edgeBandEdges: [], joinery: ['dado'], grainLocked: false,
    notes: `Seats ${toFraction(c.dadoDepthIn)} into each side dado`,
  });
  // Bottom — captured in grooves on all four sides.
  const bottomNote = [
    `${toFraction(GROOVE_DEPTH)} groove, ${toFraction(BOTTOM_GROOVE_UP)} up`,
    c.slideType === 'under' ? '≥1/2" bottom; notch rear for under-mount locking device' : null,
  ].filter(Boolean).join('; ');
  f.add({
    id: id('BOT'), label: `Drawer ${drawerNo} bottom`, role: 'drawerBottom', materialId: bottomMat,
    thicknessIn: tbottom, wIn: panels.bottomWidthIn, lIn: panels.bottomLengthIn, qty: 1,
    edgeBandEdges: [], joinery: ['groove'], grainLocked: false,
    notes: bottomNote,
  });

  // --- 3D: the drawer carcass as real panels (two sides, front, back, bottom) ---
  const cx = W / 2;
  // Centre on the overlay face, then slide the box vertically so it stays inside
  // the carcass interior (tucked under the top / above the bottom panel).
  const faceCy = (item.topY + item.bottomY) / 2;
  const cy = Math.min(Math.max(faceCy, interiorBottomY + boxHeight / 2), interiorTopY - boxHeight / 2);
  const cz = D - slideLen / 2;
  const color = colorFor(ctx, 'drawer');
  const tex = textureFor(ctx, 'drawer');
  // The whole drawer (box + face + handle) opens as one unit, sliding out by its
  // slide length toward the room.
  const drawerOpen: NodeOpen = { id: id('FACE'), kind: 'drawer', travel: slideLen };
  const box = (partId: string, pos: [number, number, number], size: [number, number, number]) =>
    f.node({ pos, size, color, textureUrl: tex, kind: 'drawerBox', open: drawerOpen, partId });
  // Left / right sides (full depth)
  box(id('SIDE'), [cx - boxOuterW / 2 + td / 2, cy, cz], [td, boxHeight, slideLen]);
  box(id('SIDE'), [cx + boxOuterW / 2 - td / 2, cy, cz], [td, boxHeight, slideLen]);
  // Front (toward the room) / back
  box(id('FB'), [cx, cy, D - td / 2], [interiorW, boxHeight, td]);
  box(id('FB'), [cx, cy, D - slideLen + td / 2], [interiorW, boxHeight, td]);
  // Bottom (sits up from the box bottom edge in its groove)
  const bottomY = cy - boxHeight / 2 + BOTTOM_GROOVE_UP + tbottom / 2;
  box(id('BOT'), [cx, bottomY, cz], [interiorW, tbottom, interiorD]);

  buildFace(ctx, f, item, id('FACE'), `Drawer ${drawerNo} face`, 1, undefined, { kind: 'drawer', travel: slideLen });
}

/**
 * How an opening's face panel(s) become interactive in the viewer. A drawer's
 * one face slides; a door splits into one swinging leaf per panel.
 */
export type FaceOpenSpec =
  | { kind: 'drawer'; travel: number }
  | { kind: 'door'; hingeSide?: 'left' | 'right' };

/**
 * Per-leaf open descriptors for a face, in left-to-right order. A drawer is a
 * single sliding group; a single door hinges on its chosen side; a pair hinges
 * on its two outer edges so the leaves swing apart.
 */
function faceLeafOpens(
  spec: FaceOpenSpec,
  groupId: string,
  W: number,
  D: number,
  tf: number,
  faceW: number,
  gap: number,
  leaves: 1 | 2,
  cy: number,
): NodeOpen[] {
  if (spec.kind === 'drawer') {
    return [{ id: groupId, kind: 'drawer', travel: spec.travel }];
  }
  // A door hinges on the named edge, at the OUTER (room-facing) face of the
  // overlay panel (z = D + tf) rather than its back. That mirrors a real hinge:
  // the panel's hinge-side corner stays put and the whole leaf sweeps to its own
  // side of the hinge line, so it never swings back into a neighbouring door.
  const door = (id: string, hingeX: number, swing: 1 | -1): NodeOpen => ({
    id, kind: 'door', pivot: [hingeX, cy, D + tf], swing,
  });
  if (leaves === 2) {
    const leftEdge = W / 2 - gap / 2 - faceW;
    const rightEdge = W / 2 + gap / 2 + faceW;
    return [door(`${groupId}-L`, leftEdge, -1), door(`${groupId}-R`, rightEdge, 1)];
  }
  const onLeft = (spec.hingeSide ?? 'left') === 'left';
  const hingeX = onLeft ? W / 2 - faceW / 2 : W / 2 + faceW / 2;
  return [door(groupId, hingeX, onLeft ? -1 : 1)];
}

/** Shared face builder for drawers and doors. leaves=1 single, leaves=2 pair. */
export function buildFace(
  ctx: BuildContext,
  f: PartFactory,
  item: FrontLayoutItem,
  partId: string,
  label: string,
  leaves: 1 | 2,
  extraNote?: string,
  open?: FaceOpenSpec,
): void {
  const { widthIn: W, depthIn: D, c } = ctx;
  const tf = c.faceThicknessIn;
  const faceMat = materialFor(ctx, 'face');
  const faceColor = colorFor(ctx, 'face');
  const faceTex = textureFor(ctx, 'face');

  // Unset opening handles fall back to the project default for this front type.
  const dfltHandle = item.opening.type === 'door' ? ctx.doorHandle : ctx.drawerHandle;

  // An edge pull runs the face past the bottom of the opening; that extension is
  // part of the cut, so it grows the face length and drops its centre.
  const ext = edgePullExtension(item.opening, dfltHandle);
  const faceHeight = item.faceHeightIn + ext;
  const cy = (item.topY + item.bottomY) / 2 - ext / 2;
  const notes = [extraNote, handleNote(item.opening, dfltHandle)].filter(Boolean).join('; ') || undefined;

  const faceW = leaves === 2 ? doubleDoorLeafWidth(W) : singleFaceWidth(W);
  // Center gap between the two leaves = total width minus both leaves (0 for one).
  const gap = leaves === 2 ? W - 2 * faceW : 0;

  // Tag each emitted node with the leaf it belongs to (by x), so the viewer can
  // open drawers/doors. A pair splits at the cabinet centre; everything else is
  // one group.
  const leafOpens = open ? faceLeafOpens(open, partId, W, D, tf, faceW, gap, leaves, cy) : null;
  const openFor = (x: number): NodeOpen | undefined =>
    !leafOpens ? undefined : leafOpens.length === 1 ? leafOpens[0] : x < W / 2 ? leafOpens[0] : leafOpens[1];
  // Every node a style/handle emits for this face belongs to its face part —
  // tag it (unless the style set its own) so the cut list can point back here.
  const emit = (n: Node3D) =>
    f.node({ ...n, partId: n.partId ?? partId, open: leafOpens ? openFor(n.pos[0]) : n.open });

  // The chosen door/face style emits the face part(s) + panel node(s). 'slab'
  // (the default) makes a single overlay panel; 'shaker' makes a frame & panel.
  getDoorStyle(item.opening.doorStyle).buildFace({
    ctx, f, item, partId, label, leaves, faceW, faceHeight, gap, cy, W, D, tf,
    faceMaterialId: faceMat, faceColor, faceTexture: faceTex, note: notes, emit,
  });

  // Handle viz (recess / bar / knob) on top of the face panel(s), style-agnostic.
  for (const n of handleNodes({ opening: item.opening, leaves, W, D, tf, cy, faceHeight, faceW, gap }, dfltHandle)) {
    emit(n);
  }
}
