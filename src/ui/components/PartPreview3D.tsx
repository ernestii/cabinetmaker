import { Suspense, lazy, useMemo } from 'react';
import { Paper } from '@mantine/core';
import type { CabinetAssembly } from '../../domain/assembly/steps';

// Same lazy seam as the Assembly page: three.js stays out of the page bundle
// until a part is actually hovered.
const Figure3D = lazy(() => import('../Assembly/Figure3D').then((m) => ({ default: m.Figure3D })));

const W = 300;
const H = 290; // approximate card height, for viewport clamping

/**
 * Hover preview for a cut piece: the owning cabinet rendered like an Assembly
 * figure, with the hovered part glowing and everything else ghosted — "this is
 * where the piece you're about to cut goes".
 */
export function PartPreview3D({ assembly, partId, x, y }: {
  assembly: CabinetAssembly; partId: string; x: number; y: number;
}) {
  const highlight = useMemo(() => new Set([partId]), [partId]);
  const part = assembly.parts.find((p) => p.id === partId);
  const left = Math.min(x + 14, window.innerWidth - W - 12);
  const top = Math.max(12, Math.min(y - H / 2, window.innerHeight - H - 12));
  return (
    <Paper className="cut-part-pop" shadow="md" withBorder style={{ left, top, width: W }}>
      <div className="cut-part-pop-head">
        <span className="mono">{partId}</span>
        {part ? ` — ${part.label}` : ''}
        <span className="cut-part-pop-cab">{assembly.title}</span>
      </div>
      <Suspense fallback={<div className="fig3d-placeholder">Loading 3D…</div>}>
        <Figure3D nodes={assembly.nodes} explode={0} highlightPartIds={highlight} label={partId} />
      </Suspense>
    </Paper>
  );
}
