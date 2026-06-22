import { useMemo, useState } from 'react';
import { Badge } from '@mantine/core';
import { summarizeSheetParts } from '../../domain/cutlist/collectParts';
import type { PackedSheet } from '../../domain/cutlist/nesting';
import type { CabinetAssembly } from '../../domain/assembly/steps';
import type { Part } from '../../domain/types';
import { toFraction } from '../../domain/format';
import { SheetDiagram } from './SheetDiagram';
import { cutStepText } from './cutSteps';
import { PartPreview3D } from '../components/PartPreview3D';

/**
 * One physical sheet, self-contained: nesting diagram, the parts cut from it,
 * and (for straight-through layouts) the ordered cut sequence. This is the
 * unit the builder prints and takes to the saw — one page per sheet. Hovering
 * a piece (diagram or table) pops a 3D preview of where it goes in its cabinet.
 */
export function SheetCard({ sheet, sheetW, sheetH, materialName, projectName, parts, count, kerfIn, trimIn, assemblyForPart }: {
  sheet: PackedSheet; sheetW: number; sheetH: number;
  materialName: string; projectName: string; parts: Part[]; count: number;
  kerfIn?: number; trimIn?: number;
  assemblyForPart?: (partId: string) => CabinetAssembly | undefined;
}) {
  const used = (sheet.usedAreaIn2 / (sheetW * sheetH)) * 100;
  const rows = useMemo(() => summarizeSheetParts(sheet, parts), [sheet, parts]);
  const cuts = sheet.cuts;
  const [hover, setHover] = useState<{ partId: string; x: number; y: number } | null>(null);
  const onPartHover = (partId: string | null, anchor?: { x: number; y: number }) =>
    setHover(partId && anchor ? { partId, ...anchor } : null);
  const hoverAssembly = hover ? assemblyForPart?.(hover.partId) : undefined;

  return (
    <div className="sheet-card">
      <div className="sheet-card-head">
        <span className="print-only">{projectName} — {materialName} — </span>
        <strong>{`Sheet ${sheet.index} of ${count}`}</strong>
        <span className="sheet-card-meta">{toFraction(sheetW)} × {toFraction(sheetH)} · {used.toFixed(0)}% used</span>
      </div>
      <div className="sheet-card-grid">
        <SheetDiagram sheet={sheet} sheetW={sheetW} sheetH={sheetH} kerfIn={kerfIn} trimIn={trimIn}
          onPartHover={assemblyForPart ? onPartHover : undefined} />
        <div className="sheet-card-info">
          <table className="parts-table sheet-table">
            <thead>
              <tr><th>ID</th><th>Part</th><th>W</th><th>L</th><th>Qty</th><th>Band</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partId}
                  onMouseEnter={assemblyForPart ? (e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    onPartHover(r.partId, { x: e.clientX, y: rect.top + rect.height / 2 });
                  } : undefined}
                  onMouseLeave={assemblyForPart ? () => onPartHover(null) : undefined}
                >
                  <td className="mono">{r.partId}</td>
                  <td>{r.label}</td>
                  <td>{toFraction(r.wIn)}</td>
                  <td>{toFraction(r.lIn)}</td>
                  <td>{r.qtyOnSheet}</td>
                  <td>{r.edgeBandEdges.length || ''}</td>
                  <td className="small">
                    {[r.notes, r.rotatedOnSheet > 0 ? `⟳ placed rotated on the sheet (${r.rotatedOnSheet})` : '']
                      .filter(Boolean).join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cuts && cuts.length > 0 && (
            <div className="cut-steps-wrap">
              <div className="cut-steps-title">Cut sequence</div>
              <ol className="cut-steps">
                {cuts.map((c) => (
                  <li key={c.order}>
                    {/* Same red as the badge on the diagram — the numbers pair up. */}
                    <Badge size="sm" circle color="#b3402e" className="cut-num">{c.order}</Badge>
                    <span>{cutStepText(c)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
      {hover && hoverAssembly && hoverAssembly.nodes.length > 0 && (
        <PartPreview3D assembly={hoverAssembly} partId={hover.partId} x={hover.x} y={hover.y} />
      )}
    </div>
  );
}
