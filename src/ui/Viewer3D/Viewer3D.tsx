import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Text } from '@mantine/core';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { buildProject } from '../../domain/geometry/buildProject';
import { DesignNav } from '../DesignNav';
import type { Node3D } from '../../domain/types';
import { useStore } from '../../state/store';
import { isWebGLAvailable } from './webgl';
import { NodeView, OpenableGroup } from './nodeMesh';
import { scenePos, nodeKey, S, type Vec3 } from './sceneSpace';

/** Which node kinds the viewer draws — owned by ThreeDView, set from the sidebar. */
export interface Viewer3DOptions {
  showFronts: boolean;
  showBacks: boolean;
  showCounter: boolean;
  showWall: boolean;
  showCeiling: boolean;
  showTools: boolean;
}

export function Viewer3D({ options, overlay, aside }: { options: Viewer3DOptions; overlay?: ReactNode; aside?: ReactNode }) {
  const project = useStore((s) => s.project);
  const selOpeningId = useStore((s) => s.ui.selectedOpeningId);
  const selElementId = useStore((s) => s.ui.selectedElementId);
  const selElementIds = useStore((s) => s.ui.selectedElementIds);
  const select = useStore((s) => s.select);
  const { showFronts, showBacks, showCounter, showWall, showCeiling, showTools } = options;

  // Click empty space or a wall to clear the selection. R3F's onPointerMissed
  // fires for any click that doesn't land on a mesh WITH handlers — walls and
  // carcasses have none, while drawer/door fronts stopPropagation, so opening a
  // front never deselects. The down-position guard keeps an orbit/pan drag (which
  // also ends in a "missed" click) from clearing the selection.
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const clearOnBackground = (e: MouseEvent) => {
    const d = downPos.current;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // a drag, not a click
    if (selOpeningId || selElementId || selElementIds?.length) select(undefined);
  };

  // Highlight the current store selection: a picked front (drawer/door) by its
  // openingId, otherwise the picked cabinet(s)/element(s) by ownerId.
  const isSelected = (n: Node3D): boolean => {
    if (selOpeningId) return n.openingId === selOpeningId;
    const ids = selElementIds?.length ? selElementIds : selElementId ? [selElementId] : [];
    return !!n.ownerId && ids.includes(n.ownerId);
  };
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const { nodes, center } = useMemo(() => {
    const { nodes } = buildProject(project);
    if (nodes.length === 0) return { nodes, center: [0, 0, 0] as Vec3 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of nodes) {
      // Centre the camera on the cabinetry, not the big wall/ceiling planes.
      if (n.kind === 'wall' || n.kind === 'ceiling') continue;
      minX = Math.min(minX, n.pos[0] - n.size[0] / 2); maxX = Math.max(maxX, n.pos[0] + n.size[0] / 2);
      minY = Math.min(minY, n.pos[1] - n.size[1] / 2); maxY = Math.max(maxY, n.pos[1] + n.size[1] / 2);
      minZ = Math.min(minZ, n.pos[2] - n.size[2] / 2); maxZ = Math.max(maxZ, n.pos[2] + n.size[2] / 2);
    }
    if (!Number.isFinite(minX)) return { nodes, center: [0, 0, 0] as Vec3 };
    return { nodes, center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as Vec3 };
  }, [project]);

  const visible = nodes.filter(
    (n) =>
      (showFronts || (n.kind !== 'face' && n.kind !== 'handle')) &&
      (showBacks || n.kind !== 'back') &&
      (showCounter || n.kind !== 'counter') &&
      (showWall || n.kind !== 'wall') &&
      (showCeiling || n.kind !== 'ceiling') &&
      (showTools || (n.kind !== 'light' && !n.modelUrl)),
  );

  // Split into static nodes and the drawer/door groups that open when clicked.
  const singles: Node3D[] = [];
  const groups = new Map<string, Node3D[]>();
  for (const n of visible) {
    if (n.open) {
      const arr = groups.get(n.open.id);
      if (arr) arr.push(n);
      else groups.set(n.open.id, [n]);
    } else {
      singles.push(n);
    }
  }

  if (!isWebGLAvailable()) {
    return (
      <div className="viewer3d viewer3d-unavailable" role="alert">
        <p>3D preview is unavailable because this browser or device doesn't support WebGL.</p>
        <Text c="dimmed" fz="xs">The Layout, Cut List and Assembly views still work without 3D.</Text>
      </div>
    );
  }

  return (
    <div className="viewer3d" onPointerDown={(e) => { downPos.current = { x: e.clientX, y: e.clientY }; }}>
      <div className="viewer-topbar">
        <DesignNav />
      </div>
      {aside && <div className="viewer-topright">{aside}</div>}
      {overlay && <div className="viewer-toolbar">{overlay}</div>}
      <Canvas camera={{ position: [6, 5, 9], fov: 45 }} shadows onPointerMissed={clearOnBackground}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 12, 6]} intensity={1.1} />
        <directionalLight position={[-6, 6, -4]} intensity={0.4} />
        <group>
          {/* Stable, content-based keys: index keys would let a toggle reuse a
              mesh for a different node, and THREE doesn't recompile a material
              when its map is added/removed that way — leaving panels blank. */}
          {singles.map((n) => <NodeView key={nodeKey(n)} node={n} position={scenePos(n.pos, center)} highlight={isSelected(n)} />)}
          {[...groups.entries()].map(([id, ns]) => (
            <OpenableGroup key={id} nodes={ns} center={center} isOpen={openIds.has(id)} onToggle={() => toggleOpen(id)} highlight={ns.some(isSelected)} />
          ))}
        </group>
        <Grid args={[40, 40]} cellSize={1} sectionSize={5} infiniteGrid fadeDistance={40} position={[0, (-center[1]) * S, 0]} />
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
