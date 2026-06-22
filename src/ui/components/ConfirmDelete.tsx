import { useState } from 'react';
import { ActionIcon, Button, Group, Popover, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';

interface Props {
  /** Confirmation prompt shown in the popover. */
  message: string;
  onConfirm: () => void;
  /** Icon trigger (small ✕) instead of a labelled button. */
  icon?: boolean;
  /** Button label when not in icon mode. */
  label?: string;
  title?: string;
}

/**
 * A delete control that asks for confirmation in a popover before firing.
 * Used for destructive actions in the inspector (sections, fronts, openings).
 * Stops click propagation so confirming inside a selectable row doesn't also
 * select/deselect it.
 */
export function ConfirmDelete({ message, onConfirm, icon, label = 'Delete', title }: Props) {
  const [open, setOpen] = useState(false);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Popover opened={open} onChange={setOpen} position="bottom-end" withArrow shadow="md" width={210} trapFocus>
      <Popover.Target>
        {icon ? (
          <ActionIcon
            color="danger" variant="subtle" size="md" title={title ?? 'Delete'} aria-label={title ?? 'Delete'}
            onClick={(e) => { stop(e); setOpen((o) => !o); }}
          >
            <IconTrash size={15} />
          </ActionIcon>
        ) : (
          <Button color="danger" variant="light" size="xs" onClick={(e) => { stop(e); setOpen((o) => !o); }}>
            {label}
          </Button>
        )}
      </Popover.Target>
      <Popover.Dropdown onClick={stop}>
        <Text size="xs" mb={8}>{message}</Text>
        <Group justify="flex-end" gap={6}>
          <Button size="xs" variant="default" onClick={(e) => { stop(e); setOpen(false); }}>Cancel</Button>
          <Button size="xs" color="danger" onClick={(e) => { stop(e); setOpen(false); onConfirm(); }}>Delete</Button>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
