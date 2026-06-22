/**
 * Gridfinity drawer — the reference single-file plugin.
 *
 * One module wires into every engine seam through the plugin API:
 *  1) geometry/cut list — reuses the stock drawer build, then overlays the 42 mm
 *     bin grid, computing its own dimensions from the carcass interior;
 *  2) Inspector — declares the standard drawer controls PLUS its own settings
 *     (bin height, show/hide bins) via `fields`, stored in `Opening.settings`;
 *  3) a command — "Fill bank with gridfinity drawers" generates a suggested
 *     layout for the whole cabinet;
 *  4) the 3D viewer — each baseplate carries a capacity `badge` and a hover
 *     `tooltip`, and the bins slide with the drawer.
 *
 * Nothing here is special-cased by the core; it's exactly what a third-party
 * plugin would register.
 */
import type { Opening } from '../../types';
import type { FrontCommandContext, FrontCommandResult, FrontTypeDef, FrontTypeHardware } from '../types';
import { BOTTOM_GROOVE_UP, GRIDFINITY_CELL_IN, GRIDFINITY_UNIT_IN, MM_PER_INCH } from '../../constants';
import {
  buildDrawer,
  drawerBoxHeight,
  drawerPanels,
  resolveSlideLength,
  type DrawerSpec,
} from '../../geometry/drawerBox';
import { handleHardware } from '../../geometry/handles';
import { doorStyleField, handleField, slideField } from '../fields';
import { drawerFront } from './frontTypes';

const BIN_COLOR = '#6b7785';
const BASEPLATE_COLOR = '#3f4651';
/** Above this cell count we draw only the baseplate (cells would flood the scene). */
const MAX_BIN_CELLS = 240;
/** Bin-height options the Inspector offers (in gridfinity 7 mm units). */
const BIN_HEIGHT_OPTS = [1, 2, 3, 4, 5, 6].map((u) => ({ value: String(u), label: `${u}u` }));
/** Largest square baseplate the user's printer bed can produce, in 42mm units. */
const PLATE_OPTS = [4, 5, 6, 7, 8].map((u) => ({ value: String(u), label: `${u}×${u}` }));

/** Capacity of the gridfinity grid that fits the drawer interior: cols × rows × units. */
function gridfinityCapacity(
  cabinetWidthIn: number,
  carcassThicknessIn: number,
  spec: DrawerSpec,
  slideLenIn: number,
  boxHeightIn: number,
): { cols: number; rows: number; units: number } {
  const panels = drawerPanels(cabinetWidthIn, carcassThicknessIn, slideLenIn, boxHeightIn, spec);
  const usableHeight = boxHeightIn - BOTTOM_GROOVE_UP; // above the captured bottom
  return {
    cols: Math.max(0, Math.floor(panels.interiorWidthIn / GRIDFINITY_CELL_IN)),
    rows: Math.max(0, Math.floor(panels.interiorDepthIn / GRIDFINITY_CELL_IN)),
    units: Math.max(0, Math.floor(usableHeight / GRIDFINITY_UNIT_IN)),
  };
}

/** Read this front's gridfinity settings off its `Opening.settings` bag. */
function gridSettings(opening: Opening): { binHeightU: number; showBins: boolean; maxPlateU: number } {
  const s = opening.settings ?? {};
  const binHeightU = Math.min(6, Math.max(1, Number(s.binHeightU ?? 3)));
  const showBins = s.showBins == null ? true : !!s.showBins;
  const maxPlateU = Math.min(8, Math.max(2, Number(s.maxPlateU ?? 6)));
  return { binHeightU, showBins, maxPlateU };
}

