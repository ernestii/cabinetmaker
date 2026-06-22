import { useState } from 'react';
import { Alert, ColorSwatch, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { MaterialGroup } from '../../domain/cutlist/collectParts';
import type { CabinetAssembly } from '../../domain/assembly/steps';
import type { Material } from '../../domain/types';
import { feetInches, toFraction } from '../../domain/format';
import { useStore } from '../../state/store';
import { InchInput } from '../components/InchInput';
import { Caret, Section } from './Section';
import { SheetCard } from './SheetCard';

/**
 * One sheet material: inline cutting settings (kerf / edge trim — the same
 * store fields the Materials tab edits, so changes re-nest live), then one
 * self-contained SheetCard per packed sheet, then a collapsed master table of
 * every part in the material (the only complete record — per-sheet tables
 * split quantities, and oversize parts appear on no sheet).
 */
export function MaterialSection({ group, projectName, open, onToggle, assemblyForPart }: {
  group: MaterialGroup; projectName: string; open: boolean; onToggle: () => void;
  assemblyForPart?: (partId: string) => CabinetAssembly | undefined;
}) {
  const updateProject = useStore((s) => s.updateProject);
  const mat: Material | undefined = 'kerfIn' in group.material ? group.material : undefined;
  const nesting = group.nesting;
  const [partsOpen, setPartsOpen] = useState(false);

  const setMat = (patch: Partial<Material>) => {
    if (!mat) return;
    updateProject((p) => {
      const m = p.materials.find((x) => x.id === mat.id);
      if (m) Object.assign(m, patch);
    });
  };

  const id = `cut-${group.material.id}`;
  const meta = `${group.sheetCount} sheet${group.sheetCount === 1 ? '' : 's'}` +
    (group.bandingIn > 0 ? ` · banding ${feetInches(group.bandingIn)}` : '') +
    (nesting ? ` · ${(nesting.wasteFraction * 100).toFixed(0)}% waste` : '') +
    (nesting ? ` · ${nesting.straightCuts ? 'straight cuts' : 'dense layout'}` : '');
  const totalPieces = group.parts.reduce((s, p) => s + p.qty, 0);
  const trim = mat?.edgeTrimIn ?? 0;

  return (
    <Section id={id}
      title={<span className="cut-mat-title">{mat && <ColorSwatch color={mat.color} size={12} />} {group.material.name}</span>}
      meta={meta} open={open} onToggle={onToggle}>

      {mat && nesting && (
        <div className="cut-mat-settings">
          <label>
            <span>Saw kerf</span>
            <InchInput value={mat.kerfIn} step={1 / 16} w={64} onCommit={(v) => setMat({ kerfIn: v })} />
          </label>
          <label>
            <span>Edge trim</span>
            <InchInput value={mat.edgeTrimIn ?? 0} step={1 / 16} w={64} onCommit={(v) => setMat({ edgeTrimIn: v })} />
          </label>
          <Text component="span" c="dark.1" fz="xs" className="cut-mat-readout">
            Sheet {toFraction(mat.sheetW)} × {toFraction(mat.sheetH)}
            {trim > 0 ? ` → usable ${toFraction(nesting.sheetW)} × ${toFraction(nesting.sheetH)} after ${toFraction(trim)} edge trim` : ''}
            {` · ${toFraction(mat.thicknessIn)} thick`}
          </Text>
        </div>
      )}

      {nesting && nesting.oversize.length > 0 && (
        <Alert color="brand" variant="light" my={8} icon={<IconAlertTriangle size={16} />}>
          Oversize (won't fit a sheet): {nesting.oversize.map((o) => `${o.partId} (${toFraction(o.wIn)}×${toFraction(o.lIn)})`).join(', ')}
        </Alert>
      )}

      {nesting && nesting.sheets.map((s) => (
        <SheetCard key={s.index} sheet={s} sheetW={nesting.sheetW} sheetH={nesting.sheetH}
          materialName={group.material.name} projectName={projectName}
          parts={group.parts} count={nesting.sheets.length}
          kerfIn={mat?.kerfIn} trimIn={mat?.edgeTrimIn ?? 0} assemblyForPart={assemblyForPart} />
      ))}

      <div className="cut-allparts">
        <button type="button" className="cut-allparts-head" onClick={() => setPartsOpen((v) => !v)} aria-expanded={partsOpen}>
          <Caret open={partsOpen} />
          <span>All parts — {totalPieces} pc{totalPieces === 1 ? '' : 's'}</span>
        </button>
        {/* Mounted-hidden like the sections, so print always gets the full table. */}
        <div className={`cut-section-body${partsOpen ? '' : ' collapsed'}`}>
          <table className="parts-table">
            <thead>
              <tr><th>ID</th><th>Part</th><th>W</th><th>L</th><th>Qty</th><th>Thick</th><th>Band</th><th>Joinery</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {group.parts.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.id}</td>
                  <td>{p.label}</td>
                  <td>{toFraction(p.wIn)}</td>
                  <td>{toFraction(p.lIn)}</td>
                  <td>{p.qty}</td>
                  <td>{toFraction(p.thicknessIn)}</td>
                  <td>{p.edgeBandEdges.length || ''}</td>
                  <td className="small">{p.joinery.join(', ')}</td>
                  <td className="small">{p.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}
