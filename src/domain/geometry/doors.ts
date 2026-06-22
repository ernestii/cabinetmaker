import { hingeCountForDoorHeight } from '../constants';
import type { BuildContext, PartFactory } from './context';
import type { FrontLayoutItem } from './fronts';
import { buildFace } from './drawerBox';

export interface HingePlan {
  count: number;
  /** Cup-center distance from the door top/bottom ends, in inches. */
  endInsetIn: number;
  /** Cup-center positions measured from the door bottom, in inches. */
  positionsIn: number[];
  /** Cup-center distance from the door's hinge-side edge, in mm. */
  cupEdgeMm: number;
  cupDiameterMm: number;
}

/** Euro hinge boring plan for a door of the given height. */
export function hingePlan(doorHeightIn: number): HingePlan {
  const count = hingeCountForDoorHeight(doorHeightIn);
  const endInsetIn = 3.5;
  const positions: number[] = [];
  if (count === 1) {
    positions.push(doorHeightIn / 2);
  } else {
    const span = doorHeightIn - 2 * endInsetIn;
    for (let i = 0; i < count; i++) {
      positions.push(endInsetIn + (span * i) / (count - 1));
    }
  }
  return {
    count,
    endInsetIn,
    positionsIn: positions.map((p) => +p.toFixed(2)),
    cupEdgeMm: 22.5,
    cupDiameterMm: 35,
  };
}

export function buildDoor(
  ctx: BuildContext,
  f: PartFactory,
  item: FrontLayoutItem,
  doorNo: number,
): void {
  const { index } = ctx;
  const leaves: 1 | 2 = item.opening.doorCount === 2 ? 2 : 1;
  const partId = `C${index}-DOOR${doorNo}`;
  const hp = hingePlan(item.faceHeightIn);
  const totalHinges = hp.count * leaves;
  const hingeNote = `${totalHinges} euro hinges (${hp.count}/leaf); cups Ø${hp.cupDiameterMm}mm @ ${hp.cupEdgeMm}mm from edge, centers at ${hp.positionsIn.join('", ')}" from bottom`;

  // buildFace folds the hinge note in alongside any handle note onto the face part.
  buildFace(ctx, f, item, partId, leaves === 2 ? `Door pair ${doorNo}` : `Door ${doorNo}`, leaves, hingeNote, {
    kind: 'door',
    hingeSide: item.opening.hingeSide,
  });
}
