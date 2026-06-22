/**
 * Built-in appliances/fixtures. Each reserves element width, places a 3D
 * appliance volume, optionally emits finished panels into the cut list (as
 * `face`/`carcass` parts, so nesting/cost handle them with no special-casing),
 * draws a 2D schematic in the elevation editor (`elevation`), and lists the
 * bought unit on the shopping list. The merged countertop in buildProject passes
 * over `countertop:'pass'` fixtures (dishwasher) and breaks at `'break'` ones
 * (range, fridge, laundry). A fixture may stand alone in an element or be
 * integrated alongside a cabinet (e.g. a cooktop over a base cabinet).
 *
 * Visual language (2D + 3D): quiet Scandinavian fronts. The elevation is a true
 * front view — no plan-view burners pasted onto a face — built from a body, a
 * few hairline seams, slim bar handles, and glass only where you'd really see
 * it. The 3D models are low-poly compositions (boxes + cylinders + a tapered
 * hood canopy) with brushed-steel / smoked-glass / enamel finishes.
 */
import type { FixtureConfig, MaterialRole, Material, Node3D, Part, Project } from '../../types';
import type { ElevationShape, FixtureDef, FixtureElevationContext, FixturePlaceContext } from '../types';

// --- 3D palette -----------------------------------------------------------
const STEEL = '#c4c9ce'; // brushed stainless fronts
const STEEL_DARK = '#9aa0a6'; // freezer / secondary steel
const BODY = '#7d848b'; // case sides behind door panels
const GRAPHITE = '#2b2f33'; // matte dark body (range, cooktop)
const GLASS = '#15181b'; // smoked glass (oven window, decks, portholes)
const ENAMEL = '#e9e7e2'; // warm off-white laundry body
const TRIM = '#eef1f4'; // bar handles / bright trim

const SIDE_GAP = 0.5; // clearance per side so the appliance slides into the bay

function matByRole(project: Project, role: MaterialRole): Material | undefined {
  return project.materials.find((m) => m.roles?.includes(role));
}

/** Build a Part bound to the fixture's element (mirrors how workbench parts key off the element id). */
function panelPart(
  elementId: string,
  id: string,
  label: string,
  role: MaterialRole,
  mat: Material | undefined,
  fallbackThickness: number,
  wIn: number,
  lIn: number,
  qty: number,
  edgeBandEdges: Part['edgeBandEdges'],
  notes?: string,
): Part {
  return {
    id, label, role, cabinetId: elementId, materialId: mat?.id ?? role,
    thicknessIn: mat?.thicknessIn ?? fallbackThickness, wIn, lIn, qty,
    edgeBandEdges, joinery: ['screw'], grainLocked: true, notes,
  };
}

/** Shorthand appliance node: a box unless `extra` picks a shape/finish. */
function app(
  c: FixturePlaceContext,
  pos: [number, number, number],
  size: [number, number, number],
  color: string,
  extra?: Partial<Node3D>,
): void {
  c.node({ pos, size, color, kind: 'appliance', ...extra });
}

/** A slim cylindrical bar pull, proud of the front (axis 'x' = horizontal bar). */
function barHandle(c: FixturePlaceContext, pos: [number, number, number], length: number, axis: 'x' | 'y', dia = 0.8): void {
  const size: [number, number, number] = axis === 'x' ? [length, dia, dia] : [dia, length, dia];
  app(c, pos, size, TRIM, { shape: 'cylinder', axis, finish: 'steel' });
}

// --- Elevation-shape builders (world inches; CSS classes live in styles.css) ---
const rect = (x: number, y: number, w: number, h: number, className?: string, rx?: number): ElevationShape => ({
  kind: 'rect', x, y, w, h, className, rx,
});
const line = (x1: number, y1: number, x2: number, y2: number, className?: string): ElevationShape => ({
  kind: 'line', x1, y1, x2, y2, className,
});
const circle = (cx: number, cy: number, r: number, className?: string): ElevationShape => ({
  kind: 'circle', cx, cy, r, className,
});
const polygon = (points: [number, number][], className?: string): ElevationShape => ({ kind: 'polygon', points, className });

