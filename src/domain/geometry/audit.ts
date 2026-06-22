import type { CabinetBuild, Node3D, Project } from '../types';
import { buildCabinet } from './buildCabinet';
import { wallMetrics } from './metrics';
import { elementVertical } from '../elements';
import { allWalls } from '../project';

/** Cabinet-local dimensions the build was generated against. */
export interface CabinetDims {
  widthIn: number;
  carcassHeightIn: number;
  depthIn: number;
}

const TOL = 1e-6;
const lo = (n: Node3D, a: 0 | 1 | 2) => n.pos[a] - n.size[a] / 2;
const hi = (n: Node3D, a: 0 | 1 | 2) => n.pos[a] + n.size[a] / 2;
const fmt = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Runtime self-check for one built cabinet, in the cabinet-LOCAL frame
 * (x∈[0,W] left→right, y∈[0,Hc] up from the carcass bottom, z∈[0,D] from the
 * wall toward the room). Returns human-readable invariant violations; an empty
 * array means the structural box is sound.
 *
 * It proves the carcass is conservative — the kind of thing the golden 2D part
 * dimensions can't: panels stay inside the declared envelope, the two gables sit
 * exactly at x=0 and x=W (the width is "solid", no gap or overrun), the shell
 * spans the full height, and the bottom/top fill the interior between the gables
 * (pieces align and sum to the proper W/Hc/D). Parts that legitimately project —
 * overlay faces, handles, the counter, legs, toekick, appliances, lights — are
 * exempt from the envelope; only the structural shell (panels/back) and drawer
 * boxes are required to fit inside.
 */
export function auditCabinetGeometry(build: CabinetBuild, dims: CabinetDims): string[] {
  const { widthIn: W, carcassHeightIn: Hc, depthIn: D } = dims;
  const C = build.cabinetId;
  const issues: string[] = [];

  for (const n of build.nodes) {
    if (n.size.some((s) => s <= 0)) issues.push(`${C}: ${n.kind} node has a non-positive size [${n.size.map(fmt).join(', ')}]`);
  }

  const shell = build.nodes.filter((n) => n.kind === 'panel' || n.kind === 'back');
  if (shell.length === 0) return issues; // appliance-only / no carcass to check

  // 1) Envelope: the structural shell + drawer boxes stay within [0,W]×[0,Hc]×[0,D].
  const contained = build.nodes.filter((n) => n.kind === 'panel' || n.kind === 'back' || n.kind === 'drawerBox');
  const axes: { a: 0 | 1 | 2; name: string; max: number }[] = [
    { a: 0, name: 'width', max: W },
    { a: 1, name: 'height', max: Hc },
    { a: 2, name: 'depth', max: D },
  ];
  for (const n of contained) {
    for (const { a, name, max } of axes) {
      if (lo(n, a) < -TOL || hi(n, a) > max + TOL) {
        issues.push(`${C}: ${n.kind} sticks out of the ${name} envelope — [${fmt(lo(n, a))}..${fmt(hi(n, a))}] vs [0..${max}]`);
      }
    }
  }

  // 2) The shell spans the full width and height (no gaps at the extremes).
  const span = (a: 0 | 1 | 2) => ({ min: Math.min(...shell.map((n) => lo(n, a))), max: Math.max(...shell.map((n) => hi(n, a))) });
  const sx = span(0);
  if (Math.abs(sx.min) > TOL || Math.abs(sx.max - W) > TOL) issues.push(`${C}: carcass width spans [${fmt(sx.min)}..${fmt(sx.max)}], expected [0..${W}]`);
  const sy = span(1);
  if (Math.abs(sy.min) > TOL || Math.abs(sy.max - Hc) > TOL) issues.push(`${C}: carcass height spans [${fmt(sy.min)}..${fmt(sy.max)}], expected [0..${Hc}]`);

  // 3) Two full-height side gables at x=0 and x=W: equal thickness, full depth.
  const fullHeight = shell.filter((n) => n.kind === 'panel' && Math.abs(n.size[1] - Hc) < TOL);
  const left = fullHeight.find((n) => Math.abs(lo(n, 0)) < TOL);
  const right = fullHeight.find((n) => Math.abs(hi(n, 0) - W) < TOL);
  if (!left) issues.push(`${C}: missing a full-height left gable at x=0`);
  if (!right) issues.push(`${C}: missing a full-height right gable at x=${W}`);
  if (left && right) {
    if (Math.abs(left.size[0] - right.size[0]) > TOL) issues.push(`${C}: side gables differ in thickness (${fmt(left.size[0])} vs ${fmt(right.size[0])})`);
    for (const [s, name] of [[left, 'left'], [right, 'right']] as const) {
      if (Math.abs(s.size[2] - D) > TOL) issues.push(`${C}: ${name} gable isn't full depth (${fmt(s.size[2])} of ${D})`);
    }

    // 4) Bottom + top fill the interior width between the gables (sum to W).
    const t = left.size[0];
    const interiorX0 = t;
    const interiorX1 = W - t;
    const horiz = shell.filter((n) => n.kind === 'panel' && Math.abs(n.size[1] - Hc) > TOL);
    const fills = (rows: Node3D[], where: string) => {
      if (rows.length === 0) { issues.push(`${C}: no ${where} panel between the gables`); return; }
      const x0 = Math.min(...rows.map((n) => lo(n, 0)));
      const x1 = Math.max(...rows.map((n) => hi(n, 0)));
      if (Math.abs(x0 - interiorX0) > TOL || Math.abs(x1 - interiorX1) > TOL) {
        issues.push(`${C}: ${where} fills x [${fmt(x0)}..${fmt(x1)}], expected the interior [${fmt(interiorX0)}..${fmt(interiorX1)}]`);
      }
    };
    fills(horiz.filter((n) => Math.abs(lo(n, 1)) < TOL), 'bottom');
    fills(horiz.filter((n) => Math.abs(hi(n, 1) - Hc) < TOL), 'top');
  }

  return issues;
}