export const gridfinityDrawer: FrontTypeDef = {
  id: 'gridfinity-drawer',
  label: 'Gridfinity drawer',
  opens: 'drawer',
  // Stock drawer controls + gridfinity's own settings (stored in Opening.settings).
  fields: [
    slideField(),
    handleField('drawer'),
    doorStyleField(),
    { target: 'setting:binHeightU', label: 'Bin height', kind: 'select', default: '3', width: 84, options: BIN_HEIGHT_OPTS },
    { target: 'setting:maxPlateU', label: 'Max baseplate', kind: 'select', default: '6', width: 84, options: PLATE_OPTS },
    { target: 'setting:showBins', label: 'Show bins', kind: 'toggle', default: true },
  ],
  commands: [
    {
      id: 'fill-bank',
      label: 'Fill bank with gridfinity drawers',
      description: 'Replace this cabinet’s fronts with an even stack of gridfinity drawers.',
      run: fillBank,
    },
  ],
  build({ ctx, f, item, ordinal }): FrontTypeHardware {
    // Reuse the stock drawer so the box, face, slides, handle and hardware are
    // identical — gridfinity only adds the bin overlay on top.
    buildDrawer(ctx, f, item, ordinal);

    const { widthIn: W, depthIn: D, index, c } = ctx;
    const { binHeightU, showBins } = gridSettings(item.opening);
    const spec: DrawerSpec = {
      joint: c.drawerJoint,
      slideType: c.slideType,
      drawerThicknessIn: c.drawerThicknessIn,
      dadoDepthIn: c.dadoDepthIn,
    };
    const slideLen = resolveSlideLength(D, item.opening.drawer?.slideLenIn);
    const boxHeight = drawerBoxHeight(item);
    const { cols, rows, units } = gridfinityCapacity(W, c.carcassThicknessIn, spec, slideLen, boxHeight);
    const capacity = `${cols}×${rows}×${units}u`;

    // Match buildDrawer's frame so the bins line up with (and slide with) the box.
    const cx = W / 2;
    const cy = (item.topY + item.bottomY) / 2;
    const cz = D - slideLen / 2;
    const bottomTopY = cy - boxHeight / 2 + BOTTOM_GROOVE_UP + c.drawerBottomThicknessIn; // floor the bins sit on
    const open = { id: `C${index}-DR${ordinal}-FACE`, kind: 'drawer' as const, travel: slideLen };

    // Baseplate spanning the bin footprint, carrying the capacity badge + tooltip.
    const gridW = cols * GRIDFINITY_CELL_IN;
    const gridD = rows * GRIDFINITY_CELL_IN;
    f.node({
      pos: [cx, bottomTopY + 0.1, cz],
      size: [Math.max(gridW, 0.1), 0.2, Math.max(gridD, 0.1)],
      color: BASEPLATE_COLOR,
      kind: 'drawerBox',
      open,
      badge: capacity,
      tooltip: `Gridfinity ${cols}×${rows} grid · ${cols * rows} bins · ${units}u deep`,
    });

    // One short open-bin box per cell — but only when shown and the count is sane.
    if (showBins && cols > 0 && rows > 0 && cols * rows <= MAX_BIN_CELLS) {
      const binH = Math.min(boxHeight - BOTTOM_GROOVE_UP, GRIDFINITY_UNIT_IN * binHeightU);
      const cell = GRIDFINITY_CELL_IN;
      const x0 = cx - gridW / 2 + cell / 2;
      const z0 = cz - gridD / 2 + cell / 2;
      const binSize: [number, number, number] = [cell * 0.94, binH, cell * 0.94];
      const binY = bottomTopY + binH / 2;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          f.node({ pos: [x0 + i * cell, binY, z0 + j * cell], size: binSize, color: BIN_COLOR, kind: 'drawerBox', open });
        }
      }
    }

    const h = handleHardware(item.opening, 1, ctx.drawerHandle);
    return { hinges: 0, slidePairs: 1, pulls: h.pulls, pushLatches: h.pushLatches };
  },
  steps(c) {
    const base = drawerFront.steps ? drawerFront.steps(c) : [];
    // Recompute the grid exactly like `build` so the print list always matches
    // the model, then decompose it into printable baseplate chunks (≤6×6 — the
    // common print-bed limit for 42mm cells).
    const spec: DrawerSpec = {
      joint: c.c.drawerJoint,
      slideType: c.c.slideType,
      drawerThicknessIn: c.c.drawerThicknessIn,
      dadoDepthIn: c.c.dadoDepthIn,
    };
    const slideLen = resolveSlideLength(c.depthIn, c.item.opening.drawer?.slideLenIn);
    const boxHeight = drawerBoxHeight(c.item);
    const { maxPlateU } = gridSettings(c.item.opening);
    const { cols, rows } = gridfinityCapacity(c.widthIn, c.c.carcassThicknessIn, spec, slideLen, boxHeight);
    const panels = drawerPanels(c.widthIn, c.c.carcassThicknessIn, slideLen, boxHeight, spec);

    const partIds = [`C${c.index}-DR${c.ordinal}-BOT`];
    if (cols <= 0 || rows <= 0) {
      return [...base, {
        phase: 'boxes', group: 'Gridfinity', openingId: c.item.opening.id,
        text: `Drop a gridfinity baseplate into drawer ${c.ordinal} and load 42 mm bins to suit.`,
        partIds,
      }];
    }

    // Split each axis into printable pieces (≤ the printer's max plate size);
    // the cartesian product is the plate list.
    const chunk = (n: number) => { const out: number[] = []; while (n > 0) { const k = Math.min(maxPlateU, n); out.push(k); n -= k; } return out; };
    const plates = new Map<string, number>();
    for (const a of chunk(cols)) for (const b of chunk(rows)) {
      const key = `${Math.max(a, b)}×${Math.min(a, b)}`;
      plates.set(key, (plates.get(key) ?? 0) + 1);
    }
    const tableRows: string[][] = [...plates].map(([k, n]) => [`${k} baseplate`, `${n}`]);
    // Only suggest spacers on an axis with real slack (≤2mm is a friction fit).
    const spareW = Math.round((panels.interiorWidthIn - cols * GRIDFINITY_CELL_IN) * MM_PER_INCH);
    const spareD = Math.round((panels.interiorDepthIn - rows * GRIDFINITY_CELL_IN) * MM_PER_INCH);
    if (spareW > 2) tableRows.push([`~${Math.floor(spareW / 2)}mm spacer strip — across`, '2']);
    if (spareD > 2) tableRows.push([`~${Math.floor(spareD / 2)}mm spacer strip — deep`, '2']);

    return [
      ...base,
      {
        phase: 'boxes',
        group: 'Gridfinity',
        openingId: c.item.opening.id,
        text: `Drawer ${c.ordinal} — ${cols}×${rows} grid of 42mm cells${spareW > 2 || spareD > 2 ? ` (leftover ≈ ${spareW}mm × ${spareD}mm)` : ''}. Print and drop in:`,
        table: { head: ['Print', 'Qty'], rows: tableRows },
        partIds,
      },
    ];
  },
};

/**
 * Suggest a layout: fill the whole cabinet with an even stack of gridfinity
 * drawers (~7" tall each), carrying over this front's slide + handle so the bank
 * stays consistent. Returns the new front list for the engine to apply.
 */
function fillBank(ctx: FrontCommandContext): FrontCommandResult {
  const count = Math.min(6, Math.max(2, Math.round(ctx.carcassHeightIn / 7)));
  const front: Opening[] = Array.from({ length: count }, () => {
    const op: Opening = { id: ctx.newId('op'), type: 'gridfinity-drawer', heightIn: 'auto' };
    if (ctx.opening.handle) op.handle = ctx.opening.handle;
    if (ctx.opening.drawer?.slideLenIn) op.drawer = { slideLenIn: ctx.opening.drawer.slideLenIn };
    if (ctx.opening.doorStyle) op.doorStyle = ctx.opening.doorStyle;
    return op;
  });
  return { front };
}
