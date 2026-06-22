import type { BackStyle, DrawerJoint, HandleType, SlideType } from '../domain/types';

/**
 * Shared value/label options for the construction selectors, so the Settings
 * defaults and the per-cabinet inspector overrides stay in sync.
 */
export const DRAWER_JOINT_OPTS: { value: DrawerJoint; label: string }[] = [
  { value: 'dado', label: 'Dado (glue)' },
  { value: 'dadoScrew', label: 'Dado + screws' },
];

export const SLIDE_TYPE_OPTS: { value: SlideType; label: string }[] = [
  { value: 'side', label: 'Side-mount' },
  { value: 'under', label: 'Under-mount' },
];

export const BACK_STYLE_OPTS: { value: BackStyle; label: string }[] = [
  { value: 'panel', label: 'Full panel' },
  { value: 'rails', label: 'Hanging rails' },
];

/** Handle styles offered for a drawer front. */
export const DRAWER_HANDLE_OPTS: { value: HandleType; label: string }[] = [
  { value: 'pull', label: 'Knob / pull' },
  { value: 'routerCutout', label: 'Router cutout' },
];

/** Handle styles offered for a door front. */
export const DOOR_HANDLE_OPTS: { value: HandleType; label: string }[] = [
  { value: 'pull', label: 'Knob / pull' },
  { value: 'pushLatch', label: 'Push-to-open' },
  { value: 'edgePull', label: 'Edge pull' },
];

export function labelOf<T extends string>(opts: { value: T; label: string }[], value: T): string {
  return opts.find((o) => o.value === value)?.label ?? value;
}
