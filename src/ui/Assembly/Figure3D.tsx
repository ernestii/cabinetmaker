import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bounds, Html, OrbitControls } from '@react-three/drei';
import type { Node3D } from '../../domain/types';
import type { Annotations3D, FigPhase } from '../../domain/assembly/figures';
import { nodeAssemblyPhase, phaseOrder } from '../../domain/assembly/nodePhase';
import { isWebGLAvailable } from '../Viewer3D/webgl';
import { NodeView, OpenableGroup } from '../Viewer3D/nodeMesh';
import { scenePos, nodeKey, type Vec3 } from '../Viewer3D/sceneSpace';

// At explode = 1 each part moves this fraction of its distance from the model
// centre further out — a radial "blooming" explosion: sides split left/right,
// top/bottom up/down, the back rearward, fronts forward.
const SPREAD = 0.9;

const mul = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];

const bboxCenter = (nodes: Node3D[]): Vec3 => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.pos[0] - n.size[0] / 2); maxX = Math.max(maxX, n.pos[0] + n.size[0] / 2);
    minY = Math.min(minY, n.pos[1] - n.size[1] / 2); maxY = Math.max(maxY, n.pos[1] + n.size[1] / 2);
    minZ = Math.min(minZ, n.pos[2] - n.size[2] / 2); maxZ = Math.max(maxZ, n.pos[2] + n.size[2] / 2);
  }
  if (!Number.isFinite(minX)) return [0, 0, 0];
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
};

const meanPos = (ns: Node3D[]): Vec3 => {
  const s: Vec3 = [0, 0, 0];
  for (const n of ns) { s[0] += n.pos[0]; s[1] += n.pos[1]; s[2] += n.pos[2]; }
  return [s[0] / ns.length, s[1] / ns.length, s[2] / ns.length];
};

/** Dimension + joinery labels floated over the model at assembled positions
 *  (the crisp panel edges read as the dimension lines). They fade out as the box
 *  explodes, so you read the dims closed, then see the build open. Labels only —
 *  no 3D line geometry, which would perturb the `Bounds` auto-fit. */
function Annotations({ center, annotations, explode }: { center: Vec3; annotations: Annotations3D; explode: number }) {
  const fade = Math.max(0, 1 - explode * 2);
  if (fade <= 0.02) return null;
  const labelStyle = { opacity: fade, pointerEvents: 'none' as const };
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return (
    <group>
      {annotations.dims.map((d, i) => (
        <Html key={`d${i}`} position={mid(scenePos(d.from, center), scenePos(d.to, center))} center style={labelStyle}>
          <span className="fig3d-dim">{d.text}</span>
        </Html>
      ))}
      {annotations.notes.map((n, i) => (
        <Html key={`n${i}`} position={scenePos(n.at, center)} center style={labelStyle}>
          <span className="fig3d-note">{n.text}</span>
        </Html>
      ))}
    </group>
  );
}

/**
 * Scene content: every node, exploded radially from the model centre and (when
 * `activePhase` is set) dimmed if it belongs to a later assembly phase. With no
 * `activePhase` (e.g. the isolated drawer view) all parts stay full colour.
 * Crisp edges + a soft contact shadow give it a rendered-illustration look.
 */
