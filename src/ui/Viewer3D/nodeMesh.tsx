import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html, useGLTF } from '@react-three/drei';
import { Box3, CylinderGeometry, ExtrudeGeometry, Shape, Vector3 } from 'three';
import type { BufferGeometry, Group } from 'three';
import type { Node3D } from '../../domain/types';
import { applyTextureUv, isMarble, isMaterialTexture, isMelamine, materialTexture } from './materialTexture';
import { getViewerOverlay, type ViewerOverlay } from '../plugins/registry';
import { S, nodeKey, scenePos, type Vec3 } from './sceneSpace';

/** How far a door swings open. */
const DOOR_OPEN_ANGLE = Math.PI / 2;
/** Opacity of a node dimmed out because it doesn't belong to the active phase. */
const DIM_OPACITY = 0.12;
/** Emissive accent for the currently-selected cabinet/drawer (brand indigo). */
const HIGHLIGHT = '#6f8fd6';

const ZERO: Vec3 = [0, 0, 0];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** A point `dist` from `a` toward `b`, clamped to the segment's half-length. */
function towards(a: [number, number], b: [number, number], dist: number): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min(dist, len / 2) / len;
  return [a[0] + dx * t, a[1] + dy * t];
}

/**
 * Rounded-trapezoid prism for an IKEA Alex–style routed finger pull: wider at the
 * top (the open mouth at the drawer's top edge), tapering down, corners eased.
 * Built in the XY plane and extruded along +z, then centred on z like a box.
 */
