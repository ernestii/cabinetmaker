import { useMemo, useState } from 'react';
import { Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { buildCutList } from '../../domain/cutlist/collectParts';
import { buildAssembly, type CabinetAssembly } from '../../domain/assembly/steps';
import { feetInches, toFraction } from '../../domain/format';
import { useStore } from '../../state/store';
import { Section } from './Section';
import { MaterialSection } from './MaterialSection';
import { PageToc } from '../components/PageToc';
import { PageHeader } from '../components/PageHeader';

/**
 * The cutting plan, organized the way the material gets cut: per sheet type,
 * then per individual sheet (diagram + that sheet's parts + cut sequence — one
 * printed page per physical sheet). Money lives on the Shopping tab.
 */
export function CutList() {
  const project = useStore((s) => s.project);
  const updateProject = useStore((s) => s.updateProject);
  const cut = useMemo(() => buildCutList(project), [project]);

  // Part id → the cabinet it belongs to (with cabinet-local 3D nodes), powering
  // the hover "where does this piece go" preview on the sheet diagrams.
  const assemblyForPart = useMemo(() => {
    const byPart = new Map<string, CabinetAssembly>();
    for (const a of buildAssembly(project)) {
      if (!a.nodes.length) continue;
      for (const p of a.parts) byPart.set(p.id, a);
    }
    return (partId: string) => byPart.get(partId);
  }, [project]);

  const counterMat = project.materials.find((m) => m.roles?.includes('counter'));
  const slabLen = counterMat?.sheetH ?? 96;
  const hasCounter = cut.linearStock.length > 0;
  const totalParts = cut.groups.reduce((s, g) => s + g.parts.reduce((a, p) => a + p.qty, 0), 0);
  const totalSlabs = cut.linearStock.reduce((s, p) => s + Math.max(1, Math.ceil(p.lIn / slabLen)) * p.qty, 0);
  const projectName = project.name || 'Cabinetmaker';

  const straight = !!project.defaults.straightCuts;
  // What straight-through cutting costs in extra sheets, summed across materials
  // (negative deltas are materials where the straight layout is already tighter).
  const straightDelta = cut.groups.reduce((s, g) => s + Math.max(0, g.nesting?.straightCutsCostSheets ?? 0), 0);
  const deltaText = straightDelta > 0 ? `+${straightDelta} sheet${straightDelta === 1 ? '' : 's'}` : 'no extra sheets';

  // All sections start open (so the page reads top-to-bottom and prints whole).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => !collapsed[id];
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  // Generate the cut-list PDF. The renderer (@react-pdf/renderer) is heavy and
  // only needed here, so it's pulled in with a dynamic import on click.
  const [exportingPdf, setExportingPdf] = useState(false);
  const onExportPdf = async () => {
    setExportingPdf(true);
    try {
      const { exportCutListPdf } = await import('./pdf/exportCutListPdf');
      await exportCutListPdf(project);
    } catch (err) {
      console.error('Cut-list PDF export failed', err);
      notifications.show({ color: 'red', title: 'PDF export failed', message: 'Could not generate the cut-list PDF.' });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="cutlist pad">
      <PageHeader
        title="Cut list"
        subtitle={totalParts === 0
          ? 'Nothing to cut yet'
          : 'Organised by sheet — one printed page per physical sheet · costs live on the Shopping tab'}
        onPrint={totalParts > 0 ? () => window.print() : undefined}
        onExportPdf={totalParts > 0 ? onExportPdf : undefined}
        exportingPdf={exportingPdf}
      />

      <div className="cut-summary">
        <div className="stat"><Text component="span" fz={24} fw={700} c="brand.4">{cut.totalSheets}</Text><span>sheets</span></div>
        <div className="stat"><Text component="span" fz={24} fw={700} c="brand.4">{totalParts}</Text><span>parts</span></div>
        <div className="stat"><Text component="span" fz={24} fw={700} c="brand.4">{feetInches(cut.totalBandingIn)}</Text><span>edge banding</span></div>
      </div>

      <div className="cut-mode">
        <Switch
          size="md" color="brand"
          label="Straight-through cuts"
          checked={straight}
          onChange={(e) => { const v = e.currentTarget.checked; updateProject((p) => { p.defaults.straightCuts = v; }); }}
        />
        <Text component="p" c="dark.1" fz="xs" m={0}>
          {straight
            ? `Every cut runs straight across the sheet — rip into rows, then crosscut. Each sheet below gets a numbered cut sequence. Costs ${deltaText} vs the densest layout.`
            : `Densest layout — some cuts aren't straight-through, so there's no simple cut order. Turn on for saw-friendly cutting (${deltaText}).`}
        </Text>
        <span className="print-only">Straight-through cuts: {straight ? 'ON — all measurements below assume rip-then-crosscut.' : 'off (dense layout).'}</span>
      </div>

      <div className="report-layout">
      {/* Materials (top level) with their physical sheets as sub-items. The
          section titles aren't headings (they live inside collapse buttons),
          so the spy gets explicit depth/value resolvers. */}
      {cut.groups.length > 0 && (
        <PageToc
          selector=".cut-main .cut-section-title, .cut-main .sheet-card-head strong"
          getDepth={(el) => (el.classList.contains('cut-section-title') ? 2 : 3)}
          dataKey={cut}
        />
      )}
      <div className="cut-main">
      {cut.groups.map((g) => (
        <MaterialSection key={g.material.id} group={g} projectName={projectName} assemblyForPart={assemblyForPart}
          open={isOpen(`cut-${g.material.id}`)} onToggle={() => toggle(`cut-${g.material.id}`)} />
      ))}

      {hasCounter && (
        <Section id="cut-counter" title="Countertops"
          meta={`${totalSlabs} slab${totalSlabs === 1 ? '' : 's'}`}
          open={isOpen('cut-counter')} onToggle={() => toggle('cut-counter')}>
          <Text c="dark.1" fz="xs">
            {counterMat ? `${counterMat.name} — ` : ''}cut to length from {toFraction(slabLen)} slabs. A run longer than one slab is split across slabs (joined on site).
          </Text>
          <table className="parts-table">
            <thead><tr><th>ID</th><th>Run</th><th>Depth</th><th>Length</th><th>Thick</th><th>Slabs</th><th>Notes</th></tr></thead>
            <tbody>
              {cut.linearStock.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.id}</td><td>{p.label}</td>
                  <td>{toFraction(p.wIn)}</td><td>{toFraction(p.lIn)}</td><td>{toFraction(p.thicknessIn)}</td>
                  <td>{Math.max(1, Math.ceil(p.lIn / slabLen)) * p.qty}</td>
                  <td className="small">{p.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      </div>
      </div>
    </div>
  );
}