export const dishwasher: FixtureDef = {
  id: 'dishwasher',
  label: 'Dishwasher',
  zone: 'base',
  defaultWidthIn: 24,
  standardWidthsIn: [18, 24],
  countertop: 'pass',
  // A standard built-in tub is ~34" tall and slides under a 34.5–36" counter.
  counterHeightRangeIn: [34.5, 39],
  fields: [{ target: 'frontPanel', label: 'Cabinet-front panel', kind: 'toggle' }],
  place(c: FixturePlaceContext): void {
    const { project, x0, widthIn, config, metrics, idBase } = c;
    const depth = config?.depthOverrideIn ?? project.defaults.baseDepthIn;
    const w = Math.max(6, widthIn - 2 * SIDE_GAP);
    const h = metrics.counterUndersideY; // floor → underside of the (continuous) counter
    const cx = x0 + widthIn / 2;
    const doorT = 1.2;
    // Tub body behind the door.
    app(c, [cx, h / 2, (depth - doorT) / 2], [w, h, depth - doorT], STEEL_DARK, { finish: 'steel' });

    if (config?.frontPanel) {
      const faceMat = matByRole(project, 'face');
      c.add(panelPart(c.element.id, `${idBase}-FRONT`, 'Dishwasher front panel', 'face', faceMat, 0.75, w, h, 1,
        ['top', 'bottom', 'left', 'right'], 'Custom panel screwed to the dishwasher door bracket'));
      c.node({ pos: [cx, h / 2, depth + (faceMat?.thicknessIn ?? 0.75) / 2],
        size: [w, h, faceMat?.thicknessIn ?? 0.75], color: faceMat?.color ?? STEEL, textureUrl: faceMat?.textureUrl, kind: 'face', partId: `${idBase}-FRONT` });
      return;
    }
    // Integrated steel front: door, recessed dark control strip, slim bar pull.
    const zF = depth - doorT / 2;
    app(c, [cx, (h - 2.4) / 2, zF], [w, h - 2.4, doorT], STEEL, { finish: 'steel' });
    app(c, [cx, h - 1.1, zF], [w, 2.2, doorT - 0.2], GRAPHITE, { finish: 'glass' });
    barHandle(c, [cx, h - 3.5, depth + 0.5], w * 0.5, 'x', 0.7);
  },
  elevation: ({ x, y, w, h }: FixtureElevationContext): ElevationShape[] => {
    const m = SIDE_GAP;
    const cx = x + w / 2;
    const top = y + h;
    return [
      // One calm integrated front: steel panel, dark control strip, slim pull.
      rect(x + m, y, w - 2 * m, h, 'app-steel', 0.4),
      rect(x + m + 0.7, top - 2.6, w - 2 * m - 1.4, 1.9, 'app-panel', 0.3),
      circle(x + m + 2.1, top - 1.65, 0.3, 'app-dot'),
      circle(x + m + 3.5, top - 1.65, 0.3, 'app-dot'),
      circle(x + m + 4.9, top - 1.65, 0.3, 'app-dot'),
      line(cx - w * 0.22, top - 4.1, cx + w * 0.22, top - 4.1, 'app-handle'),
      line(x + m + 0.7, y + 1.3, x + w - m - 0.7, y + 1.3, 'app-seam'),
    ];
  },
};

/** Four burner discs laid flat on a cooktop deck (3D only — never on the elevation). */
function placeBurners(c: FixturePlaceContext, cx: number, deckTopY: number, w: number, depth: number): void {
  const dia = Math.min(9, w * 0.27);
  for (const [tx, tz, scale] of [[-0.22, 0.66, 1], [0.22, 0.66, 1], [-0.22, 0.33, 0.78], [0.22, 0.33, 0.78]] as const) {
    const d = dia * scale;
    app(c, [cx + w * tx, deckTopY + 0.09, depth * tz], [d, 0.18, d], '#3a3f45', { shape: 'cylinder' });
  }
}

