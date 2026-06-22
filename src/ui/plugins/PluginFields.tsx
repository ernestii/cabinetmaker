/**
 * Renders a plugin's declarative `PluginField[]` as the compact Inspector
 * controls (segmented / select / number / toggle), reading and writing through
 * a `get`/`set` adapter the caller supplies (front opening, fixture, or add-on).
 * This is the one place the UI knows how to draw plugin-declared controls, so a
 * registered plugin's settings surface with no per-plugin Inspector edits.
 */
import { Checkbox, NumberInput, SegmentedControl, Select } from '@mantine/core';
import type { PluginField, PluginFieldContext, PluginFieldOption } from '../../domain/plugins/types';

export interface PluginFieldsProps {
  fields: PluginField[];
  ctx: PluginFieldContext;
  set: (target: string, value: unknown) => void;
}

function optionsOf(field: PluginField, ctx: PluginFieldContext): PluginFieldOption[] {
  return typeof field.options === 'function' ? field.options(ctx) : field.options ?? [];
}

export function PluginFields({ fields, ctx, set }: PluginFieldsProps) {
  return (
    <>
      {fields.map((field) => {
        if (field.visibleWhen && !field.visibleWhen(ctx)) return null;
        const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
        const raw = ctx.get(field.target);

        if (field.kind === 'toggle') {
          const checked = raw == null ? !!field.default : !!raw;
          return (
            <Checkbox key={field.target} size="xs" mt={6} label={field.label} checked={checked}
              onChange={(e) => set(field.target, e.currentTarget.checked)} onClick={stop} />
          );
        }

        if (field.kind === 'number') {
          const value = typeof raw === 'number' ? raw : Number(field.default ?? 0);
          return (
            <label key={field.target} className="mini">
              <span className="mini-label">{field.label}</span>
              <NumberInput size="xs" w={field.width ?? 64} min={field.min} max={field.max} step={field.step}
                value={value} onChange={(v) => set(field.target, Number(v) || 0)} onClick={stop} />
            </label>
          );
        }

        // select / segmented — normalise the current value against the options.
        const options = optionsOf(field, ctx);
        const fallback = String(field.default ?? options[0]?.value ?? '');
        const cur = raw == null ? fallback : String(raw);
        const value = options.some((o) => o.value === cur) ? cur : fallback;

        return (
          <label key={field.target} className="mini">
            <span className="mini-label">{field.label}</span>
            {field.kind === 'segmented' ? (
              <SegmentedControl fullWidth onClick={stop}
                data={options.map((o) => ({ value: String(o.value), label: o.label }))}
                value={value}
                onChange={(v) => { const o = options.find((x) => String(x.value) === v); if (o) set(field.target, o.value); }} />
            ) : (
              <Select size="xs" w={field.width ?? 120} allowDeselect={false} data={options} value={value}
                onChange={(v) => v != null && set(field.target, v)} onClick={stop} />
            )}
          </label>
        );
      })}
    </>
  );
}
