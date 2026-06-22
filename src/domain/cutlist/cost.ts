import type { HardwareCounts, Material, Project } from '../types';
import { buildProject } from '../geometry/buildProject';
import { buildCutList } from './collectParts';
import { SHEET_H } from '../constants';
import { defaultPricing } from '../seed';

export interface CostSummary {
  materials: { name: string; materialId: string; sheets: number; pricePerSheet: number; cost: number }[];
  sheetGoodsCost: number;
  counterCost: number;
  /** Countertop slabs needed and the slab unit price (0/empty when no counter). */
  counter: { name: string; materialId?: string; slabs: number; pricePerSlab: number; cost: number };
  bandingFeet: number;
  bandingCost: number;
  hardware: HardwareCounts;
  hardwareCost: number;
  total: number;
}

/**
 * Euro hinges, drawer-slide pairs, and pulls across the whole project.
 * Derived from the built scene so it can't drift from the geometry/cut list.
 */
export function countHardware(project: Project): HardwareCounts {
  return buildProject(project).hardware;
}

export function buildCost(project: Project): CostSummary {
  const cut = buildCutList(project);
  const pricing = project.pricing ?? defaultPricing();

  const materials = cut.groups.map((g) => {
    const price = (g.material as Material).pricePerSheet ?? 0;
    return { name: g.material.name, materialId: g.material.id, sheets: g.sheetCount, pricePerSheet: price, cost: g.sheetCount * price };
  });
  const sheetGoodsCost = materials.reduce((s, m) => s + m.cost, 0);

  // Counters are cut from fixed-length slabs; a run longer than one slab needs
  // more than one. Charge per slab (ceil of run length over slab length).
  const counterMat = project.materials.find((m) => m.roles?.includes('counter'));
  const slabLen = counterMat?.sheetH ?? SHEET_H;
  const counterSlabs = cut.linearStock.reduce(
    (s, p) => s + Math.max(1, Math.ceil(p.lIn / slabLen)) * p.qty,
    0,
  );
  const pricePerSlab = counterMat?.pricePerSheet ?? 0;
  const counterCost = counterSlabs * pricePerSlab;
  const counter = {
    name: counterMat?.name ?? 'Countertop',
    materialId: counterMat?.id,
    slabs: counterSlabs,
    pricePerSlab,
    cost: counterCost,
  };

  // Edge banding is sold by the roll, priced per 100 linear feet.
  const bandingFeet = cut.totalBandingIn / 12;
  const bandingCost = (bandingFeet / 100) * (pricing.edgeBandingPer100Ft ?? 0);

  const hardware = countHardware(project);
  const hardwareCost =
    hardware.hinges * pricing.hingeEach +
    hardware.slidePairs * pricing.slidePairEach +
    hardware.pulls * pricing.pullEach +
    hardware.pushLatches * (pricing.pushLatchEach ?? 0) +
    hardware.legs * (pricing.legEach ?? 0);

  return {
    materials, sheetGoodsCost, counterCost, counter, bandingFeet, bandingCost, hardware, hardwareCost,
    total: sheetGoodsCost + counterCost + bandingCost + hardwareCost,
  };
}
