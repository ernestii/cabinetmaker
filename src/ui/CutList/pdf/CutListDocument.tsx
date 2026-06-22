import { Document, Page, View, Text } from '@react-pdf/renderer';
import type { Project } from '../../../domain/types';
import { buildCutList, summarizeSheetParts, type MaterialGroup } from '../../../domain/cutlist/collectParts';
import { feetInches, toFraction } from '../../../domain/format';
import { cutStepText } from '../cutSteps';
import { PdfSheetDiagram } from './PdfSheetDiagram';
import { styles as s } from './styles';

/** A footer fixed to every page: project name on the left, page numbers right. */
function Footer({ projectName }: { projectName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{projectName} — cut list</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function matDims(g: MaterialGroup) {
  const m = g.material as { sheetW?: number; sheetH?: number; kerfIn?: number; edgeTrimIn?: number };
  return {
    sheetW: g.nesting?.sheetW ?? m.sheetW ?? 48,
    sheetH: g.nesting?.sheetH ?? m.sheetH ?? 96,
    kerfIn: m.kerfIn ?? 0,
    trimIn: m.edgeTrimIn ?? 0,
  };
}

/** The cover / summary page: totals, cut mode, and a per-material breakdown. */
function CoverPage({ project, cut }: { project: Project; cut: ReturnType<typeof buildCutList> }) {
  const projectName = project.name || 'Cabinetmaker';
  const totalParts = cut.groups.reduce((sum, g) => sum + g.parts.reduce((a, p) => a + p.qty, 0), 0);
  const straight = !!project.defaults.straightCuts;
  const oversize = cut.groups.flatMap((g) => g.nesting?.oversize ?? []);

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.coverTitle}>{projectName}</Text>
      <Text style={s.coverSub}>Cut list · {cut.groups.length} sheet material{cut.groups.length === 1 ? '' : 's'}</Text>

      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statNum}>{cut.totalSheets}</Text><Text style={s.statLabel}>sheets</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{totalParts}</Text><Text style={s.statLabel}>parts</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{feetInches(cut.totalBandingIn)}</Text><Text style={s.statLabel}>edge banding</Text></View>
      </View>

      <Text style={s.note}>
        {straight
          ? 'Straight-through cuts: ON — every cut runs straight across the sheet (rip into rows, then crosscut). Each sheet page has a numbered cut sequence.'
          : 'Densest layout — some cuts are not straight-through, so there is no simple cut order. Measurements are the finished part sizes.'}
      </Text>

      {oversize.length > 0 && (
        <Text style={s.warn}>
          {oversize.length} part{oversize.length === 1 ? '' : 's'} too large to nest on a sheet: {oversize.map((o) => `${o.partId} (${toFraction(o.wIn)} × ${toFraction(o.lIn)})`).join(', ')}.
        </Text>
      )}

      <Text style={s.sectionTitle}>Materials</Text>
      <View style={s.table}>
        <View style={s.trHead}>
          <Text style={[s.th, { flex: 3 }]}>Material</Text>
          <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Parts</Text>
          <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Sheets</Text>
          <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Waste</Text>
          <Text style={[s.th, { flex: 1.5, textAlign: 'right' }]}>Banding</Text>
        </View>
        {cut.groups.map((g) => (
          <View style={s.tr} key={g.material.id}>
            <Text style={[s.td, { flex: 3 }]}>{g.material.name}</Text>
            <Text style={[s.td, { flex: 1, textAlign: 'right' }]}>{g.parts.reduce((a, p) => a + p.qty, 0)}</Text>
            <Text style={[s.td, { flex: 1, textAlign: 'right' }]}>{g.sheetCount}</Text>
            <Text style={[s.td, { flex: 1, textAlign: 'right' }]}>{g.nesting ? `${Math.round(g.nesting.wasteFraction * 100)}%` : '—'}</Text>
            <Text style={[s.td, { flex: 1.5, textAlign: 'right' }]}>{feetInches(g.bandingIn)}</Text>
          </View>
        ))}
      </View>

      <Footer projectName={projectName} />
    </Page>
  );
}

