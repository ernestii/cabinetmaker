import { useState, type MouseEvent, type ReactNode } from 'react';
import { Menu } from '@mantine/core';
import { IconChevronRight, IconChevronDown, IconLayoutSidebarLeftCollapse } from '@tabler/icons-react';
import { useStore } from '../../state/store';
import { elementKind } from '../../domain/elements';
import { getFixture, getFrontType, listCabinetAddons } from '../../domain/plugins';
import type { Cabinet, WallElement, Zone } from '../../domain/types';

const BAND: Record<Zone, string> = { base: 'Base', upper: 'Upper', tall: 'Tall' };
const ADDON_LABEL = Object.fromEntries(listCabinetAddons().map((a) => [a.id, a.label])) as Record<string, string>;

/** Headline for a section row: its kind in its band (an appliance reads as its model). */
function elementLabel(el: WallElement): string {
  const kind = elementKind(el);
  if (kind === 'workbench') return 'Workbench';
  if (kind === 'appliance') return getFixture(el.fixtureId)?.label ?? 'Appliance';
  if (kind === 'empty') return 'Empty';
  return `${BAND[el.zone]} cabinet`; // cabinet, plain or with an integrated drop-in
}

/** A disclosure triangle; flips when its node is open. Static for childless leaves. */
function Twisty({ open, has, onToggle }: { open: boolean; has: boolean; onToggle: () => void }) {
  if (!has) return <span className="tree-twisty empty" aria-hidden />;
  return (
    <button type="button" className="tree-twisty" aria-label={open ? 'Collapse' : 'Expand'}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
    </button>
  );
}

