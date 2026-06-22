import { pdf } from '@react-pdf/renderer';
import type { Project } from '../../../domain/types';
import { CutListDocument } from './CutListDocument';

/** Slugify a project name for a filename, matching AppHeader's export helpers. */
function slug(name: string): string {
  return name.replace(/\s+/g, '-').toLowerCase() || 'project';
}

/**
 * Render the cut-list PDF for a project and trigger a browser download. This
 * module statically pulls in @react-pdf/renderer (a heavy dependency), so it is
 * meant to be loaded with a dynamic `import()` from the click handler — keeping
 * the library out of the initial bundle.
 */
export async function exportCutListPdf(project: Project): Promise<void> {
  const blob = await pdf(<CutListDocument project={project} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(project.name)}-cutlist.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
