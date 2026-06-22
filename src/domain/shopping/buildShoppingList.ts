import type { Project } from '../types';
import { buildCost } from '../cutlist/cost';
import { defaultPricing } from '../seed';
import { getCabinetAddon } from '../plugins/registry';

/** One buyable line: a quantity of a product at a unit price. */
export interface ShoppingItem {
  /** Stable key for React + check-off state. */
  key: string;
  name: string;
  /** Spec / size / model line shown under the name. */
  detail: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface ShoppingSection {
  title: string;
  items: ShoppingItem[];
  subtotal: number;
}

export interface ShoppingList {
  sections: ShoppingSection[];
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turn the cut list + cost estimate into a flat, shoppable list grouped by
 * department: sheet goods, countertop slabs, edge banding and hardware. Prices
 * come from the materials/pricing the user set (seeded from the catalog).
 */
export function buildShoppingList(project: Project): ShoppingList {
  const cost = buildCost(project);
  const pricing = project.pricing ?? defaultPricing();
  const matById = new Map(project.materials.map((m) => [m.id, m]));
  const sections: ShoppingSection[] = [];

  // ---- Sheet goods ----
  const sheetItems: ShoppingItem[] = cost.materials
    .filter((m) => m.sheets > 0)
    .map((m) => {
      const mat = matById.get(m.materialId);
      const size = mat ? `${mat.sheetW}" × ${mat.sheetH}" sheet` : 'sheet';
      return {
        key: `sheet-${m.materialId}`,
        name: m.name,
        detail: size,
        qty: m.sheets,
        unit: m.sheets === 1 ? 'sheet' : 'sheets',
        unitPrice: m.pricePerSheet,
        total: round2(m.cost),
      };
    });
  if (sheetItems.length) {
    sections.push({ title: 'Sheet goods', items: sheetItems, subtotal: round2(sheetItems.reduce((s, i) => s + i.total, 0)) });
  }

  // ---- Countertop slabs ----
  if (cost.counter.slabs > 0) {
    const mat = cost.counter.materialId ? matById.get(cost.counter.materialId) : undefined;
    const item: ShoppingItem = {
      key: 'counter',
      name: cost.counter.name,
      detail: mat ? `${mat.sheetW}" deep × ${mat.sheetH}" slab, ${mat.thicknessIn}" thick` : 'Cut-to-length slab',
      qty: cost.counter.slabs,
      unit: cost.counter.slabs === 1 ? 'slab' : 'slabs',
      unitPrice: cost.counter.pricePerSlab,
      total: round2(cost.counter.cost),
    };
    sections.push({ title: 'Countertops', items: [item], subtotal: item.total });
  }

  // ---- Edge banding ----
  if (cost.bandingFeet > 0) {
    const feet = Math.ceil(cost.bandingFeet);
    const item: ShoppingItem = {
      key: 'banding',
      name: 'Iron-on edge banding',
      detail: `${feet} linear ft (covers exposed plywood edges)`,
      qty: feet,
      unit: 'ft',
      unitPrice: round2((pricing.edgeBandingPer100Ft ?? 0) / 100),
      total: round2(cost.bandingCost),
    };
    sections.push({ title: 'Edge banding', items: [item], subtotal: item.total });
  }

  // ---- Hardware ----
  const hw = cost.hardware;
  const hwItems: ShoppingItem[] = [
    { key: 'hinge', name: 'Concealed euro hinges', detail: 'Soft-close, full-overlay', qty: hw.hinges, unit: 'ea', unitPrice: pricing.hingeEach },
    { key: 'slide', name: 'Drawer slide pairs', detail: 'Soft-close (size per drawer)', qty: hw.slidePairs, unit: 'pair', unitPrice: pricing.slidePairEach },
    { key: 'pull', name: 'Pulls / knobs', detail: 'Door + drawer hardware', qty: hw.pulls, unit: 'ea', unitPrice: pricing.pullEach },
    { key: 'latch', name: 'Push-to-open latches', detail: 'Handleless push doors', qty: hw.pushLatches, unit: 'ea', unitPrice: pricing.pushLatchEach ?? 0 },
    { key: 'leg', name: 'Adjustable legs', detail: 'Bought pole-style legs, workbench free ends', qty: hw.legs, unit: 'ea', unitPrice: pricing.legEach ?? 0 },
  ]
    .filter((i) => i.qty > 0)
    .map((i) => ({ ...i, total: round2(i.qty * i.unitPrice) }));
  if (hwItems.length) {
    sections.push({ title: 'Hardware', items: hwItems, subtotal: round2(hwItems.reduce((s, i) => s + i.total, 0)) });
  }

  // Appliances/fixtures are bought items the user sources at real, fast-moving
  // prices — we don't pretend to estimate them, so they're deliberately not on
  // the shopping list or in the cost total. Their finished panels (if any) are
  // already covered by the sheet-goods / edge-banding sections via the cut list.

  // ---- Cabinet add-ons (Axis 5: lighting, accessories) ----
  // Each opted-in cabinet contributes its add-ons' buy lines, grouped by the
  // department the add-on declares (e.g. 'Lighting'), defaulting to 'Add-ons'.
  const addonSections = new Map<string, ShoppingItem[]>();
  for (const room of project.rooms) {
    for (const wall of room.walls) {
      for (const el of wall.elements ?? []) {
        const cab = el.cabinet;
        for (const addonId of cab?.addons ?? []) {
          const def = getCabinetAddon(addonId);
          if (!def?.shopping) continue;
          const title = def.shoppingSection ?? 'Add-ons';
          const list = addonSections.get(title) ?? [];
          list.push(...def.shopping({ cabinet: cab!, project }));
          addonSections.set(title, list);
        }
      }
    }
  }
  for (const [title, items] of addonSections) {
    if (items.length) sections.push({ title, items, subtotal: round2(items.reduce((s, i) => s + i.total, 0)) });
  }

  return { sections, total: round2(sections.reduce((s, sec) => s + sec.subtotal, 0)) };
}
