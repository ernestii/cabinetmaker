import type { Node3D } from '../../domain/types';

/** inches → feet for a comfortable scene scale. Shared by every node renderer. */
export const S = 1 / 12;

export type Vec3 = [number, number, number];

/** Identity for a node from its kind + placement, stable across filter toggles. */
export const nodeKey = (n: Node3D) => `${n.kind}:${n.pos.join(',')}:${n.size.join(',')}`;

/** A node's centre in scene space (feet), relative to the scene centre. */
export const scenePos = (pos: Vec3, center: Vec3): Vec3 => [
  (pos[0] - center[0]) * S,
  (pos[1] - center[1]) * S,
  (pos[2] - center[2]) * S,
];
