import { Button, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';

export type ToastKind = 'success' | 'error' | 'info';

/** An action button rendered inside a toast (e.g. "Undo"). */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOpts {
  duration?: number;
  action?: ToastAction;
}

// Map our semantic kinds onto theme colours (teal = good, danger = error,
// brand = neutral info) so toasts read consistently with the rest of the UI.
const COLOR: Record<ToastKind, string> = {
  success: 'teal',
  error: 'danger',
  info: 'brand',
};

/**
 * App-wide transient notifications, backed by `@mantine/notifications` (provider
 * mounted in `main.tsx`). Call sites keep using this `toast` helper — it owns the
 * kind→colour mapping, default durations, and the optional action button —
 * rather than touching the Mantine API directly. Replaces the scattered native
 * `alert()` calls with branded, themed acknowledgements.
 */
function show(kind: ToastKind, message: string, opts?: ToastOpts): string {
  const duration = opts?.duration ?? (kind === 'error' ? 6000 : 4000);
  const body = opts?.action ? (
    <Stack gap={8}>
      {message}
      <Button size="compact-xs" variant="light" onClick={opts.action.onClick}>
        {opts.action.label}
      </Button>
    </Stack>
  ) : (
    message
  );
  return notifications.show({
    message: body,
    color: COLOR[kind],
    autoClose: duration > 0 ? duration : false,
    withBorder: true,
  });
}

export const toast = {
  success: (message: string, opts?: ToastOpts) => show('success', message, opts),
  error: (message: string, opts?: ToastOpts) => show('error', message, opts),
  info: (message: string, opts?: ToastOpts) => show('info', message, opts),
  dismiss: (id: string) => notifications.hide(id),
};
