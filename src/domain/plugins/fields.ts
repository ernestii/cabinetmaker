/**
 * Reusable declarative field builders for the built-in front types (and any
 * plugin that wants the same controls). Options are sourced from the registry /
 * domain constants, so these stay in the pure plugin layer — the Inspector just
 * renders whatever `PluginField[]` a component declares.
 */
import { SLIDE_LENGTHS } from '../constants';
import { listDoorStyles, listHandles } from './registry';
import type { PluginField, PluginFieldContext, PluginFieldOption } from './types';

export const slideOptions = (): PluginFieldOption[] => SLIDE_LENGTHS.map((l) => ({ value: String(l), label: `${l}"` }));
export const doorStyleOptions = (): PluginFieldOption[] => listDoorStyles().map((d) => ({ value: d.id, label: d.label }));
export const handleOptions = (kind: 'drawer' | 'door'): PluginFieldOption[] =>
  listHandles().filter((h) => h.appliesTo.includes(kind)).map((h) => ({ value: h.id, label: h.label }));

/** Edge pull only makes sense on the bottom-most front of an overhead cabinet. */
function edgePullAllowed(ctx: PluginFieldContext): boolean {
  // The Inspector maps a flex 'top' row to the 'upper' run kind before calling in.
  const overhead = ctx.slot === 'upper';
  const last = !!ctx.position && ctx.position.index === ctx.position.count - 1;
  return overhead && last;
}

export const doorCountField = (): PluginField => ({
  target: 'doorCount',
  label: 'Doors',
  kind: 'segmented',
  default: 1,
  options: [{ value: '1', label: 'Single' }, { value: '2', label: 'Pair' }],
});

export const hingeSideField = (): PluginField => ({
  target: 'hingeSide',
  label: 'Hinge',
  kind: 'segmented',
  default: 'left',
  options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }],
  visibleWhen: (ctx) => Number(ctx.get('doorCount') ?? 1) === 1,
});

export const shelvesField = (): PluginField => ({
  target: 'shelves',
  label: 'Shelves',
  kind: 'number',
  default: 0,
  min: 0,
  max: 8,
});

export const slideField = (): PluginField => ({
  target: 'slideLen',
  label: 'Slide',
  kind: 'select',
  default: 22,
  width: 84,
  options: slideOptions,
});

export const doorStyleField = (): PluginField => ({
  target: 'doorStyle',
  label: 'Style',
  kind: 'select',
  default: 'slab',
  width: 140,
  options: doorStyleOptions,
  // Only worth a picker once more than one style is registered.
  visibleWhen: () => listDoorStyles().length > 1,
});

export const handleField = (kind: 'drawer' | 'door'): PluginField => ({
  target: 'handle',
  label: 'Handle',
  kind: 'select',
  default: 'pull',
  width: 120,
  options:
    kind === 'drawer'
      ? () => handleOptions('drawer')
      : (ctx) => handleOptions('door').filter((o) => o.value !== 'edgePull' || edgePullAllowed(ctx)),
});