export const range: FixtureDef = {
  id: 'range',
  label: 'Range / oven (slide-in)',
  zone: 'base',
  defaultWidthIn: 30,
  standardWidthsIn: [24, 30, 36, 48],
  countertop: 'break',
  vent: 'cooktop',
  // A freestanding/slide-in range stands ~36" to the cooktop deck (leveling feet
  // give a little play); its deck should land at the counter.
  counterHeightRangeIn: [35, 37],
  place(c: FixturePlaceContext): void {
    const { project, x0, widthIn, config, metrics } = c;
    const depth = config?.depthOverrideIn ?? project.defaults.baseDepthIn;
    const w = Math.max(6, widthIn - 2 * SIDE_GAP);
    const h = config?.heightIn ?? metrics.counterTopY; // floor → cooktop deck (oven below)
    const cx = x0 + widthIn / 2;
    // Matte body with a smoked-glass deck on top.
    app(c, [cx, (h - 0.6) / 2, (depth - 1.2) / 2], [w, h - 0.6, depth - 1.2], GRAPHITE);
    app(c, [cx, h - 0.3, depth / 2], [w, 0.6, depth - 0.4], GLASS, { finish: 'glass' });
    placeBurners(c, cx, h, w, depth);
    // Oven door + proud glass window + full-width bar handle.
    const doorH = h - 6.6;
    app(c, [cx, 1.4 + doorH / 2, depth - 0.6], [w - 1.2, doorH, 1.2], GRAPHITE);
    app(c, [cx, 1.4 + doorH * 0.52, depth + 0.15], [w * 0.58, doorH * 0.42, 0.3], GLASS, { finish: 'glass' });
    barHandle(c, [cx, h - 4.7, depth + 0.9], w * 0.78, 'x', 1.0);
    // Control knobs across the deck rail.
    for (const t of [-0.18, -0.06, 0.06, 0.18])
      app(c, [cx + w * t, h - 2.0, depth - 0.1], [1.3, 1.3, 0.9], STEEL_DARK, { shape: 'cylinder', axis: 'z', finish: 'steel' });
  },
  elevation: ({ x, y, w, h }: FixtureElevationContext): ElevationShape[] => {
    const m = SIDE_GAP;
    const top = y + h;
    const bw = w - 2 * m;
    const doorTop = top - 6.2;
    const doorBot = y + 1.6;
    const winW = bw * 0.62;
    const winH = Math.min(11, (doorTop - doorBot) * 0.46);
    const winY = doorBot + (doorTop - doorBot - winH) * 0.55;
    return [
      // Matte body, glass deck edge-on, knob row, bar handle, oven door + window.
      rect(x + m, y, bw, h, 'app-graphite', 0.4),
      rect(x + m, top - 1.0, bw, 1.0, 'app-glass'),
      ...[0.32, 0.44, 0.56, 0.68].map((t): ElevationShape => circle(x + w * t, top - 3.2, 0.6, 'app-knob')),
      line(x + m + 1.6, doorTop + 1.0, x + w - m - 1.6, doorTop + 1.0, 'app-handle'),
      rect(x + m + 1.0, doorBot, bw - 2.0, doorTop - doorBot, 'app-trim', 0.4),
      rect(x + (w - winW) / 2, winY, winW, winH, 'app-glass', 0.6),
    ];
  },
};

/**
 * A drop-in cooktop: a shallow burner deck that sits ON the counter, so the
 * merged countertop runs around it (`'pass'`). Pair it with a base cabinet on
 * the same element for an integrated cooktop-over-cabinet (the canonical use).
 */
