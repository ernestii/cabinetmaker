/**
 * 3D export entry point. Turns a project into a STEP file for CAD tools
 * (FreeCAD, Shapr3D) and 3D-print pipelines. Pure and client-side.
 */
import type { Project } from '../types';
import { buildProject } from '../geometry/buildProject';
import { sceneToSolids } from './solids';
import { solidsToStep } from './step';

export { sceneToSolids } from './solids';
export type { Solid, Face, Vec3 } from './solids';
export { solidsToStep } from './step';

/** Slugify a project name into a safe file stem (mirrors the JSON export). */
function slug(name: string): string {
  return name.replace(/\s+/g, '-').toLowerCase() || 'project';
}

/** Build the STEP text and a suggested filename for a project's cabinetry. */
export function exportProjectStep(project: Project): { text: string; filename: string } {
  const scene = buildProject(project);
  const solids = sceneToSolids(scene);
  const text = solidsToStep(solids, { name: project.name || 'Cabinetmaker project' });
  return { text, filename: `${slug(project.name)}.step` };
}
