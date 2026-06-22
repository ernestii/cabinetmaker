import type { Cabinet, CabinetBuild, HardwareCounts, Node3D, Part, ProjectDefaults, RunKind } from '../types';
import { resolveConstruction, type BuildContext, type PartFactory } from './context';
import { buildCarcass } from './carcass';
import { layoutFronts } from './fronts';
import { buildShelves } from './shelves';
import { getFrontType, getCabinetAddon } from '../plugins/registry';
import { DEFAULT_DOOR_HANDLE, DEFAULT_DRAWER_HANDLE } from '../constants';
// Side effect: register the built-in front types / door styles / handles. This
// is the composition root for the per-cabinet geometry path (tests call
// buildCabinet directly). builtin/* never imports buildCabinet, so no cycle.
import '../plugins/builtin';

export interface BuildCabinetParams {
  index: number;
  runKind: RunKind;
  depthIn: number;
  carcassHeightIn: number;
  legHeightIn: number;
  hasLegs: boolean;
  /** role → materialId / color / texture / thickness (from the project material library). */
  materialIdByRole: Record<string, string>;
  colorByRole: Record<string, string>;
  textureByRole: Record<string, string | undefined>;
  /** Part thickness comes from the assigned material unless overridden per-cabinet. */
  thicknessByRole?: Record<string, number>;
  /** Project-wide construction defaults (drawer joint, slide type, dado depth). */
  defaults: ProjectDefaults;
  /**
   * Sides cut from finished 'face' stock (exposed ends). Resolved by the caller
   * from the wall layout + any per-cabinet override; falls back to the cabinet's
   * own override (manual only, no auto) when omitted.
   */
  exposedSides?: ('left' | 'right')[];
}

export function buildCabinet(cabinet: Cabinet, p: BuildCabinetParams): CabinetBuild {
  const ctx: BuildContext = {
    cabinet,
    index: p.index,
    runKind: p.runKind,
    widthIn: cabinet.widthIn,
    depthIn: cabinet.depthOverrideIn ?? p.depthIn,
    carcassHeightIn: p.carcassHeightIn,
    legHeightIn: p.legHeightIn,
    hasLegs: p.hasLegs,
    materialIdByRole: p.materialIdByRole,
    colorByRole: p.colorByRole,
    textureByRole: p.textureByRole,
    exposedSides: p.exposedSides ?? cabinet.exposedSides ?? [],
    c: resolveConstruction(cabinet, p.runKind, p.thicknessByRole, p.defaults),
    drawerHandle: p.defaults.drawerHandle ?? DEFAULT_DRAWER_HANDLE,
    doorHandle: p.defaults.doorHandle ?? DEFAULT_DOOR_HANDLE,
  };

  const parts: Part[] = [];
  const nodes: Node3D[] = [];
  const f: PartFactory = {
    add: (part) => parts.push({ ...part, cabinetId: cabinet.id }),
    node: (n) => nodes.push(n),
  };

  buildCarcass(ctx, f);

  const hardware: HardwareCounts = { hinges: 0, slidePairs: 0, pulls: 0, pushLatches: 0, legs: 0 };

  const items = layoutFronts(cabinet.front, ctx.carcassHeightIn);
  // Each front type is a registered plugin (drawer/door/fixed/falseFront, or a
  // third-party one). We track a per-type ordinal so part ids (DR1, DOOR2, …)
  // match what the old hard-coded switch produced.
  const ordinals = new Map<string, number>();
  let shelfNo = 0;
  for (const item of items) {
    // Unknown front ids degrade to an open 'fixed' reveal rather than crashing.
    const def = getFrontType(item.opening.type) ?? getFrontType('fixed')!;
    const ord = (ordinals.get(def.id) ?? 0) + 1;
    ordinals.set(def.id, ord);

    // Stamp every node a front plugin emits with its opening id, so the 3D view
    // can highlight the selected drawer/door. Carcass + shelves (built outside
    // this loop) stay opening-less — they belong to the cabinet, not a front.
    const itemF: PartFactory = {
      add: f.add,
      node: (n) => f.node(n.openingId ? n : { ...n, openingId: item.opening.id }),
    };
    const hw = def.build({ ctx, f: itemF, item, ordinal: ord });
    hardware.hinges += hw.hinges;
    hardware.slidePairs += hw.slidePairs;
    hardware.pulls += hw.pulls;
    hardware.pushLatches += hw.pushLatches;

    // Shelves live behind doors / in open (fixed) bays, never behind drawers.
    if (def.hostsShelves && (item.opening.shelves ?? 0) > 0) {
      shelfNo += 1;
      buildShelves(ctx, f, item, item.opening.shelves!, `C${ctx.index}-SH${shelfNo}`, `Shelf ${shelfNo}`);
    }
  }

  // Cabinet add-ons (Axis 5) layer extra parts/models onto the finished cabinet
  // and may tweak what's already there (e.g. route a dado into the bottom). They
  // run last so the carcass + fronts exist for them to reference.
  for (const addonId of cabinet.addons ?? []) {
    getCabinetAddon(addonId)?.apply({ ctx, f, parts, nodes });
  }

  return { cabinetId: cabinet.id, parts, nodes, hardware };
}

/** Carcass height for a run kind given its anchors. */
export function carcassHeightForRun(
  kind: RunKind,
  opts: { counterHeightIn?: number; heightIn?: number; legHeightIn: number; counterThicknessIn: number },
): number {
  if (kind === 'base') {
    return (opts.counterHeightIn ?? 36) - opts.legHeightIn - opts.counterThicknessIn;
  }
  if (kind === 'tall') {
    return (opts.heightIn ?? 84) - opts.legHeightIn;
  }
  // upper: hangs on the wall, no legs/counter
  return opts.heightIn ?? 30;
}
