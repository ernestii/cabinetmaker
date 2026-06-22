/**
 * Pure, read-only queries over the project tree (Project → Room → Wall →
 * WallElement). React/Zustand-free so the domain (geometry, validation, …) and
 * the state layer can both traverse a project the same way.
 */
import type { Project, Wall, WallElement } from './types';

/** Every wall in the project, in order. */
export function allWalls(p: Project): Wall[] {
  return (p.rooms ?? []).flatMap((r) => r.walls ?? []);
}

/** The project's first wall, if any. */
export function firstWall(p: Project): Wall | undefined {
  return p.rooms?.[0]?.walls?.[0];
}

/** The wall the user is editing (falls back to the first). */
export function activeWall(p: Project, selectedWallId?: string): Wall | undefined {
  return allWalls(p).find((w) => w.id === selectedWallId) ?? firstWall(p);
}

/** The wall that contains a given element (element ids are globally unique). */
export function wallContaining(p: Project, elementId?: string): Wall | undefined {
  if (!elementId) return undefined;
  return allWalls(p).find((w) => (w.elements ?? []).some((e) => e.id === elementId));
}

/** Find an element anywhere in the project by id. */
export function getElement(p: Project, elementId?: string): WallElement | undefined {
  if (!elementId) return undefined;
  for (const w of allWalls(p)) {
    const e = (w.elements ?? []).find((x) => x.id === elementId);
    if (e) return e;
  }
  return undefined;
}
