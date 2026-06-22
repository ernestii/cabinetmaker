import { SHELF_SETBACK, SHELF_SIDE_CLEARANCE } from '../constants';
import { colorFor, materialFor, textureFor, type BuildContext, type PartFactory } from './context';
import type { FrontLayoutItem } from './fronts';

/**
 * Adjustable shelves for a door / fixed opening. Shelf stock matches the
 * carcass; shelves are slightly under the interior width (drop onto pins) and
 * set back from the front so they clear the door. Placed evenly within the
 * opening's vertical span — exact height is up to the pin holes, so the 3D
 * positions are illustrative.
 */
export function buildShelves(
  ctx: BuildContext,
  f: PartFactory,
  item: FrontLayoutItem,
  count: number,
  partId: string,
  label: string,
): void {
  if (count <= 0) return;
  const { widthIn: W, depthIn: D, c } = ctx;
  const t = c.carcassThicknessIn;
  const tb = c.backThicknessIn;
  const innerW = W - 2 * t;
  const shelfW = innerW - 2 * SHELF_SIDE_CLEARANCE;
  const shelfD = D - tb - SHELF_SETBACK;

  f.add({
    id: partId, label, role: 'carcass', materialId: materialFor(ctx, 'carcass'),
    thicknessIn: t, wIn: shelfW, lIn: shelfD, qty: count, edgeBandEdges: ['top'], joinery: [],
    grainLocked: true, notes: 'Adjustable — bore 5mm shelf-pin holes',
  });

  // Custom shelf heights (dragged in the elevation) override even spacing; both
  // are only illustrative (the real height is set by the pin holes).
  const span = item.topY - item.bottomY;
  const offsets = item.opening.shelfOffsetsIn;
  const useCustom = offsets?.length === count;
  const color = colorFor(ctx, 'carcass');
  const tex = textureFor(ctx, 'carcass');
  for (let i = 1; i <= count; i++) {
    const y = useCustom ? item.bottomY + offsets![i - 1] : item.bottomY + (span * i) / (count + 1);
    f.node({ pos: [W / 2, y, tb + shelfD / 2], size: [shelfW, t, shelfD], color, textureUrl: tex, kind: 'panel', partId });
  }
}
