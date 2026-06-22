import type { ViewKey } from '../state/store';

/** The app's top-level views, in nav order. Shared by the desktop dock + phone nav. */
export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'layout', label: 'Layout' },
  { key: '3d', label: '3D' },
  { key: 'cutlist', label: 'Cut List' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'assembly', label: 'Assembly' },
  { key: 'materials', label: 'Materials' },
];

/** Stable keys for the grouped mobile bottom-nav. */
export type NavGroupKey = 'design' | 'plan' | 'materials';

/**
 * Mobile information architecture: the views collapse into grouped tabs for
 * the phone bottom-nav. A group with several views shows a secondary sub-tab
 * strip (see SubNav) so e.g. Layout/3D or Cut List/Shopping/Assembly stay one
 * tap apart without crowding the bar. The desktop dock keeps the flat view
 * list (it has the room) and only uses these groups for its separators.
 */
export const NAV_GROUPS: { key: NavGroupKey; label: string; views: ViewKey[] }[] = [
  { key: 'design', label: 'Design', views: ['layout', '3d'] },
  { key: 'plan', label: 'Plan', views: ['cutlist', 'shopping', 'assembly'] },
  { key: 'materials', label: 'Materials', views: ['materials'] },
];

/** The group a view belongs to (every view lives in exactly one group). */
export function groupForView(view: ViewKey): (typeof NAV_GROUPS)[number] {
  return NAV_GROUPS.find((g) => g.views.includes(view)) ?? NAV_GROUPS[0];
}

/**
 * Last view visited inside each multi-view group, so re-selecting a group (in the
 * desktop header or the phone bottom-nav) returns you to where you left off rather
 * than snapping back to the group's first view. Module-level + ephemeral: this is
 * throwaway UI state, not worth a store slice or surviving a reload.
 */
const lastViewByGroup: Partial<Record<NavGroupKey, ViewKey>> = {};

/** Record the active view as its group's "last seen" — call on every navigation. */
export function rememberView(view: ViewKey): void {
  lastViewByGroup[groupForView(view).key] = view;
}

/** Where selecting `group` should land: its remembered view, else its first. */
export function resolveGroupTarget(group: (typeof NAV_GROUPS)[number]): ViewKey {
  return lastViewByGroup[group.key] ?? group.views[0];
}
