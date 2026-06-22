import type { Node3D } from '../types';
import type { FigPhase } from './figures';

/**
 * The assembly phases the 3D figure steps through, in build order. Drives the
 * phase stepper, the highlight (active phase full-colour, others dimmed) and the
 * exploded view (parts pull out further the later their phase).
 */
export const ASSEMBLY_PHASES: readonly FigPhase[] = ['carcass', 'boxes', 'doors', 'faces'] as const;

/** 0-based build order for a phase — the explode offset scales with this. */
export function phaseOrder(phase: FigPhase): number {
  const i = ASSEMBLY_PHASES.indexOf(phase);
  return i < 0 ? 0 : i;
}

/**
 * Map a cabinet-local 3D node onto its assembly phase, inferred from `kind` and
 * its open-group kind. A heuristic (not stored on the node) so the geometry
 * builders + their golden snapshots stay untouched:
 *
 *   carcass — structural box: panels, back, toekick, legs
 *   boxes   — drawer boxes
 *   doors   — anything in a door open-group (leaf + its pull): hung in the door phase
 *   faces   — drawer faces / pulls and any other finished front
 *
 * If the inference proves too coarse we promote it to a real `phase` field on
 * `Node3D` (a separate change).
 */
export function nodeAssemblyPhase(node: Node3D): FigPhase {
  if (node.open?.kind === 'door') return 'doors';
  switch (node.kind) {
    case 'drawerBox':
      return 'boxes';
    case 'face':
    case 'handle':
      return 'faces';
    default:
      // panel, back, toekick, leg, counter, … → structural carcass phase.
      return 'carcass';
  }
}
