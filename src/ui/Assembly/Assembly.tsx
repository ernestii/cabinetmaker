import { useMemo, useState } from 'react';
import { ActionIcon, Popover, Stack, Text } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { buildAssembly, type AssemblyStep, type CabinetAssembly } from '../../domain/assembly/steps';
import type { AssemblyFigure as Figure, FigPhase } from '../../domain/assembly/figures';
import { ASSEMBLY_PHASES } from '../../domain/assembly/nodePhase';
import { getFrontType } from '../../domain/plugins/registry';
import type { PluginFieldContext } from '../../domain/plugins/types';
import type { Opening, Part, Project } from '../../domain/types';
import { toFraction } from '../../domain/format';
import { useStore } from '../../state/store';
import { AssemblyFigure } from './AssemblyFigure';
import { PluginFields } from '../plugins/PluginFields';
import { PartPreview3D } from '../components/PartPreview3D';
import { PageToc } from '../components/PageToc';
import { PageHeader } from '../components/PageHeader';

const PHASE_LABEL: Record<FigPhase, string> = {
  carcass: 'Carcass', boxes: 'Drawer boxes', doors: 'Doors', faces: 'Faces & reveals', hardware: 'Hardware',
};
/** Phases the step sections render — includes 'hardware' so plugin-contributed
 *  hardware steps aren't silently dropped. */
