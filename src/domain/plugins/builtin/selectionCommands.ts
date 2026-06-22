/**
 * Built-in multi-select bulk commands (Axis 6). These run over the set of wall
 * elements selected together in the elevation editor and return per-element
 * patches the store applies.
 *
 * `spread-evenly` is the reference command: it distributes the gaps between the
 * selected sections so they're equal, keeping the outer edges fixed (the classic
 * "distribute horizontally"). It works per band — base, upper and tall rows are
 * independent along the wall — so a mixed selection evens each row on its own.
 */
import type { SelectionCommandDef, SelectionCommandResult } from '../types';
import type { WallElement, Zone } from '../../types';

/** Bucket the selected elements by their vertical band (each row spreads on its own). */
function byZone(elements: WallElement[]): Map<Zone, WallElement[]> {
  const groups = new Map<Zone, WallElement[]>();
  for (const e of elements) {
    const g = groups.get(e.zone);
    if (g) g.push(e);
    else groups.set(e.zone, [e]);
  }
  return groups;
}

export const spreadEvenly: SelectionCommandDef = {
  id: 'spread-evenly',
  label: 'Spread evenly',
  description: 'Even out the gaps between the selected sections (the outer edges stay put).',
  minElements: 2,
  // Nothing to do unless some band holds at least two of the selected sections.
  enabledFor: ({ elements }) => [...byZone(elements).values()].some((g) => g.length >= 2),
  run: ({ elements }): SelectionCommandResult => {
    const patches: { id: string; patch: Partial<WallElement> }[] = [];
    for (const group of byZone(elements).values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => a.xIn - b.xIn);
      const left = sorted[0].xIn;
      const last = sorted[sorted.length - 1];
      const right = last.xIn + last.widthIn;
      const totalW = sorted.reduce((s, e) => s + e.widthIn, 0);
      // Share the leftover span equally between the sections; never negative
      // (a packed/overlapping row just abuts edge-to-edge).
      const gap = Math.max(0, (right - left - totalW) / (sorted.length - 1));
      let cursor = left;
      for (const e of sorted) {
        patches.push({ id: e.id, patch: { xIn: cursor } });
        cursor += e.widthIn + gap;
      }
    }
    return { elements: patches };
  },
};

export const stretchEvenly: SelectionCommandDef = {
  id: 'stretch-evenly',
  label: 'Stretch evenly',
  description: 'Resize the selected sections to equal widths that fill their span edge-to-edge (the outer edges stay put).',
  minElements: 2,
  // Same gate as spread: a band needs at least two selected sections to act on.
  enabledFor: ({ elements }) => [...byZone(elements).values()].some((g) => g.length >= 2),
  run: ({ elements }): SelectionCommandResult => {
    const patches: { id: string; patch: Partial<WallElement> }[] = [];
    for (const group of byZone(elements).values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => a.xIn - b.xIn);
      const left = sorted[0].xIn;
      const last = sorted[sorted.length - 1];
      const right = last.xIn + last.widthIn;
      // Divide the occupied span into equal widths, packed edge-to-edge. Width
      // clamps (min cabinet / appliance stock sizes) are enforced by the store.
      const w = (right - left) / sorted.length;
      let cursor = left;
      for (const e of sorted) {
        patches.push({ id: e.id, patch: { xIn: cursor, widthIn: w } });
        cursor += w;
      }
    }
    return { elements: patches };
  },
};

export const builtinSelectionCommands: SelectionCommandDef[] = [spreadEvenly, stretchEvenly];