function FigureScene({ nodes, activePhase, explode, annotations, openIds, toggleOpen, highlightPartIds }: {
  nodes: Node3D[]; activePhase?: FigPhase; explode: number; annotations?: Annotations3D;
  openIds: ReadonlySet<string>; toggleOpen: (id: string) => void; highlightPartIds?: ReadonlySet<string>;
}) {
  const center = useMemo(() => bboxCenter(nodes), [nodes]);
  const activeOrder = activePhase ? phaseOrder(activePhase) : Infinity;
  // Part-level highlight (the cut-list hover preview): the named part(s) glow,
  // everything else ghosts — overrides the phase dimming.
  const hit = (n: Node3D) => !!n.partId && !!highlightPartIds?.has(n.partId);
  const dimOf = (n: Node3D) => (highlightPartIds ? !hit(n) : phaseOrder(nodeAssemblyPhase(n)) > activeOrder);
  // Radial explode: push a point further out along its offset from the centre.
  const explodeOffset = (sceneRelCenter: Vec3): Vec3 => mul(sceneRelCenter, explode * SPREAD);

  const singles: Node3D[] = [];
  const groups = new Map<string, Node3D[]>();
  for (const n of nodes) {
    if (n.open) {
      const arr = groups.get(n.open.id);
      if (arr) arr.push(n); else groups.set(n.open.id, [n]);
    } else {
      singles.push(n);
    }
  }

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[8, 12, 6]} intensity={1.1} />
      <directionalLight position={[-6, 6, -4]} intensity={0.45} />
      {singles.map((n) => {
        const sp = scenePos(n.pos, center);
        return (
          <NodeView key={nodeKey(n)} node={n} position={sp} edges
            dim={dimOf(n)} highlight={hit(n)} offset={explodeOffset(sp)} />
        );
      })}
      {[...groups.entries()].map(([id, ns]) => {
        // A drawer group mixes phases (box=boxes, face=faces); represent it by its
        // earliest phase so it appears as soon as its box is built and stays on.
        const order = Math.min(...ns.map((n) => phaseOrder(nodeAssemblyPhase(n))));
        return (
          <OpenableGroup key={id} nodes={ns} center={center} isOpen={openIds.has(id)} edges
            onToggle={() => toggleOpen(id)} dim={order > activeOrder}
            dimFor={highlightPartIds ? dimOf : undefined} highlightFor={highlightPartIds ? hit : undefined}
            offset={explodeOffset(scenePos(meanPos(ns), center))} />
        );
      })}
      {annotations && <Annotations center={center} annotations={annotations} explode={explode} />}
    </>
  );
}

/** Grabs the canvas to a PNG shortly after a render, whenever `trigger` changes
 *  — feeds the print/out-of-view placeholder image. */
function Capture({ trigger, onCapture }: { trigger: string; onCapture: (dataUrl: string) => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const id = setTimeout(() => {
      try { onCapture(gl.domElement.toDataURL('image/png')); } catch { /* tainted/lost ctx — skip */ }
    }, 140);
    return () => clearTimeout(id);
  }, [trigger, gl, onCapture]);
  return null;
}

/** Mount the live canvas only while the figure is on (near) screen, so a long
 *  assembly doc never holds more WebGL contexts than it shows. */
function useInView<T extends Element>(ref: React.RefObject<T | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/**
 * Interactive isometric figure for a set of cabinet-local nodes: drag to orbit,
 * click a drawer/door to open it, and `explode` blooms the parts apart radially
 * (carcass sheets included). With `activePhase` set it also dims parts from later
 * assembly phases (the cabinet stepper); without it everything stays full colour
 * (the isolated drawer view). Reuses the room viewer's node meshes via `nodeMesh`.
 *
 * The canvas mounts only when scrolled near view; out of view (and in print) it
 * shows the last captured snapshot, so the page stays printable and never holds
 * too many live WebGL contexts.
 */
export function Figure3D({ nodes, activePhase, explode, annotations, label = 'figure', highlightPartIds }: {
  nodes: Node3D[]; activePhase?: FigPhase; explode: number; annotations?: Annotations3D; label?: string;
  /** Light up just these cut-list parts and ghost the rest (the hover preview). */
  highlightPartIds?: ReadonlySet<string>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const webgl = isWebGLAvailable();
  const live = webgl && inView;

  return (
    <div ref={wrapRef} className="fig3d">
      {live ? (
        <Canvas
          className="fig3d-canvas"
          orthographic
          camera={{ position: [9, 7, 9], zoom: 36, near: -200, far: 200 }}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          dpr={[1, 2]}
        >
          <Bounds fit clip observe margin={1.25}>
            <FigureScene nodes={nodes} activePhase={activePhase} explode={explode} annotations={annotations}
              openIds={openIds} toggleOpen={toggleOpen} highlightPartIds={highlightPartIds} />
          </Bounds>
          <OrbitControls makeDefault enablePan={false} />
          <Capture trigger={`${activePhase ?? 'all'}:${explode}:${[...openIds].sort().join(',')}:${highlightPartIds ? [...highlightPartIds].join(',') : ''}`} onCapture={setSnapshot} />
        </Canvas>
      ) : snapshot ? (
        <img className="fig3d-snap" src={snapshot} alt={label} />
      ) : (
        <div className="fig3d-placeholder">{webgl ? 'Loading 3D…' : '3D unavailable'}</div>
      )}
      {/* Always-present print image: hidden on screen, shown in @media print. */}
      {snapshot && <img className="fig3d-print" src={snapshot} alt={label} />}
    </div>
  );
}