/** A whole-project geometry audit: counts the cabinets checked and any issues. */
export interface ProjectAudit {
  cabinets: number;
  issues: string[];
}

/**
 * Rebuild every cabinet in the project (in its own local frame) and audit each.
 * Used by the UI to surface a "geometry OK" badge next to the cost/cut-list
 * totals. Material thicknesses come from the project so the audit reflects the
 * real build; appearance (colour/texture) is irrelevant to the invariants.
 */
export function auditProject(project: Project): ProjectAudit {
  const thicknessByRole: Record<string, number> = {};
  for (const mt of project.materials ?? []) {
    for (const role of mt.roles ?? []) if (!(role in thicknessByRole)) thicknessByRole[role] = mt.thicknessIn;
  }

  const issues: string[] = [];
  let cabinets = 0;
  let index = 1;
  for (const wall of allWalls(project)) {
    const m = wallMetrics(project, wall);
    for (const el of wall.elements ?? []) {
      if (!el.cabinet) continue;
      cabinets += 1;
      const v = elementVertical(el, wall, m, project.defaults);
      const depthIn = el.cabinet.depthOverrideIn ?? v.depthDefault;
      const build = buildCabinet(
        { ...el.cabinet, widthIn: el.widthIn },
        {
          index: index++, runKind: v.runKind, depthIn, carcassHeightIn: v.carcassH,
          legHeightIn: v.hasLegs ? m.legH : 0, hasLegs: v.hasLegs,
          materialIdByRole: {}, colorByRole: {}, textureByRole: {}, thicknessByRole,
          defaults: project.defaults,
        },
      );
      issues.push(...auditCabinetGeometry(build, { widthIn: el.widthIn, carcassHeightIn: v.carcassH, depthIn }));
    }
  }
  return { cabinets, issues };
}