const STEP_PHASES: FigPhase[] = [...ASSEMBLY_PHASES, 'hardware'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function Assembly() {
  const project = useStore((s) => s.project);
  const cabs = useMemo(() => buildAssembly(project), [project]);

  const summary = useMemo(() => {
    const n = { cabinet: 0, workbench: 0, appliance: 0 };
    for (const c of cabs) n[c.kind] += 1;
    return [
      n.cabinet ? plural(n.cabinet, 'cabinet', 'cabinets') : '',
      n.workbench ? plural(n.workbench, 'workbench', 'workbenches') : '',
      n.appliance ? plural(n.appliance, 'appliance', 'appliances') : '',
    ].filter(Boolean).join(' · ');
  }, [cabs]);

  return (
    <div className="assembly pad">
      <PageHeader
        title="Assembly guide"
        subtitle={cabs.length === 0
          ? 'Nothing to build yet'
          : `${summary} · all dimensions in inches · hover a part id to see where it goes in 3D`}
        onPrint={cabs.length > 0 ? () => window.print() : undefined}
      />
      {cabs.length === 0 && (
        <Text c="dimmed" fz="sm">No cabinets yet — add some in the Layout tab and the build steps will appear here.</Text>
      )}
      <div className="report-layout">
        {/* Cabinets (h2) with their phases (h3) as sub-items; the Parts headings
            live in .assembly-side, so the spy never picks them up. */}
        {cabs.length > 1 && <PageToc selector=".assembly-cards :is(h2, .phase-steps h3)" dataKey={cabs} />}
        <div className="assembly-cards">
          {cabs.map((c) => <CabinetCard key={c.cabinetId} cab={c} />)}
        </div>
      </div>
    </div>
  );
}

function CabinetCard({ cab }: { cab: CabinetAssembly }) {
  const has3D = cab.nodes.length > 0;

  // Hover a part chip (steps or parts table) → where-does-it-go 3D preview.
  const [hover, setHover] = useState<{ partId: string; x: number; y: number } | null>(null);
  const hoverPart = has3D
    ? (partId: string | null, e?: React.MouseEvent<HTMLElement>) => {
        if (!partId || !e) { setHover(null); return; }
        const r = e.currentTarget.getBoundingClientRect();
        setHover({ partId, x: r.right, y: r.top + r.height / 2 });
      }
    : undefined;

  return (
    <section id={`asm-${cab.cabinetId}`} className="assembly-card">
      <header className="assembly-card-head">
        <h2>{cab.title}</h2>
        <span className="assembly-spec">{toFraction(cab.spec.wIn)} W × {toFraction(cab.spec.hIn)} H × {toFraction(cab.spec.dIn)} D</span>
      </header>

      {/* Build content (figures + instructions) left · the parts list right. */}
      <div className="assembly-body">
        <div className="assembly-main">
          {STEP_PHASES.map((p) => {
            const steps = cab.steps.filter((s) => s.phase === p);
            const figs = cab.figures.filter((f) => f.phase === p);
            if (steps.length === 0 && figs.length === 0) return null;
            return (
              <div className={`assembly-phase${figs.length === 0 ? ' no-figs' : ''}`} key={p}>
                {/* Illustration on the left, instructions on the right. */}
                {figs.length > 0 && (
                  <div className="phase-figs">
                    {figs.map((f) => <DetailFigure key={f.id} fig={f} />)}
                  </div>
                )}
                <div className="phase-steps">
                  <h3>{PHASE_LABEL[p]}</h3>
                  <StepList steps={steps.filter((s) => !s.group)} cab={cab} hoverPart={hoverPart} />
                  {/* Grouped steps (e.g. a plugin's "Gridfinity") get their own
                      sub-section below the phase's main list. */}
                  {[...new Set(steps.filter((s) => s.group).map((s) => s.group!))].map((g) => (
                    <div key={g}>
                      <h4 className="step-group-head">{g}</h4>
                      <StepList steps={steps.filter((s) => s.group === g)} cab={cab} hoverPart={hoverPart} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <PartsTable parts={cab.parts} onHover={hoverPart} />
      </div>

      {hover && has3D && (
        <PartPreview3D assembly={cab} partId={hover.partId} x={hover.x} y={hover.y} />
      )}
    </section>
  );
}

type HoverPart = ((partId: string | null, e?: React.MouseEvent<HTMLElement>) => void) | undefined;

/** Ordered step list: text, optional structured table, part chips, settings gear. */
function StepList({ steps, cab, hoverPart }: { steps: AssemblyStep[]; cab: CabinetAssembly; hoverPart: HoverPart }) {
  if (steps.length === 0) return null;
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={i}>
          {s.text}
          {s.openingId && <StepGear cabinetId={cab.cabinetId} openingId={s.openingId} />}
          {s.table && (
            <table className="parts-table step-table">
              <thead><tr>{s.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {s.table.rows.map((r, ri) => (
                  <tr key={ri}>{r.map((cell, ci) => <td key={ci} className={ci > 0 ? 'mono' : undefined}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
          {s.partIds && s.partIds.length > 0 && (
            <span className="step-parts"> {s.partIds.map((pid) => (
              <code key={pid}
                onMouseEnter={hoverPart ? (e) => hoverPart(pid, e) : undefined}
                onMouseLeave={hoverPart ? () => hoverPart(null) : undefined}
              >{pid}</code>
            ))}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Locate a cabinet's opening in the live project (for the settings gear). */
function findOpening(p: Project, cabinetId: string, openingId: string): Opening | undefined {
  for (const room of p.rooms) {
    for (const wall of room.walls) {
      for (const el of wall.elements ?? []) {
        if (el.cabinet?.id === cabinetId) return el.cabinet.front.find((o) => o.id === openingId);
      }
    }
  }
  return undefined;
}

/**
 * Gear beside a step that came from a plugin front: opens that front's own
 * `setting:` fields (the same declarative controls the Inspector renders), so
 * e.g. the gridfinity print list can be retuned to your printer's bed without
 * leaving the Assembly page.
 */
function StepGear({ cabinetId, openingId }: { cabinetId: string; openingId: string }) {
  const project = useStore((s) => s.project);
  const updateProject = useStore((s) => s.updateProject);
  const opening = useMemo(() => findOpening(project, cabinetId, openingId), [project, cabinetId, openingId]);
  const def = opening ? getFrontType(opening.type) : undefined;
  const fields = useMemo(() => def?.fields?.filter((f) => f.target.startsWith('setting:')) ?? [], [def]);
  if (!opening || fields.length === 0) return null;

  const ctx: PluginFieldContext = {
    get: (target) => (target.startsWith('setting:') ? opening.settings?.[target.slice('setting:'.length)] : undefined),
  };
  const set = (target: string, value: unknown) => {
    if (!target.startsWith('setting:')) return;
    const key = target.slice('setting:'.length);
    updateProject((p) => {
      const op = findOpening(p, cabinetId, openingId);
      if (op) op.settings = { ...(op.settings ?? {}), [key]: value };
    });
  };
  return (
    <Popover width={210} position="bottom-start" shadow="md" withArrow>
      <Popover.Target>
        <ActionIcon variant="subtle" color="gray" size="xs" className="step-gear" aria-label="Step settings">
          <IconSettings size={13} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <PluginFields fields={fields} ctx={ctx} set={set} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** A 2D machining/detail drawing with its caption. */
function DetailFigure({ fig }: { fig: Figure }) {
  return (
    <figure className="assembly-figure">
      <AssemblyFigure fig={fig} />
      <figcaption>{fig.title}</figcaption>
    </figure>
  );
}

/** Inch fraction without the `"` mark — the table header carries the unit. */
const dim = (v: number) => toFraction(v).replace('"', '');

/** The cabinet's cut parts, riding alongside the build content as a side column. */
function PartsTable({ parts, onHover }: {
  parts: Part[];
  onHover?: (partId: string | null, e?: React.MouseEvent<HTMLElement>) => void;
}) {
  if (parts.length === 0) return null;
  return (
    <aside className="assembly-side assembly-parts">
      <h3>Parts · {parts.reduce((s, p) => s + p.qty, 0)} pieces</h3>
      <table className="parts-table">
        <thead><tr><th>Part</th><th>W×L×T, in</th><th>#</th></tr></thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.id}
              onMouseEnter={onHover ? (e) => onHover(p.id, e) : undefined}
              onMouseLeave={onHover ? () => onHover(null) : undefined}
            >
              <td><code>{p.id}</code> <span className="small">{p.label}</span></td>
              <td className="mono">{dim(p.wIn)}×{dim(p.lIn)}×{dim(p.thicknessIn)}</td>
              <td className="mono">{p.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}
