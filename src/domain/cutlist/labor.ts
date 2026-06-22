import type { Cabinet, Project } from '../types';

/**
 * Ballpark shop hours per unit. Rough hobbyist figures — adjust to taste.
 * Kept here as the single source so the estimate stays consistent.
 */
export const LABOR_HOURS = {
  /** Cut + assemble one carcass (sides, bottom, top/stretchers, back). */
  carcass: 1.5,
  /** Build a drawer box, fit the bottom, mount the slides. */
  drawer: 0.6,
  /** Hang one door leaf (bore, mount plate, adjust). */
  door: 0.4,
  /** Cut one adjustable shelf + its share of pin-hole drilling. */
  shelf: 0.25,
  /** Sand + edge-band + finish one cabinet's parts. */
  finish: 0.75,
  /** Build one workbench leg/top frame. */
  workbench: 1.2,
  /** Hang/level + fasten one cabinet (or workbench) on site. */
  install: 0.6,
} as const;

export interface LaborItem {
  label: string;
  count: number;
  hoursEach: number;
  hours: number;
}

export interface LaborEstimate {
  items: LaborItem[];
  totalHours: number;
  /** Hourly rate used, if any (from pricing.laborPerHour). */
  ratePerHour: number;
  /** totalHours × ratePerHour (0 when no rate set). */
  cost: number;
}

interface Counts {
  cabinets: number;
  drawers: number;
  doors: number;
  shelves: number;
  workbenches: number;
}

function tallyCabinet(cab: Cabinet, c: Counts): void {
  c.cabinets += 1;
  for (const op of cab.front) {
    if (op.type === 'drawer') c.drawers += 1;
    else if (op.type === 'door') c.doors += op.doorCount ?? 1;
    if (op.type === 'door' || op.type === 'fixed') c.shelves += op.shelves ?? 0;
  }
}

function countUnits(project: Project): Counts {
  const c: Counts = { cabinets: 0, drawers: 0, doors: 0, shelves: 0, workbenches: 0 };
  for (const room of project.rooms ?? []) {
    for (const wall of room.walls ?? []) {
      for (const el of wall.elements ?? []) {
        if (el.workbench) c.workbenches += 1;
        if (el.cabinet) tallyCabinet(el.cabinet, c);
      }
    }
  }
  return c;
}

/** Ballpark build-time estimate broken out by task. */
export function buildLabor(project: Project): LaborEstimate {
  const c = countUnits(project);
  const raw: { label: string; count: number; hoursEach: number }[] = [
    { label: 'Carcass assembly', count: c.cabinets, hoursEach: LABOR_HOURS.carcass },
    { label: 'Drawer boxes + slides', count: c.drawers, hoursEach: LABOR_HOURS.drawer },
    { label: 'Door hanging', count: c.doors, hoursEach: LABOR_HOURS.door },
    { label: 'Adjustable shelves', count: c.shelves, hoursEach: LABOR_HOURS.shelf },
    { label: 'Sanding + finishing', count: c.cabinets, hoursEach: LABOR_HOURS.finish },
    { label: 'Workbench frames', count: c.workbenches, hoursEach: LABOR_HOURS.workbench },
    { label: 'Install', count: c.cabinets + c.workbenches, hoursEach: LABOR_HOURS.install },
  ];
  const items: LaborItem[] = raw
    .filter((r) => r.count > 0)
    .map((r) => ({ ...r, hours: r.count * r.hoursEach }));
  const totalHours = items.reduce((s, i) => s + i.hours, 0);
  const ratePerHour = project.pricing?.laborPerHour ?? 0;
  return { items, totalHours, ratePerHour, cost: totalHours * ratePerHour };
}
