import {
  EDGE_PULL_EXTENSION,
  ROUTER_CUTOUT_DEPTH,
  ROUTER_CUTOUT_HEIGHT,
  ROUTER_CUTOUT_WIDTH,
} from '../constants';
import { toFraction } from '../format';
import type { HandleType, Node3D, Opening } from '../types';

/** Brushed-metal pull/knob colour, and the dark routed-recess colour, for the viz. */
const HANDLE_COLOR = '#8d9095';
const CUTOUT_COLOR = '#2b2b2f';
/** How far a knob/bar pull stands off the front of the face (viz only). */
const PULL_STANDOFF = 0.5;

/**
 * Effective handle for an opening. Only drawers and doors get one; fixed panels
 * and false fronts never do. An unset handle falls back to the project default
 * (itself defaulting to a knob/bar 'pull'), so existing projects and the
 * hardware tally behave exactly as before unless a default is supplied.
 */
export function effectiveHandle(opening: Opening, defaultHandle: HandleType = 'pull'): HandleType | undefined {
  if (opening.type !== 'drawer' && opening.type !== 'door') return undefined;
  return opening.handle ?? defaultHandle;
}

/** Pull / push-latch hardware this front needs, for `leaves` face panels. */
export function handleHardware(opening: Opening, leaves: number, defaultHandle?: HandleType): { pulls: number; pushLatches: number } {
  switch (effectiveHandle(opening, defaultHandle)) {
    case 'pull':
      return { pulls: leaves, pushLatches: 0 };
    case 'pushLatch':
      return { pulls: 0, pushLatches: leaves };
    // routerCutout + edgePull are integral to the face — no bought hardware.
    default:
      return { pulls: 0, pushLatches: 0 };
  }
}

/** Extra face length contributed by an integrated edge pull (0 for every other handle). */
export function edgePullExtension(opening: Opening, defaultHandle?: HandleType): number {
  return effectiveHandle(opening, defaultHandle) === 'edgePull' ? EDGE_PULL_EXTENSION : 0;
}

/**
 * Shop note for the chosen handle, appended to the face part. The default
 * 'pull' adds nothing (it's the assumed baseline), so cut lists stay clean.
 */
export function handleNote(opening: Opening, defaultHandle?: HandleType): string | undefined {
  switch (effectiveHandle(opening, defaultHandle)) {
    case 'routerCutout':
      return `Router a finger pull into the top edge (${toFraction(ROUTER_CUTOUT_DEPTH)} deep × ${toFraction(ROUTER_CUTOUT_HEIGHT)} tall)`;
    case 'pushLatch':
      return 'Push-to-open latch — no drilling for a pull';
    case 'edgePull':
      return `Includes a ${toFraction(EDGE_PULL_EXTENSION)} integrated finger lip below the opening`;
    default:
      return undefined;
  }
}

export interface HandleVizInput {
  opening: Opening;
  /** 1 = single panel, 2 = a pair of leaves. */
  leaves: 1 | 2;
  /** Cabinet width and depth, and face thickness (cabinet-local frame). */
  W: number;
  D: number;
  tf: number;
  /** Face vertical centre and (un-extended) height. */
  cy: number;
  faceHeight: number;
  /** Single-face width, or per-leaf width for a pair. */
  faceW: number;
  /** Centre gap between the two leaves of a pair. */
  gap: number;
}

/**
 * 3D nodes that depict the handle on the face: a recess for a routed finger
 * pull, a bar for a drawer pull, a knob for a door pull. Push latches and edge
 * pulls add nothing here (a latch is hidden; an edge pull is just a taller face).
 */
export function handleNodes(inp: HandleVizInput, defaultHandle?: HandleType): Node3D[] {
  const handle = effectiveHandle(inp.opening, defaultHandle);
  if (handle === 'pull') return pullNodes(inp);
  if (handle === 'routerCutout') return [routerCutoutNode(inp)];
  return [];
}

/** A dark recess machined into the top edge of a (drawer) face. */
function routerCutoutNode({ W, D, tf, cy, faceHeight, faceW }: HandleVizInput): Node3D {
  // Routed finger pull: a rounded trapezoidal recess centred on the top
  // edge, sat just proud of the face so it never z-fights it. The trapezoid is
  // drawn by the viewer from this node's size (top span, height, depth).
  const recessW = Math.min(ROUTER_CUTOUT_WIDTH, faceW * 0.9);
  const recessH = Math.min(ROUTER_CUTOUT_HEIGHT, faceHeight * 0.4);
  return {
    pos: [W / 2, cy + faceHeight / 2 - recessH / 2, D + tf + 0.04],
    size: [recessW, recessH, ROUTER_CUTOUT_DEPTH * 0.3],
    color: CUTOUT_COLOR,
    kind: 'handle',
    shape: 'fingerPull',
  };
}

/** A bar pull near the top of a drawer face, or a vertical bar on each door leaf. */
function pullNodes(inp: HandleVizInput): Node3D[] {
  const { opening, leaves, W, D, tf, cy, faceHeight, faceW, gap } = inp;
  const frontZ = D + tf + PULL_STANDOFF / 2;

  if (opening.type === 'drawer') {
    const barW = Math.min(Math.max(faceW * 0.5, 4), 12);
    const yFromTop = Math.min(1.5, faceHeight / 2);
    return [
      {
        pos: [W / 2, cy + faceHeight / 2 - yFromTop, frontZ],
        size: [barW, 0.5, PULL_STANDOFF],
        color: HANDLE_COLOR,
        kind: 'handle',
      },
    ];
  }

  // Doors: a vertical bar pull on the latch (non-hinge) side.
  const barH = Math.min(Math.max(faceHeight * 0.45, 5), 10);
  const bar = (cx: number): Node3D => ({
    pos: [cx, cy, frontZ],
    size: [0.5, barH, PULL_STANDOFF],
    color: HANDLE_COLOR,
    kind: 'handle',
  });

  if (leaves === 2) {
    // One bar per leaf, flanking the centre gap.
    return [bar(W / 2 - gap / 2 - 1), bar(W / 2 + gap / 2 + 1)];
  }
  const onRight = (opening.hingeSide ?? 'left') === 'left';
  const cx = onRight ? W / 2 + faceW / 2 - 1.5 : W / 2 - faceW / 2 + 1.5;
  return [bar(cx)];
}
