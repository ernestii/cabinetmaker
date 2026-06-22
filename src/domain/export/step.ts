/**
 * A minimal, dependency-free STEP (ISO 10303-21) writer for faceted solids.
 *
 * Each `Solid` becomes a `MANIFOLD_SOLID_BREP` of planar `ADVANCED_FACE`s — the
 * form every CAD kernel (FreeCAD, Shapr3D, …) imports as editable solids. Within
 * a solid, vertices and edges are de-duplicated so the shell is a proper manifold;
 * across solids nothing is shared, so each part is independent and individually
 * selectable. Lengths are declared in inches via a CONVERSION_BASED_UNIT, matching
 * the scene's native units (no scaling).
 *
 * The schema targeted is AP214 (AUTOMOTIVE_DESIGN), the common interchange schema.
 */
import type { Face, Solid, Vec3 } from './solids';

/** Format a number as a STEP real literal (always carries a decimal point). */
function r(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0.';
  const s = n.toPrecision(12);
  if (/e/i.test(s)) {
    const [m, e] = s.split(/e/i);
    const mm = (m.includes('.') ? m : `${m}.`).replace(/0+$/, '').replace(/\.$/, '.0');
    return `${mm}E${e}`;
  }
  if (!s.includes('.')) return `${s}.`;
  return s.replace(/0+$/, '').replace(/\.$/, '.');
}

