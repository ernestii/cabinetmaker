import { useState } from 'react';
import { ActionIcon, Group, Menu, Text, TextInput } from '@mantine/core';
import { IconChevronDown, IconMinus, IconPlus } from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { parseInches, toFraction } from '../../domain/format';

interface Props {
  /** Current value; null/undefined renders empty (showing the placeholder). */
  value: number | null | undefined;
  onCommit: (v: number) => void;
  /** Called when the field is cleared (emptied). Enables the "unset" state. */
  onClear?: () => void;
  min?: number;
  max?: number;
  placeholder?: string;
  /** Width of the field (Mantine `w`). Compact contexts pass a smaller value. */
  w?: number | string;
  /**
   * When set, renders Mantine −/+ stepper buttons that nudge the value by this
   * many inches (and enables arrow-key nudging). Left unset, the field is a
   * plain text box, so dense layouts that don't want steppers are unaffected.
   */
  step?: number;
  /**
   * Unit shown inside the field's right edge (e.g. `"` or `mm`). Purely a
   * visual affordance — the value is still stored/parsed as inches. Left unset
   * in dense layouts so narrow fields aren't crowded.
   */
  suffix?: string;
  /**
   * When set, a ▾ button appears that opens a menu of common sizes (inches).
   * Picking one commits it — a fast path for standard cabinet widths etc.
   */
  presets?: readonly number[];
  /**
   * Labelled, context-dependent presets shown below the common sizes (e.g.
   * "Remaining length" computed from the wall/row). Each commits its value.
   */
  extraPresets?: readonly { label: string; value: number }[];
}

const fmt = (v: number | null | undefined) => (v == null ? '' : toFraction(v).replace('"', ''));

// Snap to 1/16" so repeated stepping can't drift on binary-float rounding.
const snap = (v: number) => Math.round(v * 16) / 16;

/** Text input that accepts fractions ("23 1/4") or decimals and commits inches. */
export function InchInput({ value, onCommit, onClear, min = 0, max, placeholder, w = 84, step, suffix, presets, extraPresets }: Props) {
  const [text, setText] = useState(() => fmt(value));
  const [focused, setFocused] = useState(false);
  const [lastValue, setLastValue] = useState(value);

  // On touch devices, default to −/+ steppers (so a value can be nudged without
  // popping the keyboard, the painful part on a phone) and show the unit. A
  // caller's explicit `step` always wins — fields with their own increment
  // (thickness, kerf) pass it. Plain text fields stay plain on desktop.
  const coarse = useMediaQuery('(pointer: coarse)', false);
  const effStep = step ?? (coarse ? 1 : undefined);
  // Show the inch mark when the field is wide enough not to crowd the value
  // (fixed width ≥ 84, or fill mode where it always has room).
  const effSuffix = suffix ?? (w === '100%' || (typeof w === 'number' && w >= 84) ? '"' : undefined);

  function pickPreset(v: number) {
    onCommit(v);
    setText(fmt(v));
    setLastValue(v);
  }

  // Mirror the external value into the field while the user isn't editing.
  // Adjusting state during render (vs. an effect) is the recommended pattern
  // and avoids a cascading re-render. See react.dev "You Might Not Need an Effect".
  if (!focused && value !== lastValue) {
    setLastValue(value);
    setText(fmt(value));
  }

  function commit() {
    const trimmed = text.trim();
    if (trimmed === '' && onClear) { onClear(); return; }
    const parsed = parseInches(text);
    if (parsed != null && parsed >= min && (max == null || parsed <= max)) onCommit(parsed);
    else setText(fmt(value));
  }

  function nudge(delta: number) {
    const base = parseInches(text) ?? value ?? min;
    let next = snap(base + delta);
    if (next < min) next = min;
    if (max != null && next > max) next = max;
    onCommit(next);
    setText(fmt(next));
    setLastValue(next);
  }

  // `w="100%"` is fill mode: the field flexes to fill its container (minus any
  // stepper/preset buttons) so it lines up with a fixed-label property grid.
  const fill = w === '100%';
  const field = (
    <TextInput
      size="xs"
      {...(fill ? { flex: 1, miw: 0 } : { w })}
      value={text}
      placeholder={placeholder}
      // Numeric keypad on phones; never browser-autofill a dimension (the stray
      // "autofill" suggestions over these fields were just the OS guessing).
      inputMode="decimal"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      styles={{ input: { textAlign: effStep != null ? 'center' : 'right' } }}
      rightSection={effSuffix ? <Text size="xs" c="dimmed">{effSuffix}</Text> : undefined}
      rightSectionWidth={effSuffix ? (effSuffix.length > 1 ? 30 : 18) : undefined}
      rightSectionPointerEvents="none"
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.currentTarget.value)}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (effStep != null && e.key === 'ArrowUp') { e.preventDefault(); nudge(effStep); }
        else if (effStep != null && e.key === 'ArrowDown') { e.preventDefault(); nudge(-effStep); }
      }}
    />
  );

  const hasPresets = (presets && presets.length > 0) || (extraPresets && extraPresets.length > 0);
  const presetMenu = hasPresets && (
    <Menu shadow="md" position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="default" size="input-xs" aria-label="Common sizes">
          <IconChevronDown size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Common sizes</Menu.Label>
        {(presets ?? []).map((p) => (
          <Menu.Item key={p} onClick={() => pickPreset(p)}>
            {toFraction(p)}
          </Menu.Item>
        ))}
        {extraPresets && extraPresets.length > 0 && (
          <>
            <Menu.Divider />
            {extraPresets.map((ep) => (
              <Menu.Item key={ep.label} onClick={() => pickPreset(ep.value)}>
                {ep.label} · {toFraction(ep.value)}
              </Menu.Item>
            ))}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );

  if (effStep == null) {
    if (!presetMenu) return fill ? <Group gap={0} wrap="nowrap" w="100%">{field}</Group> : field;
    return (
      <Group gap={4} wrap="nowrap" w={fill ? '100%' : undefined}>
        {field}
        {presetMenu}
      </Group>
    );
  }

  return (
    <Group gap={6} wrap="nowrap" w={fill ? '100%' : undefined}>
      <ActionIcon
        variant="default"
        size="input-xs"
        aria-label="Decrease"
        onClick={() => nudge(-effStep)}
        disabled={value != null && value <= min}
      >
        <IconMinus size={14} />
      </ActionIcon>
      {field}
      <ActionIcon
        variant="default"
        size="input-xs"
        aria-label="Increase"
        onClick={() => nudge(effStep)}
        disabled={max != null && value != null && value >= max}
      >
        <IconPlus size={14} />
      </ActionIcon>
      {presetMenu}
    </Group>
  );
}
