import type { Cabinet, Node3D, Part, Project, ProjectDefaults, RunKind, Wall } from '../types';
import { workbenchDrawerCount } from '../constants';
import { layoutFronts } from '../geometry/fronts';
import { resolveConstruction } from '../geometry/context';
import { wallMetrics } from '../geometry/metrics';
import { elementVertical } from '../elements';
import { resolveExposedSides } from '../layout';
import { buildProject, buildCabinetFor } from '../geometry/buildProject';
import { getFrontType, getFixture, getCabinetAddon } from '../plugins/registry';
import { shortId, toFraction } from '../format';
import { cabinetFigures, workbenchFigure, applianceFigure, type AssemblyFigure, type FigPhase } from './figures';
// Side effect: ensure front-type plugins (which own per-opening steps) exist.
import '../plugins/builtin';

export interface AssemblyStep {
  text: string;
  partIds?: string[];
  /** Which build phase this step belongs to (pairs the step with its figure). */
  phase: FigPhase;
  /** Sub-section label — grouped steps render under their own sub-heading after the phase's main list. */
  group?: string;
  /** Structured rows rendered as a small table under the step text. */
  table?: { head: string[]; rows: string[][] };
  /** Opening that produced this step — lets the UI surface that front's plugin settings (gear icon). */
  openingId?: string;
}
export interface CabinetAssembly {
  cabinetId: string;
  index: number;
  /** What this section documents — drives the page summary line. */
  kind: 'cabinet' | 'workbench' | 'appliance';
  title: string;
  /** Overall carcass W × H × D, in inches, for the header spec line. */
  spec: { wIn: number; hIn: number; dIn: number };
  steps: AssemblyStep[];
  figures: AssemblyFigure[];
  /** This cabinet's cut-list parts, for the quick-reference table. */
  parts: Part[];
  /** Cabinet-local 3D nodes for the interactive isometric figure (empty for
   *  workbench/appliance sections, which keep their 2D frame figures). */
  nodes: Node3D[];
}

function cabinetSteps(cab: Cabinet, slot: RunKind, index: number, depthIn: number, widthIn: number, carcassHeight: number, defaults: ProjectDefaults): AssemblyStep[] {
  const C = `C${index}`;
  const steps: AssemblyStep[] = [];
  const topPart = slot === 'base' ? `${C}-STR` : `${C}-TOP`;
  const c = resolveConstruction(cab, slot, undefined, defaults);

  steps.push({ phase: 'carcass', text: `Cut all ${C} parts and edge-band the front edges of the side panels.`, partIds: [`${C}-SIDE`] });
  steps.push({ phase: 'carcass', text: `Drill pocket holes in the bottom${slot === 'base' ? ' and stretchers' : ' and top'}.`, partIds: [`${C}-BOT`, topPart] });
  steps.push({
    phase: 'carcass',
    text: slot === 'base'
      ? `Join bottom and both stretchers between the sides (pocket screws). Keep it square.`
      : `Join bottom and top between the sides (pocket screws). Keep it square.`,
    partIds: [`${C}-SIDE`, `${C}-BOT`, topPart],
  });
  steps.push(
    c.backStyle === 'rails'
      ? { phase: 'carcass', text: `Pocket/screw the top + bottom back rails between the sides and square the box to them. The top rail is the hanging cleat — screw it into the wall studs.`, partIds: [`${C}-BACK-RAIL`] }
      : { phase: 'carcass', text: `Set the ${toFraction(c.backThicknessIn)} back into the rear, square the box to it, and pocket/screw it to sides + bottom. It doubles as the hanging cleat.`, partIds: [`${C}-BACK`] },
  );

  // Per-opening steps come from the front-type plugin, so the instructions stay
  // in lockstep with the geometry. Ordinals match buildCabinet's part ids.
  const ordinals = new Map<string, number>();
  for (const item of layoutFronts(cab.front, carcassHeight)) {
    const def = getFrontType(item.opening.type) ?? getFrontType('fixed')!;
    const ord = (ordinals.get(def.id) ?? 0) + 1;
    ordinals.set(def.id, ord);
    if (def.steps) steps.push(...def.steps({ cabinet: cab, item, ordinal: ord, index, c, defaults, depthIn, widthIn }));
  }

  const shelfTotal = cab.front.reduce(
    (s, o) => s + (o.type === 'door' || o.type === 'fixed' ? (o.shelves ?? 0) : 0), 0,
  );
  if (shelfTotal > 0) {
    steps.push({ phase: 'carcass', text: `Bore 5mm shelf-pin rows in both gables and cut ${shelfTotal} adjustable ${shelfTotal === 1 ? 'shelf' : 'shelves'}.` });
  }

  // Cabinet add-on steps (Axis 5), in lockstep with the geometry they emit.
  for (const addonId of cab.addons ?? []) {
    const def = getCabinetAddon(addonId);
    if (def?.steps) steps.push(...def.steps({ cabinet: cab, slot, index, c, defaults }));
  }

  // Only cabinets that actually have faces to hang get the reveal step — an
  // open-shelving cabinet (all 'fixed' fronts) has nothing to align.
  if (cab.front.some((o) => o.type !== 'fixed')) {
    steps.push({ phase: 'faces', text: `Hang all faces with a 1/16" reveal per side (1/8" gaps). Set the gaps with spacers/tape before drilling.` });
  }
  return steps;
}

