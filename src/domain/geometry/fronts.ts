import type { Opening } from '../types';
import { REVEAL, SNAP_DENOM } from '../constants';
import { snapTo } from '../format';

export interface FrontLayoutItem {
  opening: Opening;
  faceHeightIn: number;
  /** y of the face top edge (carcass-local). */
  topY: number;
  /** y of the face bottom edge. */
  bottomY: number;
}

/**
 * Distribute a vertical stack of fronts over the carcass front height.
 *
 * **Module (slot) model.** Each front owns a vertical *module* of the carcass
 * front height; its face is inset REVEAL (1/16") on every edge, so adjacent
 * faces leave a 1/8" gap and the outer edges show 1/16". A fixed `heightIn` is
 * the MODULE height — the slot the front occupies — not the bare face, so fixed
 * heights are **additive**: two 12" slots fill exactly the same space as one
 * 24" slot (12 + 12 = 24), and a bank lines up no matter how it's subdivided.
 * The modules tile the full height (Σ module = Hf), which gives
 *     faceHeight = module - 2 * REVEAL   ⟹   Σ faceHeight = Hf - n * 2 * REVEAL.
 *
 * Every produced face height is quantised to the 1/denom" cut grid. 'auto'
 * openings share whatever slot height is left after the fixed modules,
 * distributed in whole 1/denom" units (largest-remainder) so the *snapped*
 * modules never overflow the opening — a builder can cut straight from these
 * numbers and the stack closes.
 */
export function layoutFronts(
  openings: Opening[],
  frontHeightIn: number,
  denom = SNAP_DENOM,
): FrontLayoutItem[] {
  const n = openings.length;
  if (n === 0) return [];

  const isAuto = (o: Opening) => o.heightIn === 'auto';
  // Fixed `heightIn` is the module (slot) height — sum it as-is.
  const fixedModuleSum = openings.reduce(
    (s, o) => s + (isAuto(o) ? 0 : snapTo(o.heightIn as number, denom)),
    0,
  );
  const autoCount = openings.filter(isAuto).length;

  // Whole-unit (1/denom") distribution of the leftover slot height across 'auto'
  // fronts. Floor the total so the snapped modules can never sum past the opening.
  const autoUnits = Math.max(0, Math.floor((frontHeightIn - fixedModuleSum) * denom + 1e-6));
  const baseUnits = autoCount > 0 ? Math.floor(autoUnits / autoCount) : 0;
  let extraUnits = autoCount > 0 ? autoUnits - baseUnits * autoCount : 0;

  const items: FrontLayoutItem[] = [];
  // Tile the modules from the top of the carcass downward; the face sits inset
  // REVEAL inside its module, so neighbouring faces leave the 1/8" gap.
  let moduleTop = frontHeightIn;
  for (const opening of openings) {
    let moduleIn: number;
    if (isAuto(opening)) {
      const units = baseUnits + (extraUnits > 0 ? 1 : 0);
      if (extraUnits > 0) extraUnits -= 1;
      moduleIn = units / denom;
    } else {
      moduleIn = snapTo(opening.heightIn as number, denom);
    }
    const faceHeightIn = Math.max(0, moduleIn - 2 * REVEAL);
    const topY = moduleTop - REVEAL;
    const bottomY = topY - faceHeightIn;
    items.push({ opening, faceHeightIn, topY, bottomY });
    moduleTop -= moduleIn; // next module starts at this one's bottom edge
  }
  return items;
}

/**
 * How much the fixed (non-'auto') front modules overshoot the opening, in inches
 * (0 when they fit). Fixed `heightIn` is a slot/module that includes its reveal,
 * so the fixed modules simply have to fit within the carcass front height. Used
 * to warn before a build can't physically close.
 */
export function frontsOverflowIn(
  openings: Opening[],
  frontHeightIn: number,
  denom = SNAP_DENOM,
): number {
  const n = openings.length;
  if (n === 0) return 0;
  const fixedModuleSum = openings.reduce(
    (s, o) => s + (o.heightIn === 'auto' ? 0 : snapTo(o.heightIn as number, denom)),
    0,
  );
  return Math.max(0, fixedModuleSum - frontHeightIn);
}

/** Face width for a single-front opening (full overlay). */
export function singleFaceWidth(cabinetWidthIn: number): number {
  return cabinetWidthIn - 2 * REVEAL;
}

/** Per-leaf width for a pair of doors sharing a 1/8" center gap. */
export function doubleDoorLeafWidth(cabinetWidthIn: number): number {
  // outer reveals: 2*REVEAL; center gap: 2*REVEAL
  return (cabinetWidthIn - 2 * REVEAL - 2 * REVEAL) / 2;
}

/** Total height consumed by reveals for a stack of n fronts. */
export function revealHeightForCount(n: number): number {
  return n * 2 * REVEAL;
}
