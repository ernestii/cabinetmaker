import type { ReactNode } from 'react';
import { Button, Group, Text, Title } from '@mantine/core';

/**
 * The shared header for the four report pages (Cut List, Shopping, Assembly,
 * Materials): a page-level h2 title with an optional dimmed subtitle on the
 * left and an optional Print / PDF action on the right. Keeping it in one place
 * is what makes the pages line up — same type scale, same bottom margin, same
 * left edge — instead of each page rolling its own.
 */
export function PageHeader({ title, subtitle, onPrint, onExportPdf, exportingPdf }: {
  title: string;
  subtitle?: ReactNode;
  /** When provided, renders the Print / PDF button. Omit to hide it (e.g. empty pages). */
  onPrint?: () => void;
  /** When provided, renders an "Export PDF" button (generated document, not browser print). */
  onExportPdf?: () => void;
  /** Shows the export button in a loading state while the PDF is rendering. */
  exportingPdf?: boolean;
}) {
  return (
    <Group justify="space-between" align="flex-end" mb="lg" className="page-header">
      <div>
        <Title order={2} fw={650} className="page-title" style={{ letterSpacing: '-0.01em' }}>{title}</Title>
        {subtitle != null && <Text c="dimmed" fz="sm" mt={2}>{subtitle}</Text>}
      </div>
      <Group gap="xs" className="print-btn">
        {onExportPdf && (
          <Button variant="filled" onClick={onExportPdf} loading={exportingPdf}>Export PDF</Button>
        )}
        {onPrint && <Button variant="default" onClick={onPrint}>Print</Button>}
      </Group>
    </Group>
  );
}
