import { ActionIcon, Button, Tooltip } from '@mantine/core';
import { IconArrowBackUp, IconArrowForwardUp, IconCube, IconRuler2 } from '@tabler/icons-react';
import { useStore, type ViewKey } from '../state/store';
import { rememberView } from './views';

/**
 * Shared Design-view control cluster: the Layout↔3D switch combined with the
 * global undo/redo buttons. Lives in both the elevation toolbar and the 3D
 * viewer toolbar so the sub-navigation sits with the tools (rather than in a
 * separate header row).
 */
export function DesignNav() {
  const view = useStore((s) => s.ui.view);
  const setView = useStore((s) => s.setView);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const go = (v: ViewKey) => { setView(v); rememberView(v); history.replaceState(null, '', `#${v}`); };

  const is3d = view === '3d';
  return (
    <div className="design-nav">
      {/* Layout/3D as two plain toolbar buttons — uniform with the undo/redo and
          shelves controls, so the bar reads as one cohesive set (no nested
          segmented track). Active = filled accent; inactive = default surface. */}
      <Button size="xs" variant={!is3d ? 'filled' : 'default'} leftSection={<IconRuler2 size={15} />}
        aria-pressed={!is3d} onClick={() => go('layout')}>Layout</Button>
      <Button size="xs" variant={is3d ? 'filled' : 'default'} leftSection={<IconCube size={15} />}
        aria-pressed={is3d} onClick={() => go('3d')}>3D</Button>
      <span className="tb-divider" />
      <Tooltip label="Undo (⌘Z)" withArrow>
        <ActionIcon variant="default" size="md" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <IconArrowBackUp size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Redo (⇧⌘Z)" withArrow>
        <ActionIcon variant="default" size="md" aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <IconArrowForwardUp size={16} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}
