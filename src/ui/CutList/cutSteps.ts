import type { CutStep } from '../../domain/cutlist/nesting';
import { toFraction } from '../../domain/format';

/**
 * Builder-English for one guillotine cut. Rip/crosscut positions are marks on
 * the *uncut* sheet/strip (mark everything first, then cut in order); a trim is
 * a fence setting on the piece the previous crosscut freed.
 */
export function cutStepText(c: CutStep): string {
  switch (c.kind) {
    case 'rip':
      return `Rip the full width at ${toFraction(c.posIn)} from the top edge — frees row ${c.shelfIndex + 1} (${toFraction(c.sizeIn)} tall).`;
    case 'crosscut':
      return `Crosscut row ${c.shelfIndex + 1} at ${toFraction(c.posIn)} from its left end — frees ${c.partId} (${toFraction(c.sizeIn)} wide).`;
    case 'trim':
      return `Trim ${c.partId} to ${toFraction(c.sizeIn)} — rip the freed piece with the fence at ${toFraction(c.sizeIn)}.`;
  }
}