function fingerPullGeometry(size: Vec3): BufferGeometry {
  const [topW, h, depth] = size;
  const botW = topW * 0.78; // gentle taper — a soft pill, not a sharp wedge
  const r = Math.min(h, botW) * 0.45; // generously rounded corners
  const corners: [number, number][] = [
    [-topW / 2, h / 2],
    [topW / 2, h / 2],
    [botW / 2, -h / 2],
    [-botW / 2, -h / 2],
  ];
  const shape = new Shape();
  for (let i = 0; i < corners.length; i++) {
    const prev = corners[(i - 1 + corners.length) % corners.length];
    const curr = corners[i];
    const next = corners[(i + 1) % corners.length];
    const inP = towards(curr, prev, r);
    const outP = towards(curr, next, r);
    if (i === 0) shape.moveTo(inP[0], inP[1]);
    else shape.lineTo(inP[0], inP[1]);
    shape.quadraticCurveTo(curr[0], curr[1], outP[0], outP[1]);
  }
  shape.closePath();
  // curveSegments smooths the rounded corners; a small bevel eases the front lip.
  const bevel = Math.min(depth * 0.4, 0.04);
  const geo = new ExtrudeGeometry(shape, {
    depth: depth - bevel * 2, curveSegments: 16,
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Round prism along `axis` fitted into the node's box (burner disc, bar handle, porthole). */
function cylinderGeometryFor(size: Vec3, axis: 'x' | 'y' | 'z'): BufferGeometry {
  const [w, h, d] = size;
  const [radius, length] =
    axis === 'x' ? [Math.min(h, d) / 2, w] : axis === 'z' ? [Math.min(w, h) / 2, d] : [Math.min(w, d) / 2, h];
  const geo = new CylinderGeometry(radius, radius, length, 28);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  return geo;
}

/** Flat-shaded tapered box: full footprint at the bottom, `topScale` of it on top (hood canopy). */
function frustumGeometry(size: Vec3, topScale: number): BufferGeometry {
  // A 4-segment cylinder rotated 45° is a square frustum of side 1; scale to the box.
  const r = Math.SQRT1_2;
  const geo = new CylinderGeometry(r * topScale, r, 1, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.scale(size[0], size[1], size[2]);
  geo.computeVertexNormals();
  return geo;
}

/** PBR params for a node's declared surface finish (appliances: steel/glass/enamel). */
const FINISHES: Record<NonNullable<Node3D['finish']>, { roughness: number; metalness: number }> = {
  // No environment map in the scene, so metalness stays moderate — full metal
  // would reflect nothing and render black.
  steel: { roughness: 0.32, metalness: 0.3 },
  glass: { roughness: 0.08, metalness: 0.15 },
  enamel: { roughness: 0.42, metalness: 0.08 },
};

function Box({ node, position, dim, highlight, edges, onSelect, onHoverChange }: {
  node: Node3D; position: Vec3; dim?: boolean; highlight?: boolean; edges?: boolean; onSelect?: () => void; onHoverChange?: (hovered: boolean) => void;
}) {
  const size: Vec3 = [node.size[0] * S, node.size[1] * S, node.size[2] * S];
  const ghosted = node.kind === 'drawerBox';
  const isLeg = node.kind === 'leg';
  const isHandle = node.kind === 'handle';
  const radius = Math.min(size[0], size[2]) / 2;
  // The material's texture/finish key (e.g. 'birch', 'marbleBlack', 'melamine')
  // rides along on textureUrl.
  const tex = isMaterialTexture(node.textureUrl) ? materialTexture(node.textureUrl) : null;
  const marble = isMarble(node.textureUrl);
  const melamine = isMelamine(node.textureUrl);
  const geomRef = useRef<BufferGeometry>(null);
  const customGeo = useMemo(
    () =>
      node.shape === 'fingerPull' ? fingerPullGeometry(size)
      : node.shape === 'cylinder' ? cylinderGeometryFor(size, node.axis ?? 'y')
      : node.shape === 'frustum' ? frustumGeometry(size, node.topScale ?? 0.5)
      : null,
    // size is rebuilt each render; key on the underlying inches instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node.shape, node.axis, node.topScale, node.size[0], node.size[1], node.size[2]],
  );
  // R3F only auto-disposes JSX-created geometries; a <primitive> geometry built
  // by hand must be freed here or its GPU buffers leak on resize/unmount.
  useEffect(() => () => customGeo?.dispose(), [customGeo]);
  // Scale the texture to the panel's real size so it never stretches by aspect.
  useLayoutEffect(() => {
    if (geomRef.current && tex && !isLeg) applyTextureUv(geomRef.current, node.size);
  }, [tex, isLeg, node.size]);
  // Finish: an explicit node finish (appliances) wins; else marble = glossy
  // stone, melamine = satin, wood = matte.
  const fin = node.finish ? FINISHES[node.finish] : null;
  const roughness = fin ? fin.roughness : isHandle ? 0.3 : marble ? 0.16 : melamine ? 0.35 : tex ? 0.6 : node.kind === 'counter' ? 0.3 : isLeg ? 0.4 : 0.7;
  const metalness = fin ? fin.metalness : isHandle ? 0.8 : marble ? 0.1 : melamine ? 0.05 : tex ? 0 : node.kind === 'counter' ? 0.2 : isLeg ? 0.6 : 0;
  // A node outside the active assembly phase is ghosted so the step's parts pop.
  const transparent = ghosted || !!dim;
  const opacity = dim ? DIM_OPACITY : ghosted ? 0.35 : 1;
  const interactive = !!onSelect;
  const hoverable = interactive || !!onHoverChange;
  return (
    <mesh
      position={position}
      rotation={[0, node.rotY ?? 0, 0]}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onSelect!();
            }
          : undefined
      }
      onPointerOver={
        hoverable
          ? (e) => {
              e.stopPropagation();
              if (interactive) document.body.style.cursor = 'pointer';
              onHoverChange?.(true);
            }
          : undefined
      }
      onPointerOut={hoverable ? () => { if (interactive) document.body.style.cursor = ''; onHoverChange?.(false); } : undefined}
    >
      {isLeg ? (
        <cylinderGeometry args={[radius, radius, size[1], 20]} />
      ) : customGeo ? (
        <primitive object={customGeo} attach="geometry" />
      ) : (
        <boxGeometry ref={geomRef} args={size} />
      )}
      <meshStandardMaterial
        color={tex ? '#ffffff' : node.color}
        map={tex ?? undefined}
        transparent={transparent}
        opacity={opacity}
        depthWrite={!dim}
        roughness={roughness}
        metalness={metalness}
        flatShading={node.shape === 'frustum'}
        emissive={highlight ? HIGHLIGHT : node.emissive ?? '#000000'}
        emissiveIntensity={highlight ? 0.5 : node.emissive ? node.emissiveIntensity ?? 1 : 0}
      />
      {/* Crisp outline so exploded parts read as a technical illustration. Off by
          default (the room scene stays flat-shaded); the assembly figure turns it on. */}
      {edges && !dim && <Edges threshold={15} color="#21242b" />}
    </mesh>
  );
}

/**
 * A sourced glTF model fitted into the node's box: auto-centred and uniformly
 * scaled so its bounding box matches `node.size`. The scene is cloned so the same
 * cached asset can appear in more than one node. Errors/missing assets are caught
 * upstream by <ModelBoundary>, which falls back to the plain box.
 */
function Model({ node, position }: { node: Node3D; position: Vec3 }) {
  const { scene } = useGLTF(node.modelUrl!);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const { scale, center } = useMemo(() => {
    const box = new Box3().setFromObject(cloned);
    const dim = box.getSize(new Vector3());
    const ctr = box.getCenter(new Vector3());
    const target: Vec3 = [node.size[0] * S, node.size[1] * S, node.size[2] * S];
    const s = Math.min(target[0] / (dim.x || 1), target[1] / (dim.y || 1), target[2] / (dim.z || 1));
    return { scale: s, center: ctr };
  }, [cloned, node.size]);
  return (
    <group position={position} rotation={[0, (node.rotY ?? 0) + (node.modelRotationY ?? 0), 0]}>
      <group scale={scale} position={[-center.x * scale, -center.y * scale, -center.z * scale]}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

/** Mounts a plugin's registered viewer overlay (received as a prop, or nothing). */
function OverlayMount({ overlay: Overlay, node, position }: { overlay?: ViewerOverlay; node: Node3D; position: Vec3 }) {
  return Overlay ? <Overlay node={node} position={position} /> : null;
}

/** Renders its children, but falls back to the box if a model fails to load. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * One scene node: a glTF model (if `modelUrl`, with the box as Suspense/error
 * fallback), otherwise the box; plus a soft point light for `light` nodes and a
 * small floating badge when one is set (e.g. gridfinity capacity).
 *
 * `dim` ghosts the node (used by the assembly figure to fade non-active-phase
 * parts); `offset` shifts it in scene space (used for the exploded view). Both
 * default to no-op so the room viewer renders exactly as before.
 */
export function NodeView({ node, position, onSelect, isOpen, dim, highlight, edges, offset }: {
  node: Node3D; position: Vec3; onSelect?: () => void; isOpen?: boolean; dim?: boolean; highlight?: boolean; edges?: boolean; offset?: Vec3;
}) {
  const [hovered, setHovered] = useState(false);
  const pos = offset ? add(position, offset) : position;
  // A badge on an openable node (e.g. the gridfinity grid size) only shows once
  // the drawer is pulled out; badges on static nodes always show.
  const showBadge = !dim && !!node.badge && (!node.open || !!isOpen);
  const box = <Box node={node} position={pos} dim={dim} highlight={highlight} edges={edges} onSelect={onSelect} onHoverChange={node.tooltip ? setHovered : undefined} />;
  return (
    <>
      {node.modelUrl ? (
        <ModelBoundary fallback={box}>
          <Suspense fallback={box}>
            <Model node={node} position={pos} />
          </Suspense>
        </ModelBoundary>
      ) : (
        box
      )}
      {/* A plugin can attach an interactive React overlay to a node via overlayId
          (the escape hatch for 3D UI the static badge/tooltip can't express). */}
      <OverlayMount overlay={getViewerOverlay(node.overlayId)} node={node} position={pos} />
      {node.kind === 'light' && !dim && (
        <pointLight position={pos} intensity={0.5} distance={6 * S * 12} color={node.emissive ?? node.color} />
      )}
      {showBadge && (
        <Html position={pos} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
          <span className="viewer-badge">{node.badge}</span>
        </Html>
      )}
      {node.tooltip && hovered && (
        <Html position={pos} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <span className="viewer-tooltip">{node.tooltip}</span>
        </Html>
      )}
    </>
  );
}

/**
 * A drawer or door that opens when clicked. All its nodes live in one THREE
 * group: a drawer's group slides out along the cabinet's forward axis; a door's
 * group rotates about its hinge, so we anchor the group at the hinge point and
 * offset the children from it. A spring-ish ease animates between the two states.
 *
 * `dim` ghosts the whole group; `offset` shifts the group in scene space (the
 * exploded view). Both default to no-op for the room viewer. `dimFor`/
 * `highlightFor` override them per node (a drawer group mixes box + face parts,
 * and a part-level highlight must light up just one of them).
 */
export function OpenableGroup({ nodes, center, isOpen, onToggle, dim, highlight, edges, offset, dimFor, highlightFor }: {
  nodes: Node3D[]; center: Vec3; isOpen: boolean; onToggle: () => void; dim?: boolean; highlight?: boolean; edges?: boolean; offset?: Vec3;
  dimFor?: (n: Node3D) => boolean; highlightFor?: (n: Node3D) => boolean;
}) {
  const ref = useRef<Group>(null);
  const progress = useRef(0);
  const spec = nodes[0].open!;
  const off = offset ?? ZERO;

  const { basePos, childPositions, forward } = useMemo(() => {
    if (spec.kind === 'door' && spec.pivot) {
      // Anchor at the hinge; children swing around the group's origin.
      const pivot = scenePos(spec.pivot, center);
      return {
        basePos: pivot,
        forward: [0, 0, 0] as Vec3,
        childPositions: nodes.map((n) => {
          const s = scenePos(n.pos, center);
          return [s[0] - pivot[0], s[1] - pivot[1], s[2] - pivot[2]] as Vec3;
        }),
      };
    }
    // Drawer: the whole group slides along the cabinet's local +z, mapped to
    // world by the node's wall rotation.
    const rotY = nodes[0].rotY ?? 0;
    return {
      basePos: [0, 0, 0] as Vec3,
      forward: [Math.sin(rotY), 0, Math.cos(rotY)] as Vec3,
      childPositions: nodes.map((n) => scenePos(n.pos, center)),
    };
  }, [nodes, center, spec]);

  const anchor = add(basePos, off);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const target = isOpen ? 1 : 0;
    const p = progress.current;
    if (p === target) return; // settled — nothing to animate
    const next = Math.abs(target - p) < 0.001 ? target : p + (target - p) * Math.min(1, dt * 6);
    progress.current = next;
    if (spec.kind === 'door') {
      g.rotation.y = (spec.swing ?? 1) * DOOR_OPEN_ANGLE * next;
    } else {
      const dist = (spec.travel ?? 0) * S * next;
      g.position.set(anchor[0] + forward[0] * dist, anchor[1], anchor[2] + forward[2] * dist);
    }
  });

  return (
    <group ref={ref} position={anchor}>
      {nodes.map((n, i) => (
        <NodeView key={nodeKey(n)} node={n} position={childPositions[i]} onSelect={onToggle} isOpen={isOpen}
          dim={dimFor ? dimFor(n) : dim} highlight={highlightFor ? highlightFor(n) : highlight} edges={edges} />
      ))}
    </group>
  );
}