export const cooktop: FixtureDef = {
  id: 'cooktop',
  label: 'Cooktop (drop-in)',
  zone: 'base',
  // A drop-in deck that shares its section with the base cabinet beneath it.
  integratable: true,
  defaultWidthIn: 30,
  standardWidthsIn: [24, 30, 36, 48],
  countertop: 'pass',
  vent: 'cooktop',
  place(c: FixturePlaceContext): void {
    const { x0, widthIn, config, metrics } = c;
    const w = Math.max(6, widthIn - 2 * SIDE_GAP);
    const deckH = config?.heightIn ?? 1.2; // the glass deck proud of the counter
    const depth = config?.depthOverrideIn ?? 21; // cooktops are ~21" deep, set toward the front
    const cx = x0 + widthIn / 2;
    const deckY = metrics.counterTopY + deckH / 2;
    app(c, [cx, deckY, depth / 2 + 1], [w, deckH, depth], GLASS, { finish: 'glass' });
    placeBurners(c, cx, metrics.counterTopY + deckH, w, depth);
  },
  elevation: ({ x, y, w, h }: FixtureElevationContext): ElevationShape[] => {
    const m = SIDE_GAP;
    const top = y + h;
    // Front view of a drop-in deck: just the slim glass slab over the counter line.
    return [
      rect(x + m, top - 1.3, w - 2 * m, 1.3, 'app-glass', 0.2),
      line(x + m + 0.8, top - 1.5, x + w - m - 0.8, top - 1.5, 'app-seam'),
    ];
  },
};

export const hood: FixtureDef = {
  id: 'hood',
  label: 'Hood fan',
  zone: 'upper',
  defaultWidthIn: 30,
  standardWidthsIn: [24, 30, 36, 48],
  countertop: 'pass', // sits in the upper zone; doesn't touch the base counter
  vent: 'hood',
  place(c: FixturePlaceContext): void {
    const { project, x0, widthIn, config, metrics } = c;
    const depth = config?.depthOverrideIn ?? project.defaults.upperDepthIn;
    const w = Math.max(6, widthIn - 2 * SIDE_GAP);
    const hoodH = config?.heightIn ?? 12;
    // Bottom ~30" above the counter surface (standard cooktop clearance).
    const bottomY = metrics.counterTopY + 30;
    const cx = x0 + widthIn / 2;
    // Capture slab → tapered canopy → chimney rising to the ceiling.
    const slabH = 2.2;
    const canH = Math.max(3, hoodH - slabH);
    app(c, [cx, bottomY + slabH / 2, depth / 2], [w, slabH, depth], STEEL, { finish: 'steel' });
    app(c, [cx, bottomY + slabH + canH / 2, depth / 2], [w, canH, depth], STEEL, { shape: 'frustum', topScale: 0.42, finish: 'steel' });
    const ceilingY = metrics.tallCarcassH + metrics.legH;
    const chimH = ceilingY - (bottomY + slabH + canH);
    if (chimH > 0.5)
      app(c, [cx, bottomY + slabH + canH + chimH / 2, depth / 2], [w * 0.3, chimH, Math.min(12, depth * 0.55)], STEEL_DARK, { finish: 'steel' });
  },
  elevation: ({ x, y, w, h }: FixtureElevationContext): ElevationShape[] => {
    const m = SIDE_GAP;
    const cx = x + w / 2;
    const slabH = 2.2;
    const canH = Math.min(7, h * 0.3);
    const chimW = Math.min(11, w * 0.36);
    const top = y + h;
    return [
      // Chimney behind, tapered canopy, capture slab with a filter-slot shadow.
      rect(cx - chimW / 2, y + slabH + canH, chimW, top - (y + slabH + canH), 'app-steel-dark'),
      polygon([[x + m, y + slabH], [x + w - m, y + slabH], [cx + chimW / 2, y + slabH + canH], [cx - chimW / 2, y + slabH + canH]], 'app-steel'),
      rect(x + m, y, w - 2 * m, slabH, 'app-steel', 0.3),
      line(x + m + 1.2, y + 0.7, x + w - m - 1.2, y + 0.7, 'app-seam'),
    ];
  },
};

/** Refrigerator door/freezer configuration. */
type FridgeStyle = 'french' | 'bottom' | 'top' | 'sideBySide';

const FRIDGE_BODY_MAX_H = 70; // a tall fridge body, before it leaves headroom to the ceiling
/**
 * How tall the fridge body stands (floor → top). It fills its body height, not the
 * whole tall column, so an upper cabinet can hang in the band above it. Shared by
 * `place` (3D), `elevation` (2D), and `occupiedHeightIn` (layout) so all three agree.
 */
