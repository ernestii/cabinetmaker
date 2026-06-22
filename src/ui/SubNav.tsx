import { Box, SegmentedControl } from '@mantine/core';
import { useStore, type ViewKey } from '../state/store';
import { VIEWS, groupForView } from './views';

const LABEL = Object.fromEntries(VIEWS.map((v) => [v.key, v.label])) as Record<ViewKey, string>;

/**
 * Phone-only secondary tab strip (a Mantine SegmentedControl). When the active
 * bottom-nav group holds more than one view (Plan → Cut List/Shopping/Assembly)
 * this surfaces those siblings so switching is one tap. The Design group is
 * skipped — its Layout/3D switch already lives in the elevation/3D toolbar
 * (DesignNav). Hidden on desktop via `hiddenFrom="sm"` (the dock covers it).
 */
export function SubNav() {
  const view = useStore((s) => s.ui.view);
  const setView = useStore((s) => s.setView);
  const group = groupForView(view);

  if (group.views.length < 2 || group.key === 'design') return null;

  function go(v: string) {
    setView(v as ViewKey);
    history.replaceState(null, '', `#${v}`);
  }

  return (
    <Box hiddenFrom="sm" p={6} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', background: 'var(--mantine-color-dark-6)' }}>
      <SegmentedControl
        fullWidth size="sm" value={view} onChange={go}
        aria-label={`${group.label} views`}
        data={group.views.map((v) => ({ value: v, label: LABEL[v] }))}
      />
    </Box>
  );
}
