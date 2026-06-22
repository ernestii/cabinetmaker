import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Tabs } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconLayoutRows, IconMinus, IconPlus } from '@tabler/icons-react';
import { useStore, allWalls, activeWall } from '../../state/store';
import { DesignNav } from '../DesignNav';
import { Elevation } from './Elevation';
import { Inspector } from './Inspector';
import { ObjectTree } from './ObjectTree';
import { MobileSheet } from './MobileSheet';

export function LayoutEditor() {
  const project = useStore((s) => s.project);
  const selectedWallId = useStore((s) => s.ui.selectedWallId);
  const walls = allWalls(project);
  const wall = activeWall(project, selectedWallId);
  const selectWall = useStore((s) => s.selectWall);
  const selectedElementId = useStore((s) => s.ui.selectedElementId);
  const resetToBlank = useStore((s) => s.resetToBlank);

  const isMobile = useMediaQuery('(max-width: 47.99em)');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [xray, setXray] = useState(false);
  // `F` toggles the face plates (hide the door/drawer fronts to reveal shelves).
  // Ignored while a form field has focus, and lets Cmd/Ctrl-F through to the browser.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'f') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      setXray((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Elevation zoom: 1 = fit-to-width; zooming grows the SVG and the wrap scrolls,
  // so panning is just the native scroll (and hit-testing stays correct because
  // Elevation maps through getScreenCTM). Clamped so you can't lose the drawing.
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 4;
  const zoomBy = (f: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * f * 100) / 100)));

  // Drag-to-pan when zoomed in. A press on empty canvas reaches the wrap (element
  // drags stopPropagation on pointerdown, so they never start a pan); once the
  // pointer moves past a small threshold we capture it and scroll the wrap. The
  // threshold keeps a plain click (which opens the create picker) from panning.
  const wrapRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; sl: number; st: number; id: number; active: boolean } | null>(null);
  const [panning, setPanning] = useState(false);
  const onWrapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || !wrapRef.current) return;
    pan.current = { x: e.clientX, y: e.clientY, sl: wrapRef.current.scrollLeft, st: wrapRef.current.scrollTop, id: e.pointerId, active: false };
  };
  const onWrapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    const el = wrapRef.current;
    if (!p || !el) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.active) {
      if (Math.hypot(dx, dy) < 4) return;
      p.active = true;
      setPanning(true);
      el.setPointerCapture?.(p.id);
    }
    el.scrollLeft = p.sl - dx;
    el.scrollTop = p.st - dy;
  };
  const onWrapPointerUp = () => {
    if (pan.current?.active) wrapRef.current?.releasePointerCapture?.(pan.current.id);
    pan.current = null;
    setPanning(false);
  };
  // Raise the sheet when a section is selected on a phone, so the controls for
  // what you just tapped come into view without a second gesture. Adjusting state
  // during render (vs. an effect) on the selection-changed edge.
  const [prevSel, setPrevSel] = useState(selectedElementId);
  if (selectedElementId !== prevSel) {
    setPrevSel(selectedElementId);
    if (isMobile && selectedElementId) setSheetOpen(true);
  }

  if (!wall) return <div className="pad">No wall yet. <Button variant="default" size="xs" onClick={resetToBlank}>Create one</Button></div>;

  const activeId = selectedWallId ?? walls[0]?.id;

  return (
    <div className="layout-editor">
      {/* Legacy multi-wall projects keep tabs; new projects are one run with
          corner sections, so the tab bar is hidden for a single wall. */}
      {walls.length > 1 && (
        <Tabs value={activeId} onChange={(v) => v && selectWall(v)} variant="outline" px="xs" pt={6}>
          <Tabs.List>
            {walls.map((w) => (
              <Tabs.Tab key={w.id} value={w.id}>
                {w.name}{w.turnDeg ? ` ∠${w.turnDeg}°` : ''}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}
      <div className="editor-body">
        {/* Desktop-only project explorer (hidden on phones via CSS). */}
        {!isMobile && <ObjectTree />}
        <div className="elevation-pane">
          <div className="elevation-toolbar">
            {/* Layout/3D switch + undo/redo, then the face-plate toggle — one bar.
                Add sections by clicking an empty band in the elevation below. */}
            <DesignNav />
            <span className="tb-divider" />
            <Button size="xs" variant={xray ? 'filled' : 'default'} leftSection={<IconLayoutRows size={15} />}
              aria-pressed={xray} title="Toggle face plates (F) — hide the door/drawer fronts to reveal the shelves"
              onClick={() => setXray((v) => !v)}>
              Face plates
            </Button>
          </div>
          <div className="elevation-zoom" onClick={(e) => e.stopPropagation()}>
            <ActionIcon variant="default" size="md" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => zoomBy(1 / 1.25)}><IconMinus size={16} /></ActionIcon>
            <Button variant="subtle" color="gray" size="compact-xs" aria-label="Reset zoom" title="Reset zoom"
              onClick={() => setZoom(1)} style={{ minWidth: 44, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(zoom * 100)}%
            </Button>
            <ActionIcon variant="default" size="md" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => zoomBy(1.25)}><IconPlus size={16} /></ActionIcon>
          </div>
          <div
            ref={wrapRef}
            className={`elevation-wrap${zoom > 1 ? ' zoomed' : ''}${panning ? ' panning' : ''}`}
            onPointerDown={onWrapPointerDown}
            onPointerMove={onWrapPointerMove}
            onPointerUp={onWrapPointerUp}
            onPointerLeave={onWrapPointerUp}
          >
            <Elevation wall={wall} xray={xray} zoom={zoom} />
          </div>
        </div>
        {isMobile ? (
          <MobileSheet
            expanded={sheetOpen}
            onExpandedChange={setSheetOpen}
            peekLabel={selectedElementId ? 'Section details' : 'Wall settings'}
          >
            <Inspector />
          </MobileSheet>
        ) : (
          <Inspector />
        )}
      </div>
    </div>
  );
}