function fridgeBodyHeight(config: FixtureConfig | undefined, ceilingH: number): number {
  return config?.heightIn ?? Math.min(FRIDGE_BODY_MAX_H, ceilingH - 2);
}

export const fridge: FixtureDef = {
  id: 'fridge',
  label: 'Refrigerator',
  zone: 'tall',
  defaultWidthIn: 36,
  standardWidthsIn: [30, 33, 36, 42, 48],
  countertop: 'break',
  freesUpperBand: true,
  occupiedHeightIn: ({ config, metrics }) => fridgeBodyHeight(config, metrics.tallCarcassH + metrics.legH),
  fields: [
    {
      target: 'setting:style', label: 'Configuration', kind: 'segmented', default: 'french',
      options: [
        { value: 'french', label: 'French' },
        { value: 'bottom', label: 'Bottom' },
        { value: 'top', label: 'Top' },
        { value: 'sideBySide', label: 'Side×2' },
      ],
    },
    { target: 'setting:counterDepth', label: 'Counter-depth', kind: 'toggle' },
    { target: 'sidePanels', label: 'Finished end panels', kind: 'toggle' },
    { target: 'overheadPanel', label: 'Overhead panel', kind: 'toggle' },
  ],
  place(c: FixturePlaceContext): void {
    const { project, x0, widthIn, config, metrics, idBase } = c;
    const ceiling = metrics.tallCarcassH + metrics.legH;
    const settings = config?.settings ?? {};
    const style = (settings.style as FridgeStyle) ?? 'french';
    const counterDepth = !!settings.counterDepth;
    // Counter-depth fridges sit ~flush with the base run; standard ones run deeper.
    const depth = config?.depthOverrideIn ?? (counterDepth ? project.defaults.baseDepthIn + 1 : project.defaults.tallDepthIn + 6);
    const bodyH = fridgeBodyHeight(config, ceiling);
    const w = Math.max(6, widthIn - 2 * SIDE_GAP);
    const cx = x0 + widthIn / 2;
    const left = cx - w / 2;

    // A recessed body with the doors/compartments modelled as steel front panels,
    // so the configuration reads at a glance; bar pulls sit proud of the doors.
    const PANEL_T = 1.4;
    const bodyDepth = Math.max(1, depth - PANEL_T);
    const pz = depth - PANEL_T / 2; // front-panel centre z
    const hz = depth + 0.7; // bar-handle centre z (proud of the door)
    app(c, [cx, bodyH / 2, bodyDepth / 2], [w, bodyH, bodyDepth], BODY, { finish: 'steel' });
    const gap = 0.4;
    const panel = (px: number, py: number, pw: number, ph: number, color: string) =>
      app(c, [px, py, pz], [Math.max(1, pw), Math.max(1, ph), PANEL_T], color, { finish: 'steel' });
    const vPull = (px: number, yc: number, len: number) => barHandle(c, [px, yc, hz], len, 'y');
    const hPull = (xc: number, yy: number, len: number) => barHandle(c, [xc, yy, hz], len, 'x');

    if (style === 'sideBySide') {
      const half = w / 2 - gap / 2;
      panel(left + half / 2, bodyH / 2, half, bodyH, STEEL_DARK); // freezer (left)
      panel(left + w - half / 2, bodyH / 2, half, bodyH, STEEL); // fridge (right)
      vPull(cx - 1.6, bodyH * 0.55, Math.min(26, bodyH * 0.4));
      vPull(cx + 1.6, bodyH * 0.55, Math.min(26, bodyH * 0.4));
    } else if (style === 'top') {
      const fh = Math.min(15, bodyH * 0.28);
      panel(cx, bodyH - fh / 2, w, fh, STEEL_DARK); // freezer on top
      panel(cx, (bodyH - fh - gap) / 2, w, bodyH - fh - gap, STEEL); // fridge below
      hPull(cx, bodyH - fh + 1.6, w * 0.4);
      vPull(left + w - 2.2, (bodyH - fh) * 0.62, Math.min(18, bodyH * 0.28));
    } else {
      // 'bottom' and 'french' share a bottom freezer drawer.
      const fh = Math.min(20, bodyH * 0.36);
      panel(cx, fh / 2, w, fh, STEEL_DARK); // freezer drawer
      hPull(cx, fh - 1.6, w * 0.36);
      const upY = fh + gap;
      const upH = bodyH - upY;
      if (style === 'french') {
        const door = w / 2 - gap / 2;
        panel(left + door / 2, upY + upH / 2, door, upH, STEEL);
        panel(left + w - door / 2, upY + upH / 2, door, upH, STEEL);
        vPull(cx - 1.6, upY + upH * 0.6, Math.min(20, upH * 0.5));
        vPull(cx + 1.6, upY + upH * 0.6, Math.min(20, upH * 0.5));
      } else {
        panel(cx, upY + upH / 2, w, upH, STEEL); // single fridge door
        vPull(left + w - 2.2, upY + upH * 0.6, Math.min(20, upH * 0.5));
      }
    }

    const faceMat = matByRole(project, 'face');
    const carcMat = matByRole(project, 'carcass');
    const pt = faceMat?.thicknessIn ?? 0.75;
    if (config?.sidePanels) {
      c.add(panelPart(c.element.id, `${idBase}-SIDE`, 'Fridge end panel', 'face', faceMat, 0.75, depth, bodyH, 2,
        ['right'], 'Finished end panel — both sides of the fridge opening'));
      c.node({ pos: [x0 + SIDE_GAP / 2, bodyH / 2, depth / 2], size: [pt, bodyH, depth], color: faceMat?.color ?? STEEL, textureUrl: faceMat?.textureUrl, kind: 'face', partId: `${idBase}-SIDE` });
      c.node({ pos: [x0 + widthIn - SIDE_GAP / 2, bodyH / 2, depth / 2], size: [pt, bodyH, depth], color: faceMat?.color ?? STEEL, textureUrl: faceMat?.textureUrl, kind: 'face', partId: `${idBase}-SIDE` });
    }
    if (config?.overheadPanel) {
      const ct = carcMat?.thicknessIn ?? 0.75;
      c.add(panelPart(c.element.id, `${idBase}-TOP`, 'Fridge overhead panel', 'carcass', carcMat, 0.75, depth, widthIn, 1,
        [], 'Soffit/gable bridging the fridge opening to the uppers'));
      c.node({ pos: [x0 + widthIn / 2, bodyH + ct / 2, depth / 2], size: [widthIn, ct, depth], color: carcMat?.color ?? '#caa472', textureUrl: carcMat?.textureUrl, kind: 'panel', partId: `${idBase}-TOP` });
    }
  },
  elevation: ({ x, y, w, h, config }: FixtureElevationContext): ElevationShape[] => {
    const style = (config?.settings?.style as FridgeStyle) ?? 'french';
    const m = SIDE_GAP;
    const cx = x + w / 2;
    const bw = w - 2 * m;
    // The footprint passed in is the fridge body (it leaves headroom above for an
    // upper), so the schematic fills its box.
    const bodyH = h;
    const top = y + bodyH;
    const shapes: ElevationShape[] = [rect(x + m, y, bw, bodyH, 'app-steel', 0.8)];
    const freezer = (fy: number, fh: number, rx: number) => shapes.push(rect(x + m, fy, bw, fh, 'app-steel-dark', rx));
    const vSeam = (yA: number, yB: number) => shapes.push(line(cx, yA, cx, yB, 'app-seam'));
    const hSeam = (yy: number) => shapes.push(line(x + m, yy, x + w - m, yy, 'app-seam'));
    const vPull = (hx: number, yTop: number, len: number) => shapes.push(line(hx, yTop - len, hx, yTop, 'app-handle'));
    const hPull = (xc: number, yy: number, len: number) => shapes.push(line(xc - len / 2, yy, xc + len / 2, yy, 'app-handle'));

    if (style === 'sideBySide') {
      shapes.push(rect(x + m, y, bw / 2, bodyH, 'app-steel-dark', 0.8)); // freezer half (left)
      vSeam(y + 0.6, top - 0.6);
      vPull(cx - 1.5, top - 6, Math.min(24, bodyH * 0.38));
      vPull(cx + 1.5, top - 6, Math.min(24, bodyH * 0.38));
    } else if (style === 'top') {
      const fh = Math.min(15, bodyH * 0.28);
      freezer(top - fh, fh, 0.8);
      hSeam(top - fh);
      hPull(cx, top - fh + 1.6, bw * 0.4);
      vPull(x + w - m - 2.0, top - fh - 3, Math.min(16, bodyH * 0.26));
    } else {
      const fh = Math.min(20, bodyH * 0.36);
      freezer(y, fh, 0.8);
      hSeam(y + fh);
      hPull(cx, y + fh - 1.6, bw * 0.36);
      if (style === 'french') {
        vSeam(y + fh + 0.6, top - 0.6);
        vPull(cx - 1.5, top - 4, Math.min(18, (bodyH - fh) * 0.5));
        vPull(cx + 1.5, top - 4, Math.min(18, (bodyH - fh) * 0.5));
      } else {
        vPull(x + w - m - 2.0, top - 4, Math.min(18, (bodyH - fh) * 0.5));
      }
    }
    return shapes;
  },
};

