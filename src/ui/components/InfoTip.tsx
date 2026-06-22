import { Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';

/**
 * A small (i) icon that reveals a longer explanation on hover — replaces verbose
 * inline captions next to a field label so the panel stays dense.
 */
export function InfoTip({ label }: { label: string }) {
  return (
    <Tooltip label={label} withArrow multiline w={230} position="top" events={{ hover: true, focus: true, touch: true }}>
      <IconInfoCircle size={13} className="info-tip" aria-label={label} tabIndex={0} role="img" />
    </Tooltip>
  );
}
