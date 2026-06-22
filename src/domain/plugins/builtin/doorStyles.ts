/**
 * Built-in door/face styles.
 *
 * - `slab`  : the default — one flat overlay panel. This is exactly the face
 *             geometry the engine produced before the plugin system, so every
 *             existing project renders unchanged.
 * - `shaker`: the canonical "write your own plugin" example — a frame-and-panel
 *             face (2 stiles + 2 rails + a recessed centre panel). It shows how
 *             a third party adds a style without touching core code.
 */
import type { DoorStyleContext, DoorStyleDef } from '../types';
import { toFraction } from '../../format';

/** A flat overlay panel (the historical default). */
export const slabStyle: DoorStyleDef = {
  id: 'slab',
  label: 'Slab (flat)',
  buildFace(c: DoorStyleContext): void {
    const { f, partId, label, leaves, faceMaterialId, tf, faceW, faceHeight, note, emit } = c;
    const { W, D, cy, gap, faceColor, faceTexture } = c;

    f.add({
      id: partId,
      label,
      role: 'face',
      materialId: faceMaterialId,
      thicknessIn: tf,
      wIn: faceW,
      lIn: faceHeight,
      qty: leaves,
      edgeBandEdges: ['top', 'bottom', 'left', 'right'],
      joinery: [],
      grainLocked: true,
      notes: note,
    });

    const panel = (cx: number) =>
      emit({ pos: [cx, cy, D + tf / 2], size: [faceW, faceHeight, tf], color: faceColor, textureUrl: faceTexture, kind: 'face' });
    if (leaves === 2) {
      panel(W / 2 - gap / 2 - faceW / 2);
      panel(W / 2 + gap / 2 + faceW / 2);
    } else {
      panel(W / 2);
    }
  },
};

// Frame-and-panel proportions for the shaker example.
const STILE_W = 2.25; // vertical frame members (left/right)
const RAIL_W = 2.25; // horizontal frame members (top/bottom)
const GROOVE = 0.25; // panel tongue captured in the frame groove
const PANEL_T = 0.25; // recessed centre panel stock (1/4")

/** 3D nodes for one shaker leaf centred at `lx` (four frame members + panel). */
function shakerLeafNodes(c: DoorStyleContext, lx: number): void {
  const { tf, faceW, faceHeight, D, cy, faceColor, faceTexture, emit } = c;
  const innerW = faceW - 2 * STILE_W;
  const innerH = faceHeight - 2 * RAIL_W;
  const frameZ = D + tf / 2;
  const box = (px: number, py: number, w: number, h: number, z: number) =>
    emit({ pos: [px, py, z], size: [w, h, tf], color: faceColor, textureUrl: faceTexture, kind: 'face' });
  // left / right stiles
  box(lx - faceW / 2 + STILE_W / 2, cy, STILE_W, faceHeight, frameZ);
  box(lx + faceW / 2 - STILE_W / 2, cy, STILE_W, faceHeight, frameZ);
  // top / bottom rails (between the stiles)
  box(lx, cy + faceHeight / 2 - RAIL_W / 2, innerW, RAIL_W, frameZ);
  box(lx, cy - faceHeight / 2 + RAIL_W / 2, innerW, RAIL_W, frameZ);
  // recessed panel: sat back so the frame stands proud
  emit({
    pos: [lx, cy, D + PANEL_T / 2], size: [innerW + 2 * GROOVE, innerH + 2 * GROOVE, PANEL_T],
    color: faceColor, textureUrl: faceTexture, kind: 'face',
  });
}

/** Frame-and-panel face (example plugin). */
export const shakerStyle: DoorStyleDef = {
  id: 'shaker',
  label: 'Shaker (frame & panel)',
  buildFace(c: DoorStyleContext): void {
    const { f, partId, faceMaterialId, tf, faceW, faceHeight, W, gap, leaves, note } = c;
    const innerW = faceW - 2 * STILE_W;
    const innerH = faceHeight - 2 * RAIL_W;

    // Parts are emitted once with the per-leaf quantity folded in, so a pair of
    // shaker doors never produces colliding part ids.
    f.add({
      id: `${partId}-STILE`, label: 'Shaker stile', role: 'face', materialId: faceMaterialId,
      thicknessIn: tf, wIn: STILE_W, lIn: faceHeight, qty: 2 * leaves, edgeBandEdges: [], joinery: ['groove'],
      grainLocked: true, notes: [note, `Cope-and-stick frame; ${toFraction(GROOVE)} panel groove`].filter(Boolean).join('; '),
    });
    f.add({
      id: `${partId}-RAIL`, label: 'Shaker rail', role: 'face', materialId: faceMaterialId,
      thicknessIn: tf, wIn: RAIL_W, lIn: innerW + 2 * GROOVE, qty: 2 * leaves, edgeBandEdges: [], joinery: ['groove'],
      grainLocked: true, notes: `Stub tenon ${toFraction(GROOVE)} into stile grooves`,
    });
    f.add({
      id: `${partId}-PANEL`, label: 'Shaker panel', role: 'face', materialId: faceMaterialId,
      thicknessIn: PANEL_T, wIn: innerW + 2 * GROOVE, lIn: innerH + 2 * GROOVE, qty: leaves, edgeBandEdges: [],
      joinery: [], grainLocked: true, notes: `${toFraction(PANEL_T)} recessed flat panel — floats in the frame groove`,
    });

    if (leaves === 2) {
      shakerLeafNodes(c, W / 2 - gap / 2 - faceW / 2);
      shakerLeafNodes(c, W / 2 + gap / 2 + faceW / 2);
    } else {
      shakerLeafNodes(c, W / 2);
    }
  },
};