// --- Laundry: front-/top-load washer and the matching dryer --------------------

type Loading = 'front' | 'top';

/** Shared geometry for a laundry unit (washer/dryer), reading its config bag. */
function laundryDims(c: FixturePlaceContext) {
  const { project, widthIn, config } = c;
  const settings = config?.settings ?? {};
  const pedestal = !!settings.pedestal;
  const pedH = pedestal ? 14 : 0;
  const bodyH = config?.heightIn ?? 38; // front-load laundry units run ~38" tall
  const depth = config?.depthOverrideIn ?? Math.max(project.defaults.baseDepthIn, 31);
  const w = Math.max(6, widthIn - 2 * SIDE_GAP);
  return { pedestal, pedH, bodyH, depth, w };
}

/** Place the 3D volume for a laundry unit: enamel body, console, porthole/lid (+ pedestal). */
function placeLaundry(c: FixturePlaceContext, glassColor: string): void {
  const { x0, widthIn, config } = c;
  const { pedestal, pedH, bodyH, depth, w } = laundryDims(c);
  const loading = ((config?.settings?.loading as Loading) ?? 'front');
  const cx = x0 + widthIn / 2;
  const front = depth - 1.5; // front face of the body

  if (pedestal) {
    app(c, [cx, pedH / 2, depth / 2], [w, pedH, depth], ENAMEL, { finish: 'enamel' });
    app(c, [cx, pedH * 0.45, front + 0.15], [w - 4, 0.5, 0.3], '#b9b6b0'); // drawer pull groove
  }
  // Main body.
  app(c, [cx, pedH + bodyH / 2, depth / 2 - 0.75], [w, bodyH, depth - 1.5], ENAMEL, { finish: 'enamel' });
  // Console strip: warm grey band with a smoked display and one dial.
  const consoleH = 3.2;
  const consoleY = pedH + bodyH - consoleH / 2 - 0.4;
  app(c, [cx, consoleY, front + 0.3], [w - 1, consoleH, 0.6], '#dfdcd6', { finish: 'enamel' });
  app(c, [cx - w * 0.18, consoleY, front + 0.75], [w * 0.28, 1.4, 0.25], GLASS, { finish: 'glass' });
  app(c, [cx + w * 0.3, consoleY, front + 1.0], [1.9, 1.9, 1.1], STEEL_DARK, { shape: 'cylinder', axis: 'z', finish: 'steel' });

  if (loading === 'top') {
    // A flat lid (no porthole) — seen as a slim slab at the top.
    app(c, [cx, pedH + bodyH - consoleH - 1.0, depth / 2], [w - 2, 0.8, depth - 3], '#dfdcd6', { finish: 'enamel' });
  } else {
    // Round porthole: enamel trim ring framing a proud smoked-glass dome.
    const dia = Math.min(w - 6, bodyH - consoleH - 8);
    const pcy = pedH + (bodyH - consoleH) * 0.46;
    app(c, [cx, pcy, front + 0.4], [dia, dia, 1.0], '#cfccc5', { shape: 'cylinder', axis: 'z', finish: 'enamel' });
    app(c, [cx, pcy, front + 0.7], [dia - 2.6, dia - 2.6, 1.4], glassColor, { shape: 'cylinder', axis: 'z', finish: 'glass' });
  }
}

