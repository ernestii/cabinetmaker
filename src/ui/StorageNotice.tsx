import { useSyncExternalStore } from 'react';
import { Alert, Button, Group } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { getStorageStatus, onStorageStatus } from '../state/persistStorage';
import { useStore } from '../state/store';

function exportRecovery() {
  const json = useStore.getState().exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cabinetmaker-backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Watches autosave health and warns the user when the browser can no longer
 * persist their project (storage full or disabled), nudging an export so work
 * isn't lost. Renders nothing while autosave is healthy.
 */
export function StorageNotice() {
  const status = useSyncExternalStore(onStorageStatus, getStorageStatus, getStorageStatus);
  if (status === 'ok') return null;

  const message =
    status === 'quota'
      ? "Autosave failed — browser storage is full. Export your project so you don't lose changes."
      : "Autosave failed — this browser isn't saving changes. Export your project to keep it.";

  return (
    <Alert color="danger" variant="filled" radius={0} icon={<IconAlertTriangle size={18} />} py={8}>
      <Group justify="space-between" wrap="nowrap" gap="md">
        <span>{message}</span>
        <Button variant="white" color="danger" size="compact-sm" onClick={exportRecovery}>Export now</Button>
      </Group>
    </Alert>
  );
}
