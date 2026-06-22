/**
 * Turns a built scene into a list of faceted solids ready for a CAD exporter.
 *
 * Every node Cabinetmaker builds is an axis-aligned box (a panel, face, drawer box,
 * counter, …) except `leg`, which the 3D viewer draws as a cylinder. Boxes carry
 * an optional `rotY` (Y-axis rotation) when they sit on an angled wall. Here we
 * flatten each node into planar polygon faces in world space (inches), which the
 * STEP writer serializes as B-rep solids.
 *
 * Coordinates stay in the scene frame so the export lines up 1:1 with the viewer.
 */
import type { Node3D } from '../types';
import type { BuiltScene } from '../geometry/buildProject';

export type Vec3 = [number, number, number];

/** A planar polygon: ordered vertices, wound CCW as seen from outside the solid. */
export type Face = Vec3[];

/** One closed solid destined to become a named B-rep in the export. */
export interface Solid {
  /** Human-readable, unique within an export (e.g. `panel-01`, `leg-04`). */
  name: string;
  faces: Face[];
}

/**
 * Nodes the STEP export skips: it carries only the parts you actually fabricate
 * (carcass panels, backs, faces, counters, toekicks, legs, drawer boxes). Room
 * decoration (wall/ceiling), bought appliances/fixtures, and lighting (LED
 * strips and other add-on glow models) are not cut parts, so they're dropped.
 */
const NON_FABRICATED = new Set<Node3D['kind']>(['wall', 'ceiling', 'appliance', 'light']);

/** Sides used to facet a cylindrical leg into a prism (matches the viewer's look). */
const LEG_SIDES = 24;

/** Rotate a local corner offset about the Y axis, then translate to the node centre. */
function place(center: Vec3, dx: number, dy: number, dz: number, cos: number, sin: number): Vec3 {
  return [center[0] + dx * cos - dz * sin, center[1] + dy, center[2] + dx * sin + dz * cos];
}

/** Six outward-wound quad faces for an axis-aligned (optionally Y-rotated) box. */
function boxFaces(n: Node3D): Face[] {
  const c = n.pos;
  const [sx, sy, sz] = n.size;
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const cos = Math.cos(n.rotY ?? 0), sin = Math.sin(n.rotY ?? 0);
  const p = (dx: number, dy: number, dz: number) => place(c, dx, dy, dz, cos, sin);
  // Corners keyed by (x,y,z) sign.
  const v000 = p(-hx, -hy, -hz), v100 = p(hx, -hy, -hz), v110 = p(hx, hy, -hz), v010 = p(-hx, hy, -hz);
  const v001 = p(-hx, -hy, hz), v101 = p(hx, -hy, hz), v111 = p(hx, hy, hz), v011 = p(-hx, hy, hz);
  return [
    [v001, v101, v111, v011], // +Z front
    [v100, v000, v010, v110], // -Z back
    [v101, v100, v110, v111], // +X right
    [v000, v001, v011, v010], // -X left
    [v011, v111, v110, v010], // +Y top
    [v000, v100, v101, v001], // -Y bottom
  ];
}

/** A vertical prism approximating a cylindrical leg: N side quads + 2 end caps. */
function legFaces(n: Node3D): Face[] {
  const [cx, cy, cz] = n.pos;
  const r = Math.min(n.size[0], n.size[2]) / 2;
  const yb = cy - n.size[1] / 2, yt = cy + n.size[1] / 2;
  const ring = (y: number): Vec3[] =>
    Array.from({ length: LEG_SIDES }, (_, i) => {
      const a = (2 * Math.PI * i) / LEG_SIDES;
      return [cx + r * Math.cos(a), y, cz + r * Math.sin(a)] as Vec3;
    });
  const bottom = ring(yb), top = ring(yt);
  const faces: Face[] = [];
  for (let i = 0; i < LEG_SIDES; i++) {
    const j = (i + 1) % LEG_SIDES;
    faces.push([bottom[i], top[i], top[j], bottom[j]]); // outward-facing side quad
  }
  faces.push([...top].reverse()); // +Y cap (CCW seen from above)
  faces.push(bottom); // -Y cap (CCW seen from below)
  return faces;
}

/**
 * Flatten the fabricated nodes of a scene into named solids. Decoration,
 * appliances and lighting are dropped (see `NON_FABRICATED`). Names are
 * `<kind>-NN`, numbered per kind in node order, so the output is stable and
 * parts are identifiable in CAD.
 */
export function sceneToSolids(scene: BuiltScene): Solid[] {
  const counts = new Map<string, number>();
  const solids: Solid[] = [];
  for (const n of scene.nodes) {
    if (NON_FABRICATED.has(n.kind)) continue;
    const seq = (counts.get(n.kind) ?? 0) + 1;
    counts.set(n.kind, seq);
    const name = `${n.kind}-${String(seq).padStart(2, '0')}`;
    solids.push({ name, faces: n.kind === 'leg' ? legFaces(n) : boxFaces(n) });
  }
  return solids;
}