/** Draw the 2D laundry schematic: enamel body, console + dial, porthole or lid. */
function laundryElevation(c: FixtureElevationContext): ElevationShape[] {
  const { x, y, w, h, config } = c;
  const loading = ((config?.settings?.loading as Loading) ?? 'front');
  const pedestal = !!config?.settings?.pedestal;
  const m = SIDE_GAP;
  const bw = w - 2 * m;
  const cx = x + w / 2;
  const pedH = pedestal ? Math.min(h * 0.26, 9) : 0;
  const bodyBot = y + pedH;
  const bodyH = h - pedH;
  const top = y + h;
  const shapes: ElevationShape[] = [rect(x + m, bodyBot, bw, bodyH, 'app-white', 0.8)];

  if (pedestal) {
    shapes.push(rect(x + m, y, bw, pedH - 0.5, 'app-white', 0.4));
    shapes.push(line(cx - bw * 0.3, y + pedH * 0.5, cx + bw * 0.3, y + pedH * 0.5, 'app-seam'));
  }

  // Console: a smoked display window + one dial, on the body itself (no band).
  shapes.push(rect(x + m + 1.2, top - 2.8, bw * 0.3, 1.6, 'app-glass', 0.3));
  shapes.push(circle(x + w - m - 2.8, top - 2.0, 1.0, 'app-dial'));
  shapes.push(circle(x + w - m - 2.8, top - 2.0, 0.35, 'app-dot'));

  if (loading === 'top') {
    // Lid seam near the top — calm and flat.
    shapes.push(line(x + m + 1.0, top - 4.2, x + w - m - 1.0, top - 4.2, 'app-seam'));
  } else {
    // Porthole: trim ring + smoked glass.
    const pcy = bodyBot + (bodyH - 3) * 0.46;
    const r = Math.min(bw * 0.34, (bodyH - 4) * 0.4, 8.5);
    shapes.push(circle(cx, pcy, r, 'app-porthole'));
    shapes.push(circle(cx, pcy, Math.max(1, r - 1.3), 'app-glass'));
  }
  return shapes;
}