/** One page per physical sheet: diagram, that sheet's parts, and the cut order. */
function SheetPage({ group, sheetIndex, projectName }: { group: MaterialGroup; sheetIndex: number; projectName: string }) {
  const sheet = group.nesting!.sheets[sheetIndex];
  const { sheetW, sheetH, kerfIn, trimIn } = matDims(group);
  const used = (sheet.usedAreaIn2 / (sheetW * sheetH)) * 100;
  const rows = summarizeSheetParts(sheet, group.parts);
  const cuts = sheet.cuts;

  return (
    <Page size="A4" style={s.page}>
      <View style={s.sheetHead}>
        <Text style={s.sheetTitle}>{group.material.name} — Sheet {sheet.index} of {group.sheetCount}</Text>
        <Text style={s.sheetMeta}>{toFraction(sheetW)} × {toFraction(sheetH)} · {used.toFixed(0)}% used</Text>
      </View>

      <View style={s.sheetBody}>
        <View style={s.diagramCol}>
          <PdfSheetDiagram sheet={sheet} sheetW={sheetW} sheetH={sheetH} kerfIn={kerfIn} trimIn={trimIn} maxW={250} maxH={640} />
        </View>

        <View style={s.infoCol}>
          <View style={s.trHead}>
            <Text style={[s.th, { flex: 2 }]}>ID</Text>
            <Text style={[s.th, { flex: 3 }]}>Part</Text>
            <Text style={[s.th, { flex: 1.6, textAlign: 'right' }]}>W</Text>
            <Text style={[s.th, { flex: 1.6, textAlign: 'right' }]}>L</Text>
            <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Qty</Text>
            <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Band</Text>
          </View>
          {rows.map((r) => (
            <View style={s.tr} key={r.partId} wrap={false}>
              <Text style={[s.td, s.mono, { flex: 2 }]}>{r.partId}</Text>
              <Text style={[s.td, { flex: 3 }]}>{r.label}{r.rotatedOnSheet > 0 ? ` (rot ×${r.rotatedOnSheet})` : ''}</Text>
              <Text style={[s.td, { flex: 1.6, textAlign: 'right' }]}>{toFraction(r.wIn)}</Text>
              <Text style={[s.td, { flex: 1.6, textAlign: 'right' }]}>{toFraction(r.lIn)}</Text>
              <Text style={[s.td, { flex: 0.8, textAlign: 'right' }]}>{r.qtyOnSheet}</Text>
              <Text style={[s.td, { flex: 0.8, textAlign: 'right' }]}>{r.edgeBandEdges.length || ''}</Text>
            </View>
          ))}

          {cuts && cuts.length > 0 && (
            <View>
              <Text style={s.cutsTitle}>Cut sequence</Text>
              {cuts.map((c) => (
                <View style={s.cutRow} key={c.order} wrap={false}>
                  <Text style={s.cutNum}>{c.order}</Text>
                  <Text style={s.cutText}>{cutStepText(c)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <Footer projectName={projectName} />
    </Page>
  );
}

/** A material's full parts list — the complete record, auto-paginated. */
function MasterPartsPage({ group, projectName }: { group: MaterialGroup; projectName: string }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>{group.material.name} — all parts</Text>
      <View style={s.trHead} fixed>
        <Text style={[s.th, { flex: 2 }]}>ID</Text>
        <Text style={[s.th, { flex: 3 }]}>Part</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: 'right' }]}>W</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: 'right' }]}>L</Text>
        <Text style={[s.th, { flex: 1.2, textAlign: 'right' }]}>Thick</Text>
        <Text style={[s.th, { flex: 0.7, textAlign: 'right' }]}>Qty</Text>
        <Text style={[s.th, { flex: 0.7, textAlign: 'right' }]}>Band</Text>
        <Text style={[s.th, { flex: 3 }]}>Notes</Text>
      </View>
      {group.parts.map((p) => (
        <View style={s.tr} key={p.id} wrap={false}>
          <Text style={[s.td, s.mono, { flex: 2 }]}>{p.id}</Text>
          <Text style={[s.td, { flex: 3 }]}>{p.label}</Text>
          <Text style={[s.td, { flex: 1.4, textAlign: 'right' }]}>{toFraction(p.wIn)}</Text>
          <Text style={[s.td, { flex: 1.4, textAlign: 'right' }]}>{toFraction(p.lIn)}</Text>
          <Text style={[s.td, { flex: 1.2, textAlign: 'right' }]}>{toFraction(p.thicknessIn)}</Text>
          <Text style={[s.td, { flex: 0.7, textAlign: 'right' }]}>{p.qty}</Text>
          <Text style={[s.td, { flex: 0.7, textAlign: 'right' }]}>{p.edgeBandEdges.length || ''}</Text>
          <Text style={[s.td, { flex: 3 }]}>{p.notes ?? ''}</Text>
        </View>
      ))}
      <Footer projectName={projectName} />
    </Page>
  );
}