const key = (v: Vec3) => `${r(v[0])},${r(v[1])},${r(v[2])}`;

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Newell's method: a robust outward normal for a planar polygon. */
function faceNormal(face: Face): Vec3 {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < face.length; i++) {
    const a = face[i], b = face[(i + 1) % face.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalize([nx, ny, nz]);
}

/** Accumulates STEP entities, handing out sequential `#id`s. */
class StepWriter {
  private lines: string[] = [];
  private id = 0;
  add(body: string): number {
    const id = ++this.id;
    this.lines.push(`#${id}=${body};`);
    return id;
  }
  /** Refer to an entity created later by reserving its id up front. */
  reserve(): number {
    return ++this.id;
  }
  put(id: number, body: string): void {
    this.lines.push(`#${id}=${body};`);
  }
  body(): string {
    return this.lines.join('\n');
  }
}

/** Emit one solid's faces as a MANIFOLD_SOLID_BREP; returns its entity id. */
function writeSolid(w: StepWriter, solid: Solid): number {
  const points = new Map<string, number>(); // CARTESIAN_POINT ids, by coordinate
  const vertices = new Map<string, number>(); // VERTEX_POINT ids, by coordinate
  const edges = new Map<string, number>(); // EDGE_CURVE ids, by unordered vertex pair

  const pointId = (v: Vec3): number => {
    const k = key(v);
    let id = points.get(k);
    if (id === undefined) {
      id = w.add(`CARTESIAN_POINT('',(${r(v[0])},${r(v[1])},${r(v[2])}))`);
      points.set(k, id);
    }
    return id;
  };
  const vertexId = (v: Vec3): number => {
    const k = key(v);
    let id = vertices.get(k);
    if (id === undefined) {
      id = w.add(`VERTEX_POINT('',#${pointId(v)})`);
      vertices.set(k, id);
    }
    return id;
  };

  /** A consistently-oriented EDGE_CURVE between two vertices, reused both ways. */
  const orientedEdge = (a: Vec3, b: Vec3): number => {
    const ka = key(a), kb = key(b);
    const forward = ka < kb;
    const lo = forward ? a : b;
    const hi = forward ? b : a;
    const ek = `${key(lo)}|${key(hi)}`;
    let edge = edges.get(ek);
    if (edge === undefined) {
      const dir = w.add(`DIRECTION('',(${normalize(sub(hi, lo)).map(r).join(',')}))`);
      const vec = w.add(`VECTOR('',#${dir},1.)`);
      const line = w.add(`LINE('',#${pointId(lo)},#${vec})`);
      edge = w.add(`EDGE_CURVE('',#${vertexId(lo)},#${vertexId(hi)},#${line},.T.)`);
      edges.set(ek, edge);
    }
    // ORIENTED_EDGE follows the loop direction (a→b) relative to the stored edge.
    return w.add(`ORIENTED_EDGE('',*,*,#${edge},.${forward ? 'T' : 'F'}.)`);
  };

  const faceIds: number[] = [];
  for (const face of solid.faces) {
    const oriented = face.map((v, i) => orientedEdge(v, face[(i + 1) % face.length]));
    const loop = w.add(`EDGE_LOOP('',(${oriented.map((e) => `#${e}`).join(',')}))`);
    const bound = w.add(`FACE_OUTER_BOUND('',#${loop},.T.)`);
    const normal = faceNormal(face);
    const refDir = normalize(sub(face[1], face[0]));
    const loc = pointId(face[0]);
    const axis = w.add(`DIRECTION('',(${normal.map(r).join(',')}))`);
    const ref = w.add(`DIRECTION('',(${refDir.map(r).join(',')}))`);
    const placement = w.add(`AXIS2_PLACEMENT_3D('',#${loc},#${axis},#${ref})`);
    const plane = w.add(`PLANE('',#${placement})`);
    faceIds.push(w.add(`ADVANCED_FACE('',(#${bound}),#${plane},.T.)`));
  }
  const shell = w.add(`CLOSED_SHELL('',(${faceIds.map((f) => `#${f}`).join(',')}))`);
  return w.add(`MANIFOLD_SOLID_BREP('${solid.name}',#${shell})`);
}

/**
 * Serialize solids to a complete STEP file (AP214), one named B-rep per solid,
 * lengths in inches.
 */
export function solidsToStep(solids: Solid[], opts: { name: string; date?: string }): string {
  const w = new StepWriter();

  // Geometric context with an inch length unit (a 25.4 mm conversion).
  const dim = w.add('DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.)');
  const siMM = w.add('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
  const inchMeasure = w.add(`LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#${siMM})`);
  const lenUnit = w.add(`( CONVERSION_BASED_UNIT('INCH',#${inchMeasure}) LENGTH_UNIT() NAMED_UNIT(#${dim}) )`);
  const angUnit = w.add('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
  const solidAngUnit = w.add('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  const uncertainty = w.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),#${lenUnit},'distance_accuracy_value','edge curve and vertex point accuracy')`);
  const ctx = w.add(
    `( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lenUnit},#${angUnit},#${solidAngUnit})) REPRESENTATION_CONTEXT('Context','3D') )`,
  );

  // One B-rep per solid.
  const breps = solids.map((s) => writeSolid(w, s));

  // Scene origin placement, included in the representation alongside the solids.
  const originPt = w.add("CARTESIAN_POINT('',(0.,0.,0.))");
  const zAxis = w.add("DIRECTION('',(0.,0.,1.))");
  const xAxis = w.add("DIRECTION('',(1.,0.,0.))");
  const originPlacement = w.add(`AXIS2_PLACEMENT_3D('',#${originPt},#${zAxis},#${xAxis})`);

  const items = [...breps.map((b) => `#${b}`), `#${originPlacement}`].join(',');
  const shapeRep = w.add(`ADVANCED_BREP_SHAPE_REPRESENTATION('${opts.name}',(${items}),#${ctx})`);

  // AP214 product structure so the geometry resolves to a named part on import.
  const appCtx = w.add("APPLICATION_CONTEXT('automotive design')");
  w.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtx})`);
  const prodCtx = w.add(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`);
  const prod = w.add(`PRODUCT('${opts.name}','${opts.name}','',(#${prodCtx}))`);
  w.add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${prod}))`);
  const prodDefCtx = w.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`);
  const formation = w.add(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
  const prodDef = w.add(`PRODUCT_DEFINITION('design','',#${formation},#${prodDefCtx})`);
  const prodDefShape = w.add(`PRODUCT_DEFINITION_SHAPE('','',#${prodDef})`);
  w.add(`SHAPE_DEFINITION_REPRESENTATION(#${prodDefShape},#${shapeRep})`);

  const date = opts.date ?? new Date().toISOString().replace(/\.\d+Z$/, '');
  const header = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('Cabinetmaker 3D export'),'2;1');",
    `FILE_NAME('${opts.name}','${date}',(''),(''),'Cabinetmaker','Cabinetmaker','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
  ].join('\n');

  return `${header}\n${w.body()}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
