import type { Edge, Material, Part, Project } from '../types';
import { buildProject } from '../geometry/buildProject';
import { nestParts, type MaterialNesting, type PackedSheet } from './nesting';
import { totalBandingLength } from './edgeBanding';
import { DEFAULT_KERF, SHEET_H, SHEET_W, SNAP_DENOM } from '../constants';
import { snapTo } from '../format';

export interface MaterialGroup {
  material: Material | { id: string; name: string };
  parts: Part[];
  nesting?: MaterialNesting;
  bandingIn: number;
  sheetCount: number;
}

export interface CutList {
  groups: MaterialGroup[];
  /** counter slabs etc. that aren't nested on plywood */
  linearStock: Part[];
  totalSheets: number;
  totalBandingIn: number;
}

/** One row of a per-sheet parts table: a part's placements on that sheet rolled up. */
export interface SheetPartRow {
  partId: string;
  label: string;
  /** Finished cut dims from the Part record (not the possibly-rotated placement footprint). */
  wIn: number;
  lIn: number;
  thicknessIn: number;
  qtyOnSheet: number;
  /** How many of this part's placements on this sheet are rotated 90°. */
  rotatedOnSheet: number;
  edgeBandEdges: Edge[];
  notes?: string;
}

/** Join a packed sheet's placements back to their Part records, one row per part id. */
export function summarizeSheetParts(sheet: PackedSheet, parts: Part[]): SheetPartRow[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const rows = new Map<string, SheetPartRow>();
  for (const pl of sheet.placements) {
    let row = rows.get(pl.partId);
    if (!row) {
      const part = byId.get(pl.partId);
      row = {
        partId: pl.partId,
        label: part?.label ?? pl.label,
        wIn: part ? part.wIn : pl.rotated ? pl.h : pl.w,
        lIn: part ? part.lIn : pl.rotated ? pl.w : pl.h,
        thicknessIn: part?.thicknessIn ?? 0,
        qtyOnSheet: 0,
        rotatedOnSheet: 0,
        edgeBandEdges: part?.edgeBandEdges ?? [],
        notes: part?.notes,
      };
      rows.set(pl.partId, row);
    }
    row.qtyOnSheet += 1;
    if (pl.rotated) row.rotatedOnSheet += 1;
  }
  return [...rows.values()].sort((a, b) => a.partId.localeCompare(b.partId, undefined, { numeric: true }));
}

export function buildCutList(project: Project): CutList {
  const { parts: rawParts } = buildProject(project);
  // Quantise every cut dimension to the 1/16" grid so the printed list *is* the
  // build — no sub-1/16" values hiding behind display-only rounding.
  const parts = rawParts.map((p) => ({
    ...p,
    wIn: snapTo(p.wIn, SNAP_DENOM),
    lIn: snapTo(p.lIn, SNAP_DENOM),
  }));
  const byId = new Map(project.materials.map((m) => [m.id, m]));

  const byMaterial = new Map<string, Part[]>();
  const linearStock: Part[] = [];
  for (const p of parts) {
    if (p.role === 'counter') {
      linearStock.push(p);
      continue;
    }
    const key = p.materialId;
    if (!byMaterial.has(key)) byMaterial.set(key, []);
    byMaterial.get(key)!.push(p);
  }

  const groups: MaterialGroup[] = [];
  let totalSheets = 0;
  let totalBandingIn = 0;

  for (const [matId, mParts] of byMaterial) {
    const mat = byId.get(matId);
    const sheetW = mat?.sheetW ?? SHEET_W;
    const sheetH = mat?.sheetH ?? SHEET_H;
    const kerf = mat?.kerfIn ?? DEFAULT_KERF;
    // Trim the factory edge off all four sides; parts nest in the usable area.
    const trim = mat?.edgeTrimIn ?? 0;
    const nesting = nestParts(mParts, sheetW - 2 * trim, sheetH - 2 * trim, kerf, project.defaults.straightCuts);
    nesting.materialId = matId;
    const banding = totalBandingLength(mParts);
    totalSheets += nesting.sheets.length;
    totalBandingIn += banding;
    groups.push({
      material: mat ?? { id: matId, name: matId },
      parts: mParts.slice().sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
      nesting,
      bandingIn: banding,
      sheetCount: nesting.sheets.length,
    });
  }

  groups.sort((a, b) => a.material.name.localeCompare(b.material.name));

  return { groups, linearStock, totalSheets, totalBandingIn };
}