/** Countertops / linear stock cut to length from slabs. */
function CounterPage({ project, cut, projectName }: { project: Project; cut: ReturnType<typeof buildCutList>; projectName: string }) {
  const counterMat = project.materials.find((m) => m.roles?.includes('counter'));
  const slabLen = counterMat?.sheetH ?? 96;
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>Countertops</Text>
      <Text style={s.note}>{counterMat ? `${counterMat.name} — ` : ''}cut to length from {toFraction(slabLen)} slabs. A run longer than one slab is split across slabs (joined on site).</Text>
      <View style={[s.trHead, { marginTop: 8 }]} fixed>
        <Text style={[s.th, { flex: 2 }]}>ID</Text>
        <Text style={[s.th, { flex: 3 }]}>Run</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: 'right' }]}>Depth</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: 'right' }]}>Length</Text>
        <Text style={[s.th, { flex: 1.2, textAlign: 'right' }]}>Thick</Text>
        <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Slabs</Text>
        <Text style={[s.th, { flex: 3 }]}>Notes</Text>
      </View>
      {cut.linearStock.map((p) => (
        <View style={s.tr} key={p.id} wrap={false}>
          <Text style={[s.td, s.mono, { flex: 2 }]}>{p.id}</Text>
          <Text style={[s.td, { flex: 3 }]}>{p.label}</Text>
          <Text style={[s.td, { flex: 1.4, textAlign: 'right' }]}>{toFraction(p.wIn)}</Text>
          <Text style={[s.td, { flex: 1.4, textAlign: 'right' }]}>{toFraction(p.lIn)}</Text>
          <Text style={[s.td, { flex: 1.2, textAlign: 'right' }]}>{toFraction(p.thicknessIn)}</Text>
          <Text style={[s.td, { flex: 0.8, textAlign: 'right' }]}>{Math.max(1, Math.ceil(p.lIn / slabLen)) * p.qty}</Text>
          <Text style={[s.td, { flex: 3 }]}>{p.notes ?? ''}</Text>
        </View>
      ))}
      <Footer projectName={projectName} />
    </Page>
  );
}

/**
 * The full cut-list PDF: a cover/summary, then one page per nested sheet (diagram
 * + parts + cut order), then each material's complete parts list, then counters.
 * Pure — takes the project, builds the cut list, and renders. No store/React-DOM.
 */
export function CutListDocument({ project }: { project: Project }) {
  const cut = buildCutList(project);
  const projectName = project.name || 'Cabinetmaker';

  return (
    <Document title={`${projectName} — cut list`}>
      <CoverPage project={project} cut={cut} />

      {cut.groups.map((g) =>
        (g.nesting?.sheets ?? []).map((_, i) => (
          <SheetPage key={`${g.material.id}-${i}`} group={g} sheetIndex={i} projectName={projectName} />
        )),
      )}

      {cut.groups.map((g) => (
        <MasterPartsPage key={`master-${g.material.id}`} group={g} projectName={projectName} />
      ))}

      {cut.linearStock.length > 0 && <CounterPage project={project} cut={cut} projectName={projectName} />}
    </Document>
  );
}
