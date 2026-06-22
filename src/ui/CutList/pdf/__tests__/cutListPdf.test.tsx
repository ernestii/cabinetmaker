import { describe, it, expect } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { seedProject, barProject } from '../../../../domain/seed';
import { buildCutList } from '../../../../domain/cutlist/collectParts';
import { CutListDocument } from '../CutListDocument';

/**
 * The cut-list PDF renders to a real document for the demo projects. We render
 * end-to-end (react-pdf → bytes) so the SVG diagram port and the table layout
 * are exercised, not just constructed — a broken primitive or NaN coordinate
 * throws here rather than silently shipping a blank page.
 */
describe('cut-list PDF', () => {
  it('renders a non-empty PDF for the seed project', async () => {
    const buf = await renderToBuffer(<CutListDocument project={seedProject()} />);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders the bar demo (counters + multiple materials)', async () => {
    const project = barProject();
    // Sanity-check the data the document depends on so a failure points at the
    // renderer, not an empty cut list.
    const cut = buildCutList(project);
    expect(cut.totalSheets).toBeGreaterThan(0);

    const buf = await renderToBuffer(<CutListDocument project={project} />);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
