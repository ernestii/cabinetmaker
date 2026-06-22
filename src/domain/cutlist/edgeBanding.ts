import type { Edge, Part } from '../types';

function edgeLength(part: Part, edge: Edge): number {
  return edge === 'top' || edge === 'bottom' ? part.wIn : part.lIn;
}

/** Total linear inches of edge banding for one part (× qty). */
export function partBandingLength(part: Part): number {
  const per = part.edgeBandEdges.reduce((s, e) => s + edgeLength(part, e), 0);
  return per * part.qty;
}

/** Total banding length across parts, in inches. */
export function totalBandingLength(parts: Part[]): number {
  return parts.reduce((s, p) => s + partBandingLength(p), 0);
}