export function buildAssembly(project: Project): CabinetAssembly[] {
  const out: CabinetAssembly[] = [];
  let index = 0;

  // One build pass gives the cut-list parts (keyed by cabinet) the figures and
  // the quick-reference tables read from. Indices line up because this walk and
  // buildProject's visit bays in the same order.
  const scene = buildProject(project);
  const partsByCab = new Map<string, Part[]>();
  for (const p of scene.parts) {
    const list = partsByCab.get(p.cabinetId);
    if (list) list.push(p); else partsByCab.set(p.cabinetId, [p]);
  }

  const depthFor = (slot: RunKind) => slot === 'upper' ? project.defaults.upperDepthIn : slot === 'tall' ? project.defaults.tallDepthIn : project.defaults.baseDepthIn;
  const emit = (
    cab: Cabinet, slot: RunKind, widthIn: number, carcassH: number, titleSuffix: string,
    build: { depthDefault: number; legH: number; hasLegs: boolean }, exposedSides: ('left' | 'right')[],
  ) => {
    index += 1;
    const parts = partsByCab.get(cab.id) ?? [];
    // A fully-exposed cabinet has no carcass `-SIDE` part (both are `-SIDE-FIN`),
    // so match either when reading back the depth.
    const dIn = parts.find((p) => p.id.endsWith('-SIDE') || p.id.endsWith('-SIDE-FIN'))?.wIn ?? cab.depthOverrideIn ?? depthFor(slot);
    // Cabinet-local nodes for the interactive 3D figure — same builder + index as
    // the cut-list parts, so part ids referenced by steps line up with the model.
    const nodes = buildCabinetFor(project, cab, slot, widthIn, build.depthDefault, carcassH, build.legH, build.hasLegs, index, exposedSides).nodes;
    out.push({
      cabinetId: cab.id, index, kind: 'cabinet', title: `Cabinet C${index} — ${titleSuffix}`,
      spec: { wIn: widthIn, hIn: carcassH, dIn },
      steps: cabinetSteps(cab, slot, index, dIn, widthIn, carcassH, project.defaults),
      figures: cabinetFigures(cab, slot, index, widthIn, carcassH, project.defaults, parts, exposedSides),
      parts, nodes,
    });
  };

  const walls: Wall[] = project.rooms.flatMap((r) => r.walls);
  for (const wall of walls) {
    const m = wallMetrics(project, wall);
    for (const el of wall.elements ?? []) {
      // A cabinet (plain, or one with an integrated appliance) gets its carcass steps.
      if (el.cabinet) {
        const v = elementVertical(el, wall, m, project.defaults);
        emit(el.cabinet, v.runKind, el.widthIn, v.carcassH, `${toFraction(el.widthIn)} ${v.runKind}`,
          { depthDefault: v.depthDefault, legH: m.legH, hasLegs: v.hasLegs }, resolveExposedSides(wall, el, project.defaults));
      }
      if (el.workbench) {
        const idBase = `WB${shortId(el.id)}`;
        const support = el.workbenchSupport ?? 'legs';
        const steps: AssemblyStep[] = [
          { phase: 'carcass', text: `Fit the bought adjustable legs on the free ends (a side against a cabinet hangs off it) and level them plumb under the countertop footprint.` },
        ];
        if (support === 'stretchers') {
          steps.push({ phase: 'carcass', text: `Fit the front & back apron stretchers between the legs (pocket screws); run them into any abutting cabinet.`, partIds: [`${idBase}-STRETCHER`] });
        } else if (support === 'drawer') {
          const n = workbenchDrawerCount(el.widthIn);
          steps.push({ phase: 'carcass', text: `Build the drawer box — sides, top, bottom, back${n > 1 ? `, ${n - 1} divider${n - 1 === 1 ? '' : 's'}` : ''} — then screw it up under the worktop, into the legs or the cabinets it abuts.`, partIds: [`${idBase}-END`, `${idBase}-BOX-TOP`, `${idBase}-BOX-BOT`, `${idBase}-DBACK`, ...(n > 1 ? [`${idBase}-DDIV`] : [])] });
          steps.push({ phase: 'faces', text: `Build ${n} drawer box${n === 1 ? '' : 'es'} on slides and fit the fronts with an even reveal.`, partIds: [`${idBase}-DR-SIDE`, `${idBase}-DR-FB`, `${idBase}-DR-BOT`, `${idBase}-DFACE`] });
        }
        steps.push({ phase: 'carcass', text: `Fasten the countertop onto the frame with brackets/cleats (slot the holes for seasonal movement).` });
        out.push({
          cabinetId: el.id, index, kind: 'workbench', title: `Workbench — ${toFraction(el.widthIn)} wide`,
          spec: { wIn: el.widthIn, hIn: m.counterTopY, dIn: el.depthOverrideIn ?? project.defaults.baseDepthIn },
          steps,
          figures: workbenchFigure(idBase, el.widthIn, m.counterUndersideY, m.counterT, support, el.workbenchDrawerHeightIn),
          parts: partsByCab.get(el.id) ?? [],
          nodes: [],
        });
      }
      if (el.fixtureId) {
        const def = getFixture(el.fixtureId);
        const parts = partsByCab.get(el.id) ?? [];
        const aSteps: AssemblyStep[] = [
          {
            phase: 'carcass',
            text: `Leave a ${toFraction(el.widthIn)} wide opening for the ${def?.label ?? 'appliance'}${
              def?.countertop === 'break' ? ' — the countertop stops on both sides' : ' — the countertop runs continuously over it'
            }. Check the manufacturer's rough-opening and clearance specs.`,
          },
        ];
        if (parts.length) {
          aSteps.push({ phase: 'faces', text: `Cut and fit the ${parts.length === 1 ? 'panel' : 'panels'} flush to the opening.`, partIds: parts.map((p) => p.id) });
        }
        const openingH = def?.zone === 'upper' ? m.upperH : def?.zone === 'tall' ? m.tallCarcassH : m.counterTopY;
        out.push({
          cabinetId: el.id, index, kind: 'appliance',
          title: `${def?.label ?? 'Appliance'} — ${toFraction(el.widthIn)} opening`,
          spec: { wIn: el.widthIn, hIn: openingH, dIn: el.fixture?.depthOverrideIn ?? project.defaults.baseDepthIn },
          steps: aSteps,
          figures: applianceFigure(`APP${shortId(el.id)}`, def?.label ?? 'Appliance', el.widthIn, openingH, parts),
          parts,
          nodes: [],
        });
      }
    }
  }
  return out;
}
