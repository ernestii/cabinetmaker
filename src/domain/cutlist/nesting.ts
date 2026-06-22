import type { Part } from '../types';

export interface Placement {
  partId: string;
  label: string;
  /** position on the sheet, origin top-left, inches */
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  /** Strip this part sits in (shelf-packed layouts only). */
  shelfIndex?: number;
}

export type CutKind = 'rip' | 'crosscut' | 'trim';

export interface CutStep {
  /** 1-based execution order within the sheet (the array is already sorted in this order). */
  order: number;
  kind: CutKind;
  /**
   * Cut-line position in sheet coordinates (same frame as Placement, origin top-left):
   * rip/trim — distance from the sheet's TOP edge; crosscut — distance from the LEFT
   * edge. The blade consumes [posIn, posIn + kerf].
   */
  posIn: number;
  /** Dimension of the piece this cut produces — the fence setting. */
  sizeIn: number;
  /**
   * Extent of the cut line along its own axis: a rip spans the full sheet width,
   * a crosscut spans its strip's y-band, a trim spans the freed piece's x-range.
   * Lets a diagram draw the line without re-deriving geometry.
   */
  spanIn: [number, number];
  /** 0-based strip index, top to bottom. Rip i separates strip i from what's below it. */
  shelfIndex: number;
  /** The part freed by a crosscut / sized by a trim. Absent on rips. */
  partId?: string;
  label?: string;
}

export interface ShelfInfo {
  /** 0-based, top to bottom. */
  index: number;
  /** top edge in sheet coords */
  yIn: number;
  /** strip height (the rip fence setting) */
  heightIn: number;
}

export interface PackedSheet {
  index: number;
  placements: Placement[];
  usedAreaIn2: number;
  /** Ordered guillotine cut sequence — only present for shelf-packed (straight-cut) layouts. */
  cuts?: CutStep[];
  /** Strip structure — only present for shelf-packed layouts. */
  shelves?: ShelfInfo[];
}

export interface MaterialNesting {
  materialId: string;
  sheetW: number;
  sheetH: number;
  sheets: PackedSheet[];
  oversize: { partId: string; label: string; wIn: number; lIn: number }[];
  totalAreaIn2: number;
  wasteFraction: number;
  /** True when the chosen layout is guillotine (straight-through) cuttable. */
  straightCuts: boolean;
  /** Extra sheets the straight-cut layout costs vs the dense one (0 = free, may be negative). */
  straightCutsCostSheets: number;
}

interface Rect { x: number; y: number; w: number; h: number; }
interface Item { partId: string; label: string; w: number; l: number; grainLocked: boolean; }
interface Bin { free: Rect[]; placements: Placement[]; usedAreaIn2: number; }
interface PackResult { sheets: PackedSheet[]; usedAreaIn2: number; }

function contains(a: Rect, b: Rect): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}

/** MaxRects split of a free rect around a used rect (y grows downward). */
function splitFree(free: Rect, used: Rect): Rect[] {
  if (used.x >= free.x + free.w || used.x + used.w <= free.x || used.y >= free.y + free.h || used.y + used.h <= free.y) {
    return [free];
  }
  const out: Rect[] = [];
  if (used.x > free.x) out.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
  if (used.x + used.w < free.x + free.w) out.push({ x: used.x + used.w, y: free.y, w: free.x + free.w - (used.x + used.w), h: free.h });
  if (used.y > free.y) out.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
  if (used.y + used.h < free.y + free.h) out.push({ x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - (used.y + used.h) });
  return out;
}

function prune(rects: Rect[]): Rect[] {
  const keep: Rect[] = [];
  for (let i = 0; i < rects.length; i++) {
    let contained = false;
    for (let j = 0; j < rects.length; j++) {
      if (i !== j && contains(rects[j], rects[i])) { contained = true; break; }
    }
    if (!contained && rects[i].w > 1e-6 && rects[i].h > 1e-6) keep.push(rects[i]);
  }
  return keep;
}

/** Orientations as [footprintW (along sheetW), footprintH (along sheetH), rotated]. */
function orientations(it: Item, sheetW: number, sheetH: number): [number, number, boolean][] {
  const all: [number, number, boolean][] = it.grainLocked
    ? [[it.w, it.l, false]]
    : [[it.w, it.l, false], [it.l, it.w, true]];
  return all.filter(([w, h]) => w <= sheetW + 1e-9 && h <= sheetH + 1e-9);
}

