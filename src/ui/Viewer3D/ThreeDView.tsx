import { Suspense, lazy } from 'react';
import { Button, Checkbox, Stack, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconLayoutSidebarRight } from '@tabler/icons-react';
import { ObjectTree } from '../LayoutEditor/ObjectTree';
import { Inspector } from '../LayoutEditor/Inspector';
import type { Viewer3DOptions } from './Viewer3D';

// The canvas drags in three.js / fiber / drei — load it on demand. The shell
// (Project sidebar + visibility toggles) is light and renders immediately.
const Viewer3D = lazy(() => import('./Viewer3D').then((m) => ({ default: m.Viewer3D })));

/**
 * The 3D tab's shell: the same Project sidebar as the Layout editor — now also
 * housing the visibility toggles — beside the WebGL canvas. Sharing the layout
 * shell keeps the floating Layout/3D toolbar in the exact same spot across views.
 * Owns the toggle state (persisted) and feeds it to the canvas.
 */
export function ThreeDView({ isMobile }: { isMobile?: boolean }) {
  // Visibility toggles persist across reloads/tab switches (a viewing preference,
  // not project data). Fixed call order — one per node-kind group.
  const [showFronts, setShowFronts] = useLocalStorage({ key: 'cabinetmaker-3d-fronts', defaultValue: true });
  const [showBacks, setShowBacks] = useLocalStorage({ key: 'cabinetmaker-3d-backs', defaultValue: true });
  const [showCounter, setShowCounter] = useLocalStorage({ key: 'cabinetmaker-3d-counter', defaultValue: true });
  const [showWall, setShowWall] = useLocalStorage({ key: 'cabinetmaker-3d-wall', defaultValue: true });
  const [showCeiling, setShowCeiling] = useLocalStorage({ key: 'cabinetmaker-3d-ceiling', defaultValue: false });
  const [showTools, setShowTools] = useLocalStorage({ key: 'cabinetmaker-3d-tools', defaultValue: true });
  const [showInspector, setShowInspector] = useLocalStorage({ key: 'cabinetmaker-3d-inspector', defaultValue: false });

  const options: Viewer3DOptions = { showFronts, showBacks, showCounter, showWall, showCeiling, showTools };
  const toggles: { label: string; checked: boolean; set: (v: boolean) => void }[] = [
    { label: 'Doors / drawers', checked: showFronts, set: setShowFronts },
    { label: 'Back panels', checked: showBacks, set: setShowBacks },
    { label: 'Countertop', checked: showCounter, set: setShowCounter },
    { label: 'Wall', checked: showWall, set: setShowWall },
    { label: 'Ceiling', checked: showCeiling, set: setShowCeiling },
    { label: 'Tools & lighting', checked: showTools, set: setShowTools },
  ];

  const togglesUI = (
    <Stack gap={6}>
      {toggles.map((t) => (
        <Checkbox key={t.label} size="xs" label={t.label} checked={t.checked}
          onChange={(e) => t.set(e.currentTarget.checked)} />
      ))}
    </Stack>
  );

  const hint = 'Drag to orbit · Scroll to zoom · Right-drag to pan. Click a drawer or door to open it.';

  return (
    <div className="layout-editor">
      {/* inspector-open lets the CSS slide the floating Inspector toggle clear
          of the panel (the rails float over the canvas on desktop). */}
      <div className={`editor-body${!isMobile && showInspector ? ' inspector-open' : ''}`}>
        {!isMobile && (
          <ObjectTree
            footer={
              <div className="tree-show">
                <div className="tree-show-head">Show in 3D</div>
                {togglesUI}
                <Text c="dimmed" fz="xs" className="tree-show-hint">{hint}</Text>
              </div>
            }
          />
        )}
        <Suspense fallback={<div className="view-loading">Loading 3D…</div>}>
          {/* On phones there's no sidebar, so the toggles ride in a floating panel. */}
          <Viewer3D
            options={options}
            overlay={isMobile ? (<>{togglesUI}<Text c="dimmed" fz="xs" className="viewer-hint">{hint}</Text></>) : undefined}
            aside={!isMobile ? (
              <Button size="xs" variant={showInspector ? 'filled' : 'default'} leftSection={<IconLayoutSidebarRight size={15} />}
                aria-pressed={showInspector} onClick={() => setShowInspector((v) => !v)}>
                Inspector
              </Button>
            ) : undefined}
          />
        </Suspense>
        {!isMobile && showInspector && <Inspector />}
      </div>
    </div>
  );
}
