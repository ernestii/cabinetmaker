import { Fragment } from 'react';
import { Box } from '@mantine/core';
import { IconCut, IconHammer, IconRuler2, IconShoppingCart, IconStack2 } from '@tabler/icons-react';
import { useStore, type ViewKey } from '../state/store';
import { VIEWS, NAV_GROUPS, groupForView, rememberView, resolveGroupTarget } from './views';

/** A dock chip: one click target covering one or more views. */
type Chip = { key: string; label: string; views: ViewKey[] };

const ICONS: Record<string, React.ComponentType<{ size?: number; stroke?: number }>> = {
  design: IconRuler2,
  cutlist: IconCut,
  shopping: IconShoppingCart,
  assembly: IconHammer,
  materials: IconStack2,
};

/**
 * The Design group collapses to a single chip — its Layout/3D switch lives in
 * the elevation/3D toolbar (DesignNav), so the dock only needs to get you into
 * the design space. Every other view gets its own chip.
 */
const CHIP_GROUPS: Chip[][] = NAV_GROUPS.map((g) =>
  g.key === 'design'
    ? [{ key: g.key, label: g.label, views: g.views }]
    : g.views.map((v) => ({ key: v, label: VIEWS.find((x) => x.key === v)?.label ?? v, views: [v] })),
);

/**
 * Desktop view switcher: a floating pill pinned bottom-centre (rendered by
 * StatusBar.tsx between the status pills that float in the bottom corners).
 * Hairline separators mark the Design / Plan / Materials groups; a multi-view
 * chip (Design) lands on its remembered view. Phones use the bottom tab bar +
 * sub-nav instead (this is hidden below the `sm` breakpoint).
 */
export function Dock() {
  const view = useStore((s) => s.ui.view);
  const setView = useStore((s) => s.setView);

  function go(chip: Chip) {
    if (chip.views.includes(view)) return;
    const target = chip.views.length > 1 ? resolveGroupTarget(groupForView(chip.views[0])) : chip.views[0];
    setView(target);
    rememberView(target);
    // Keep the deep-link hash in sync without pushing a history entry per click.
    history.replaceState(null, '', `#${target}`);
  }

  return (
    <Box component="nav" className="dock" aria-label="Views" visibleFrom="sm">
      {CHIP_GROUPS.map((chips, i) => (
        <Fragment key={chips[0].key}>
          {i > 0 && <span className="dock-sep" />}
          {chips.map((chip) => {
            const Icon = ICONS[chip.key] ?? IconStack2;
            const active = chip.views.includes(view);
            return (
              <button
                key={chip.key}
                type="button"
                className={active ? 'dock-item active' : 'dock-item'}
                aria-current={active ? 'page' : undefined}
                title={chip.label}
                onClick={() => go(chip)}
              >
                <Icon size={16} stroke={1.8} />
                <span className="dock-label">{chip.label}</span>
              </button>
            );
          })}
        </Fragment>
      ))}
    </Box>
  );
}
