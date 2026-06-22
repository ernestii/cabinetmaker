import type { Project, Wall } from '../types';

export interface WallMetrics {
  legH: number;
  counterT: number;
  /** Y of the underside of the countertop (= top of base carcass). */
  counterUndersideY: number;
  /** Y of the top of the counter (floor → counter surface). */
  counterTopY: number;
  baseCarcassH: number;
  upperH: number;
  upperYBottom: number;
  tallCarcassH: number;
}

/** Resolve the wall's vertical layout from project defaults + wall ceiling. */
export function wallMetrics(project: Project, wall: Wall): WallMetrics {
  const d = project.defaults;
  const counterT = d.counterThicknessIn;
  const legH = d.legHeightIn;
  const counterTopY = d.counterHeightIn;
  const counterUndersideY = counterTopY - counterT;
  return {
    legH,
    counterT,
    counterUndersideY,
    counterTopY,
    baseCarcassH: counterTopY - legH - counterT,
    upperH: d.upperHeightIn,
    upperYBottom: wall.ceilingHeightIn - d.upperCeilingGapIn - d.upperHeightIn,
    tallCarcassH: wall.ceilingHeightIn - legH,
  };
}