/** MaxRects best-short-side-fit: dense, but the cuts are NOT all straight-through. */
function packMaxRects(items: Item[], sheetW: number, sheetH: number, kerf: number): PackResult {
  const bins: Bin[] = [];
  const newBin = (): Bin => { const b: Bin = { free: [{ x: 0, y: 0, w: sheetW, h: sheetH }], placements: [], usedAreaIn2: 0 }; bins.push(b); return b; };

  function placeIn(bin: Bin, fx: number, fy: number, w: number, h: number, it: Item, rotated: boolean) {
    bin.placements.push({ partId: it.partId, label: it.label, x: fx, y: fy, w, h, rotated });
    bin.usedAreaIn2 += w * h;
    const used: Rect = { x: fx, y: fy, w: Math.min(w + kerf, sheetW - fx), h: Math.min(h + kerf, sheetH - fy) };
    bin.free = prune(bin.free.flatMap((f) => splitFree(f, used)));
  }

  for (const it of items) {
    let best: { bin: Bin; fx: number; fy: number; w: number; h: number; rotated: boolean; score: number } | null = null;
    for (const bin of bins) {
      for (const f of bin.free) {
        for (const [w, h, rotated] of orientations(it, sheetW, sheetH)) {
          if (w <= f.w + 1e-9 && h <= f.h + 1e-9) {
            const score = Math.min(f.w - w, f.h - h);
            if (!best || score < best.score) best = { bin, fx: f.x, fy: f.y, w, h, rotated, score };
          }
        }
      }
    }
    if (best) { placeIn(best.bin, best.fx, best.fy, best.w, best.h, it, best.rotated); continue; }
    const bin = newBin();
    const [w, h, rotated] = orientations(it, sheetW, sheetH)[0];
    placeIn(bin, 0, 0, w, h, it, rotated);
  }
  return { sheets: bins.map((b, i) => ({ index: i + 1, placements: b.placements, usedAreaIn2: b.usedAreaIn2 })), usedAreaIn2: bins.reduce((s, b) => s + b.usedAreaIn2, 0) };
}

/**
 * Shelf packer (first-fit decreasing height). Lays parts into full-width rows,
 * so the whole sheet is guillotine-cuttable: rip into shelves, then crosscut
 * each shelf into parts — every cut is straight through. Slightly looser than
 * MaxRects, so we only use it when it costs no extra sheets.
 */
function packShelf(items: Item[], sheetW: number, sheetH: number, kerf: number): PackResult {
  // Pick the orientation with the smallest height (flatter shelves pack more),
  // honouring the grain lock.
  const placed = items.map((it) => {
    const opts = orientations(it, sheetW, sheetH).slice().sort((a, b) => a[1] - b[1]);
    const [w, h, rotated] = opts[0];
    return { it, w, h, rotated };
  });
  // Tallest first so shorter parts tuck into the leftover width of earlier shelves.
  placed.sort((a, b) => b.h - a.h);

  interface Shelf { index: number; y: number; height: number; x: number; placements: Placement[]; }
  interface Sheet { shelves: Shelf[]; usedHeight: number; placements: Placement[]; usedAreaIn2: number; }
  const sheets: Sheet[] = [];

  for (const pl of placed) {
    let sheet: Sheet | undefined;
    let shelf: Shelf | undefined;
    for (const s of sheets) {
      for (const sh of s.shelves) {
        if (pl.h <= sh.height + 1e-9 && sh.x + pl.w <= sheetW + 1e-9) { sheet = s; shelf = sh; break; }
      }
      if (shelf) break;
    }
    if (!shelf) {
      sheet = sheets.find((s) => s.usedHeight + pl.h <= sheetH + 1e-9);
      if (!sheet) { sheet = { shelves: [], usedHeight: 0, placements: [], usedAreaIn2: 0 }; sheets.push(sheet); }
      shelf = { index: sheet.shelves.length, y: sheet.usedHeight, height: pl.h, x: 0, placements: [] };
      sheet.shelves.push(shelf);
      sheet.usedHeight += pl.h + kerf;
    }
    const placement: Placement = { partId: pl.it.partId, label: pl.it.label, x: shelf.x, y: shelf.y, w: pl.w, h: pl.h, rotated: pl.rotated, shelfIndex: shelf.index };
    sheet!.placements.push(placement);
    shelf.placements.push(placement);
    sheet!.usedAreaIn2 += pl.w * pl.h;
    shelf.x += pl.w + kerf;
  }
  return {
    sheets: sheets.map((s, i) => ({
      index: i + 1,
      placements: s.placements,
      usedAreaIn2: s.usedAreaIn2,
      shelves: s.shelves.map((sh) => ({ index: sh.index, yIn: sh.y, heightIn: sh.height })),
      cuts: deriveCuts(s.shelves, sheetW, sheetH, kerf),
    })),
    usedAreaIn2: sheets.reduce((s, b) => s + b.usedAreaIn2, 0),
  };
}

const EPS = 1e-6;

/**
 * Turn a sheet's shelf structure into the ordered cut sequence a builder
 * performs: full-width rips top-to-bottom (one per strip boundary) free every
 * strip first, then the crosscuts — **batched by fence width** so the stop block
 * is set once per width, not once per strip (all the 23" crosscuts, then all the
 * 22", …). A trim rip follows immediately after any crosscut that frees a piece
 * shorter than its strip. Within one strip the crosscuts still run left-to-right
 * (each works on the piece still joined to the strip's right end); only the order
 * *across* strips is reshuffled, which is free once the strips are loose.
 *
 * Positions are the part's far edge — the packer reserves the kerf just past it,
 * so the blade lands in the gap. Cuts that would only shave a sliver thinner than
 * the kerf are skipped.
 */