export const washer: FixtureDef = {
  id: 'washer',
  label: 'Washer',
  zone: 'base',
  defaultWidthIn: 27,
  standardWidthsIn: [24, 27],
  countertop: 'break', // full-height laundry units stand proud of a base counter
  fields: [
    {
      target: 'setting:loading', label: 'Loading', kind: 'segmented', default: 'front',
      options: [
        { value: 'front', label: 'Front' },
        { value: 'top', label: 'Top' },
      ],
    },
    { target: 'setting:pedestal', label: 'Storage pedestal', kind: 'toggle' },
  ],
  place: (c) => placeLaundry(c, GLASS),
  elevation: (c) => laundryElevation(c),
};

export const dryer: FixtureDef = {
  id: 'dryer',
  label: 'Dryer',
  zone: 'base',
  defaultWidthIn: 27,
  standardWidthsIn: [24, 27],
  countertop: 'break',
  fields: [{ target: 'setting:pedestal', label: 'Storage pedestal', kind: 'toggle' }],
  // Dryers are front-load; force the porthole schematic regardless of loading.
  place: (c) => placeLaundry({ ...c, config: { ...c.config, settings: { ...c.config?.settings, loading: 'front' } } }, '#2c3137'),
  elevation: (c) => laundryElevation({ ...c, config: { ...c.config, settings: { ...c.config?.settings, loading: 'front' } } }),
};

export const builtinFixtures: FixtureDef[] = [dishwasher, range, cooktop, hood, fridge, washer, dryer];