/** One clickable row at a given depth, with an optional twisty and a dim suffix. */
function Row({ depth, label, suffix, active, hasChildren, open, onToggle, onClick, onContextMenu }: {
  depth: number; label: string; suffix?: string; active?: boolean;
  hasChildren: boolean; open: boolean; onToggle: () => void; onClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
}) {
  return (
    <div className={`tree-row${active ? ' active' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}
      role="treeitem" aria-selected={active} aria-expanded={hasChildren ? open : undefined}
      onClick={onClick} onContextMenu={onContextMenu}>
      <Twisty open={open} has={hasChildren} onToggle={onToggle} />
      <span className="tree-label">{label}</span>
      {suffix && <span className="tree-suffix">{suffix}</span>}
    </div>
  );
}

/**
 * VSCode-style project explorer for the Layout view: room → wall → section →
 * fronts / add-ons. Clicking a node drives the same store selection the elevation
 * and Inspector read, so the three stay in lockstep. Desktop-only (the phone uses
 * the bottom-sheet Inspector and has no room for a tree) — hidden via CSS.
 */
export function ObjectTree({ footer }: { footer?: ReactNode } = {}) {
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const select = useStore((s) => s.select);
  const selectWall = useStore((s) => s.selectWall);
  const selectOpening = useStore((s) => s.selectOpening);
  const selectRoom = useStore((s) => s.selectRoom);
  const removeElement = useStore((s) => s.removeElement);
  const duplicateElement = useStore((s) => s.duplicateElement);
  const removeWall = useStore((s) => s.removeWall);

  // Right-click context menu, anchored at the cursor. `kind` picks the actions.
  const [ctx, setCtx] = useState<{ x: number; y: number; kind: 'wall' | 'element'; id: string } | null>(null);
  const openCtx = (e: MouseEvent, kind: 'wall' | 'element', id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, kind, id });
  };
  const wallCount = project.rooms.reduce((n, r) => n + r.walls.length, 0);

  // Default-expand rooms + walls; sections expand on demand. Ids in the set are open.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const r of project.rooms) {
      init.add(r.id);
      for (const w of r.walls) init.add(w.id);
    }
    return init;
  });
  const [collapsed, setCollapsed] = useState(false);
  const isOpen = (id: string) => expanded.has(id);
  const toggle = (id: string) =>
    setExpanded((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });

  // Reveal whatever's selected (e.g. clicked in the elevation): open the chain
  // down to the selected section so it's visible in the tree. Done on the
  // selection-changed edge during render (vs. an effect) so there's no extra pass.
  const [revealedFor, setRevealedFor] = useState<string | undefined>(undefined);
  if (ui.selectedElementId && ui.selectedElementId !== revealedFor) {
    setRevealedFor(ui.selectedElementId);
    const id = ui.selectedElementId;
    const wall = project.rooms.flatMap((r) => r.walls).find((w) => w.elements?.some((e) => e.id === id));
    if (wall) setExpanded((s) => (s.has(wall.id) && s.has(id) ? s : new Set(s).add(wall.id).add(id)));
  }

  // Select a section (and make its wall active, since the elevation shows one wall).
  const pickElement = (wallId: string, elId: string) => { selectWall(wallId); select(elId); };
  const pickOpening = (wallId: string, elId: string, opId: string) => { selectWall(wallId); select(elId); selectOpening(opId); };

  if (collapsed) {
    return (
      <div className="object-tree collapsed">
        <button type="button" className="tree-expand" title="Show project tree" aria-label="Show project tree"
          onClick={() => setCollapsed(false)}><IconChevronRight size={15} /></button>
      </div>
    );
  }

  return (
    <div className="object-tree" role="tree" aria-label="Project">
      <div className="tree-head">
        <span>Project</span>
        <button type="button" className="tree-collapse" title="Hide project tree" aria-label="Hide project tree"
          onClick={() => setCollapsed(true)}><IconLayoutSidebarLeftCollapse size={15} /></button>
      </div>
      <div className="tree-body">
        {project.rooms.map((room) => (
          <div key={room.id}>
            <Row depth={0} label={room.name} active={ui.roomSelected} hasChildren={room.walls.length > 0} open={isOpen(room.id)}
              onToggle={() => toggle(room.id)} onClick={() => selectRoom()} />
            {isOpen(room.id) && room.walls.map((wall) => {
              const els = [...(wall.elements ?? [])].sort((a, b) => a.xIn - b.xIn);
              const wallActive = ui.selectedWallId === wall.id && !ui.selectedElementId;
              return (
                <div key={wall.id}>
                  <Row depth={1} label={wall.name} active={wallActive} hasChildren={els.length > 0} open={isOpen(wall.id)}
                    onToggle={() => toggle(wall.id)} onClick={() => selectWall(wall.id)}
                    onContextMenu={(e) => { selectWall(wall.id); openCtx(e, 'wall', wall.id); }} />
                  {isOpen(wall.id) && els.map((el) => {
                    const elActive = ui.selectedElementId === el.id && !ui.selectedOpeningId;
                    const children = elementChildren(el);
                    return (
                      <div key={el.id}>
                        <Row depth={2} label={elementLabel(el)} suffix={`${trim(el.widthIn)}"`} active={elActive}
                          hasChildren={children.length > 0} open={isOpen(el.id)}
                          onToggle={() => toggle(el.id)} onClick={() => pickElement(wall.id, el.id)}
                          onContextMenu={(e) => { pickElement(wall.id, el.id); openCtx(e, 'element', el.id); }} />
                        {isOpen(el.id) && children.map((c) =>
                          c.kind === 'front' ? (
                            <Row key={c.id} depth={3} label={c.label} active={ui.selectedOpeningId === c.id}
                              hasChildren={false} open={false} onToggle={() => {}}
                              onClick={() => pickOpening(wall.id, el.id, c.id)} />
                          ) : (
                            <Row key={c.id} depth={3} label={c.label} suffix="add-on"
                              hasChildren={false} open={false} onToggle={() => {}}
                              onClick={() => pickElement(wall.id, el.id)} />
                          ),
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {footer && <div className="tree-footer">{footer}</div>}

      {/* Right-click menu, anchored at the cursor (a zero-size fixed target). */}
      {ctx && (
        <Menu opened position="bottom-start" shadow="md" width={180} withinPortal onChange={(o) => { if (!o) setCtx(null); }}>
          <Menu.Target>
            <div style={{ position: 'fixed', left: ctx.x, top: ctx.y, width: 0, height: 0 }} />
          </Menu.Target>
          <Menu.Dropdown>
            {ctx.kind === 'element' ? (
              <>
                <Menu.Label>Section</Menu.Label>
                <Menu.Item onClick={() => { duplicateElement(ctx.id); setCtx(null); }}>Duplicate</Menu.Item>
                <Menu.Item color="red" onClick={() => { removeElement(ctx.id); select(undefined); setCtx(null); }}>Delete</Menu.Item>
              </>
            ) : (
              <>
                <Menu.Label>Wall</Menu.Label>
                <Menu.Item color="red" disabled={wallCount <= 1}
                  onClick={() => { removeWall(ctx.id); setCtx(null); }}>Delete</Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      )}
    </div>
  );
}

type TreeChild = { kind: 'front' | 'addon'; id: string; label: string };

/** A section's expandable children: a cabinet's fronts then its add-ons; else none. */
function elementChildren(el: WallElement): TreeChild[] {
  const cab: Cabinet | undefined = el.cabinet;
  if (!cab) return [];
  const fronts: TreeChild[] = cab.front.map((op, i) => ({
    kind: 'front', id: op.id, label: `${i + 1}. ${getFrontType(op.type)?.label ?? op.type}`,
  }));
  const addons: TreeChild[] = (cab.addons ?? []).map((id) => ({ kind: 'addon', id, label: ADDON_LABEL[id] ?? id }));
  return [...fronts, ...addons];
}

/** Compact width: whole inches without the trailing ".0". */
const trim = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''));