function deriveCuts(
  shelves: { y: number; height: number; placements: Placement[] }[],
  sheetW: number,
  sheetH: number,
  kerf: number,
): CutStep[] {
  type Step = Omit<CutStep, 'order'>;
  const rips: Step[] = [];
  shelves.forEach((s, i) => {
    const bottom = s.y + s.height;
    if (i < shelves.length - 1 || sheetH - bottom > kerf + EPS) {
      rips.push({ kind: 'rip', posIn: bottom, sizeIn: s.height, shelfIndex: i, spanIn: [0, sheetW] });
    }
  });

  // One "lane" per strip: each part's crosscut (unless it's flush with the right
  // edge) followed immediately by its trim (if it's shorter than the strip). A
  // lane stays in left-to-right order and is only ever consumed from its front.
  interface Unit { fence?: number; steps: Step[]; }
  const lanes: Unit[][] = shelves.map((s, i) =>
    s.placements.map((p, j) => {
      const steps: Step[] = [];
      const right = p.x + p.w;
      let fence: number | undefined;
      if (j < s.placements.length - 1 || sheetW - right > kerf + EPS) {
        steps.push({ kind: 'crosscut', posIn: right, sizeIn: p.w, shelfIndex: i, spanIn: [s.y, s.y + s.height], partId: p.partId, label: p.label });
        fence = p.w;
      }
      if (s.height - p.h > EPS) {
        steps.push({ kind: 'trim', posIn: s.y + p.h, sizeIn: p.h, shelfIndex: i, spanIn: [p.x, p.x + p.w], partId: p.partId, label: p.label });
      }
      return { fence, steps };
    }),
  );

  // Merge the lanes, keeping one fence setting and draining every ready part of
  // that width across all strips (re-scanning, since draining one part exposes
  // the next behind it) before switching width. A part with no crosscut (flush
  // right edge) takes any fence, so it never forces a change.
  const ptr = lanes.map(() => 0);
  const cross: Step[] = [];
  let remaining = lanes.reduce((n, l) => n + l.length, 0);
  let fence: number | undefined;
  while (remaining > 0) {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let li = 0; li < lanes.length; li++) {
        const u = lanes[li][ptr[li]];
        if (u && (u.fence === undefined || u.fence === fence)) {
          cross.push(...u.steps);
          ptr[li] += 1;
          remaining -= 1;
          progressed = true;
        }
      }
    }
    if (remaining === 0) break;
    // Pick the next width: the one the most strips are waiting on (ties → widest
    // first), so the longest batches stay together.
    const counts = new Map<number, number>();
    for (let li = 0; li < lanes.length; li++) {
      const f = lanes[li][ptr[li]]?.fence;
      if (f !== undefined) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    fence = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  }

  return [...rips, ...cross].map((c, k) => ({ ...c, order: k + 1 }));
}

/**
 * Nest parts onto sheets. Prefers a guillotine (straight-through) shelf layout
 * whenever it uses no more sheets than the dense MaxRects layout — easier to
 * cut for free. Sheet grain axis = H (length); grain-locked parts keep their
 * `lIn` along it. Kerf is reserved around each part.
 */
export function nestParts(parts: Part[], sheetW: number, sheetH: number, kerf: number, preferStraight = false): MaterialNesting {
  const all: Item[] = [];
  for (const p of parts) {
    for (let i = 0; i < p.qty; i++) all.push({ partId: p.id, label: p.label, w: p.wIn, l: p.lIn, grainLocked: p.grainLocked });
  }
  const oversize: MaterialNesting['oversize'] = [];
  const items: Item[] = [];
  for (const it of all) {
    if (orientations(it, sheetW, sheetH).length === 0) oversize.push({ partId: it.partId, label: it.label, wIn: it.w, lIn: it.l });
    else items.push(it);
  }
  // Place biggest first for the dense layout.
  const maxItems = items.slice().sort((a, b) => (Math.max(b.w, b.l) - Math.max(a.w, a.l)) || (b.w * b.l - a.w * a.l));
  const dense = packMaxRects(maxItems, sheetW, sheetH, kerf);
  const shelf = packShelf(items, sheetW, sheetH, kerf);

  // Use straight cuts whenever they're free (no extra sheet), or always when the
  // project prefers them (the builder accepts the sheet cost for easier cutting).
  const straightCuts = preferStraight || shelf.sheets.length <= dense.sheets.length;
  const chosen = straightCuts ? shelf : dense;

  const totalAreaIn2 = chosen.sheets.length * sheetW * sheetH;
  return {
    materialId: '',
    sheetW,
    sheetH,
    sheets: chosen.sheets,
    oversize,
    totalAreaIn2,
    wasteFraction: totalAreaIn2 > 0 ? 1 - chosen.usedAreaIn2 / totalAreaIn2 : 0,
    straightCuts,
    straightCutsCostSheets: shelf.sheets.length - dense.sheets.length,
  };
}
