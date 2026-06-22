import type { Cabinet, MaterialRole, Project, RunKind } from './types';
import { doubleDoorLeafWidth, frontsOverflowIn, layoutFronts, singleFaceWidth } from './geometry/fronts';
import { drawerBoxHeight } from './geometry/drawerBox';
import { resolveConstruction } from './geometry/context';
import { wallMetrics } from './geometry/metrics';
import { elementDepth, elementVertical, effectiveWorkbenchSupport, workbenchSupportedSides } from './elements';
import { bandsCollide, bandsOverlap, elementsOverlapX } from './layout';
import { getFixture } from './plugins';
import { buildCutList } from './cutlist/collectParts';
import { DADO_DEPTH, DADO_MIN_REMAINING, DOUBLE_DOOR_MIN_WIDTH, MIN_CABINET_WIDTH, T_DRAWER, WORKBENCH_SUPPORT_WIDTH_IN } from './constants';
import { shortId, toFraction } from './format';

export type WarningKind =
  | 'frontsOverflow' | 'overlap' | 'upperOverlap' | 'oversize' | 'drawer' | 'workbench' | 'applianceFit'
  | 'door' | 'shelves' | 'cabinetSize' | 'clearance' | 'depth' | 'missingHood' | 'toekick' | 'counter' | 'material';

export interface ProjectWarning {
  kind: WarningKind;
  message: string;
}

/** Below this carcass height a cabinet isn't really buildable. */
const MIN_CARCASS_H = 6;

// --- Common-sense sanity thresholds. These are validator opinions (they warn,
// --- never block), so they live here rather than in constants.ts.
/** Widest practical frameless box — past this the top/shelves sag and the box is unwieldy. */
const MAX_CABINET_WIDTH = 48;
/** Practical carcass depth window; bases run ~24", uppers ~12". */
const MIN_CABINET_DEPTH = 6;
const MAX_CABINET_DEPTH = 30;
/** Narrower than this and a door leaf barely takes a euro hinge cup. */
const MIN_DOOR_LEAF_WIDTH = 4;
/** A closed door/fixed opening taller than this with no shelf is one big cavity. */
const SHELFLESS_WARN_HEIGHT = 36;
/** Minimum counter → upper clearance to fit anything on the counter (16–18" typical). */
const MIN_COUNTER_TO_UPPER = 12;
/** Open counter that should remain in front of an upper (uppers are shallower than bases). */
const MIN_COUNTER_WORKSPACE = 6;
/** Sane counter-height window: desk 29" … bar 42" (36" standard, 34" ADA). */
const COUNTER_HEIGHT_RANGE: [number, number] = [28, 44];
/** Sane countertop slab thickness (1 1/2" typical). */
const COUNTER_THICKNESS_RANGE: [number, number] = [0.75, 3];
/** Toe kick below this and you can't stand at the counter (3–4" standard). */
const MIN_TOEKICK_HEIGHT = 3;
/** Thinnest sensible sheet stock per role. */
const MIN_ROLE_THICKNESS: [role: MaterialRole, minIn: number, why: string][] = [
  ['carcass', 0.5, 'carcass panels — it won\'t hold screws or carry spans'],
  ['face', 0.625, 'doors and drawer faces — a euro hinge cup bores ~1/2" deep'],
  ['drawer', 0.375, 'drawer sides'],
  ['drawerBottom', 0.25, 'drawer bottoms'],
];

/**
 * Surface buildability problems the geometry tolerates but a real build can't:
 * fronts that overflow their opening, flex rows that don't fill their bay,
 * uppers crashing into the counter, and parts too big for their sheet.
 */
export function validateProject(project: Project): ProjectWarning[] {
  const out: ProjectWarning[] = [];

  let floorCabinets = false; // any base/tall carcass standing on the toe kick
  let baseRun = false; // any base-band cabinet/workbench sitting under the counter

  for (const room of project.rooms ?? []) {
    for (const wall of room.walls ?? []) {
      const m = wallMetrics(project, wall);
      const d = project.defaults;
      const checkFronts = (cab: Cabinet, carcassH: number, label: string) => {
        const over = frontsOverflowIn(cab.front, carcassH);
        if (over > 1e-6) {
          out.push({ kind: 'frontsOverflow', message: `${label}: fixed fronts exceed the opening by ${toFraction(over)} — reduce a height or switch one to Auto.` });
        }
      };

      // Door + shelf common sense: a leaf wider than ~24" sags off its euro
      // hinges and needs a huge swing; one narrower than ~4" barely takes a
      // hinge cup. And a tall closed opening with no shelves is one cavernous
      // cavity — almost always an oversight, not a design.
      const checkDoorsAndShelves = (cab: Cabinet, carcassH: number, widthIn: number, label: string) => {
        let n = 0;
        for (const item of layoutFronts(cab.front, carcassH)) {
          const o = item.opening;
          if (o.type === 'door') {
            n += 1;
            const pair = o.doorCount === 2;
            const leafW = pair ? doubleDoorLeafWidth(widthIn) : singleFaceWidth(widthIn);
            if (leafW > DOUBLE_DOOR_MIN_WIDTH + 1e-6) {
              out.push({ kind: 'door', message: pair
                ? `${label} door ${n}: each leaf of the pair is ${toFraction(leafW)} wide — past the ~${DOUBLE_DOOR_MIN_WIDTH}" a frameless door can carry; split the cabinet.`
                : `${label} door ${n}: a ${toFraction(leafW)} single door will sag and needs a huge swing — switch to a pair (max ~${DOUBLE_DOOR_MIN_WIDTH}" per leaf).` });
            } else if (leafW < MIN_DOOR_LEAF_WIDTH - 1e-6) {
              out.push({ kind: 'door', message: pair
                ? `${label} door ${n}: each leaf of the pair is only ${toFraction(leafW)} wide — switch to a single door.`
                : `${label} door ${n}: a ${toFraction(leafW)} door is too narrow to hinge or reach into.` });
            }
          }
          if ((o.type === 'door' || o.type === 'fixed') && item.faceHeightIn > SHELFLESS_WARN_HEIGHT && !((o.shelves ?? 0) > 0)) {
            out.push({ kind: 'shelves', message: `${label}: ${toFraction(item.faceHeightIn)} of enclosed height with no shelves — add shelves so the space is usable.` });
          }
        }
      };

      // Drawer-specific buildability: opening too short, slide too deep, or an
      // under-mount box without the 1/2" bottom its locking device needs.
      const checkDrawers = (cab: Cabinet, slot: RunKind, carcassH: number, depthIn: number, label: string) => {
        const c = resolveConstruction(cab, slot, undefined, d);
        // Dado deeper than the drawer-side stock can take (would cut through, so
        // the build caps it). Mirrors the thickness cascade: override → material → constant.
        if (cab.front.some((o) => o.type === 'drawer')) {
          const drawerMat = (project.materials ?? []).find((mt) => mt.roles?.includes('drawer'));
          const drawerT = cab.construction?.drawerThicknessIn ?? drawerMat?.thicknessIn ?? T_DRAWER;
          const reqDado = cab.construction?.dadoDepthIn ?? d.dadoDepthIn ?? DADO_DEPTH;
          const maxDado = drawerT - DADO_MIN_REMAINING;
          if (reqDado > maxDado + 1e-6) {
            out.push({ kind: 'drawer', message: `${label}: ${toFraction(reqDado)} dado is too deep for ${toFraction(drawerT)} drawer stock — capped at ${toFraction(Math.max(0, maxDado))} to keep ≥ ${toFraction(DADO_MIN_REMAINING)} of material.` });
          }
        }
        let n = 0;
        for (const item of layoutFronts(cab.front, carcassH)) {
          if (item.opening.type !== 'drawer') continue;
          n += 1;
          if (item.faceHeightIn < 2 || drawerBoxHeight(item) < 2) {
            out.push({ kind: 'drawer', message: `${label} drawer ${n}: opening is too short for a drawer box (needs ≥ 2").` });
          }
          const requested = item.opening.drawer?.slideLenIn;
          if (requested != null && requested > depthIn - 1 + 1e-6) {
            out.push({ kind: 'drawer', message: `${label} drawer ${n}: ${toFraction(requested)}" slide won't fit a ${toFraction(depthIn)}" deep cabinet — it will be cut back to fit.` });
          }
          if (c.slideType === 'under' && c.drawerBottomThicknessIn < 0.5 - 1e-6) {
            out.push({ kind: 'drawer', message: `${label} drawer ${n}: under-mount slides need a ≥ 1/2" drawer bottom.` });
          }
        }
      };

      const els = wall.elements ?? [];
      for (const el of els) {
        const label = `Section ${shortId(el.id)}`;
        if (el.zone === 'base' && (el.cabinet || el.workbench)) baseRun = true;
        if (el.cabinet) {
          if (el.zone !== 'upper') floorCabinets = true;
          const v = elementVertical(el, wall, m, d);
          const depthIn = el.cabinet.depthOverrideIn ?? el.depthOverrideIn ?? v.depthDefault;
          checkFronts(el.cabinet, v.carcassH, label);
          checkDoorsAndShelves(el.cabinet, v.carcassH, el.widthIn, label);
          checkDrawers(el.cabinet, v.runKind, v.carcassH, depthIn, label);
          // Footprint sanity: outside the practical width/depth window a box is
          // buildable on paper but miserable in the shop and in use.
          if (el.widthIn > MAX_CABINET_WIDTH + 1e-6) {
            out.push({ kind: 'cabinetSize', message: `${label}: a ${toFraction(el.widthIn)} wide cabinet — past ${MAX_CABINET_WIDTH}" the top and shelves sag and the box is unwieldy; split it into two.` });
          } else if (el.widthIn < MIN_CABINET_WIDTH - 1e-6) {
            out.push({ kind: 'cabinetSize', message: `${label}: ${toFraction(el.widthIn)} is too narrow for a usable cabinet (min ${MIN_CABINET_WIDTH}").` });
          }
          if (depthIn < MIN_CABINET_DEPTH - 1e-6 || depthIn > MAX_CABINET_DEPTH + 1e-6) {
            out.push({ kind: 'cabinetSize', message: `${label}: ${toFraction(depthIn)} deep is an unusual carcass depth — bases run ~24", uppers ~12".` });
          }
          // An upper hanging low enough (incl. a ceiling-gap drop) to collide with
          // the countertop height.
          if (el.zone === 'upper' && v.yBottom < m.counterTopY - 1e-6) {
            out.push({ kind: 'upperOverlap', message: `${label}: upper overlaps the countertop height — raise the ceiling, lower the upper height, or reduce the ceiling gap.` });
          }
          // A ceiling-gap override that leaves a tall column with almost no height.
          if (el.zone === 'tall' && el.ceilingGapOverrideIn != null && v.carcassH < MIN_CARCASS_H - 1e-6) {
            out.push({ kind: 'upperOverlap', message: `${label}: the ${toFraction(el.ceilingGapOverrideIn)} ceiling gap leaves no usable height — reduce it.` });
          }
        }
        // A base appliance whose standard unit needs a counter height the project
        // doesn't provide (e.g. a dishwasher under a 30" counter won't fit). The
        // counter height is a single project-wide value, so we can't auto-fit it —
        // surface it instead of silently drawing a mismatched box.
        if (el.fixtureId && el.zone === 'base') {
          const def = getFixture(el.fixtureId);
          const span = def?.counterHeightRangeIn;
          if (def && span && (m.counterTopY < span[0] - 1e-6 || m.counterTopY > span[1] + 1e-6)) {
            const dir = m.counterTopY < span[0] ? 'below' : 'above';
            const name = def.label.toLowerCase();
            out.push({ kind: 'applianceFit', message: `${label}: counter height ${toFraction(m.counterTopY)} is ${dir} the ${toFraction(span[0])}–${toFraction(span[1])} a standard ${name} needs — adjust the counter height or remove the ${name}.` });
          }
        }
        // A workbench resting only on the cabinets it abuts ('none'), over a wide
        // mid-span, will sag between them.
        if (el.workbench) {
          const sides = workbenchSupportedSides(wall, el);
          if (effectiveWorkbenchSupport(el.workbenchSupport, sides.left, sides.right) === 'none' && el.widthIn > WORKBENCH_SUPPORT_WIDTH_IN) {
            out.push({ kind: 'workbench', message: `${label}: a ${toFraction(el.widthIn)} unsupported span between cabinets will sag — add legs, stretchers, or a drawer box.` });
          }
        }
        // Out-of-bounds: an element running off either end of the wall.
        if (el.xIn < -1 / 32 || el.xIn + el.widthIn > wall.lengthIn + 1 / 32) {
          out.push({ kind: 'overlap', message: `${label} runs off the wall (${toFraction(el.xIn)} to ${toFraction(el.xIn + el.widthIn)} of ${toFraction(wall.lengthIn)}).` });
        }
      }

      // Two elements whose vertical bands share space overlapping in x. Same-band
      // pairs collide, and a full-height `tall` column collides with the base and
      // upper bands it spans — except a fridge, which frees the band above its body
      // for an upper. When that relaxation applies we still check the fridge body
      // doesn't actually reach up into the upper (a low ceiling), and warn if so.
      const sorted = [...els].sort((a, b) => a.xIn - b.xIn);
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          if (b.xIn >= a.xIn + a.widthIn - 1 / 32) break; // no later element can overlap a
          if (!elementsOverlapX(a, b)) continue;
          if (bandsCollide(a, b)) {
            const where = a.zone === b.zone ? ` in the ${a.zone} row` : '';
            out.push({ kind: 'overlap', message: `Section ${shortId(a.id)} and ${shortId(b.id)} overlap${where}.` });
          } else if (bandsOverlap(a.zone, b.zone)) {
            // A relaxed tall-fixture / upper pair: confirm the body clears the upper.
            const tall = a.zone === 'tall' ? a : b;
            const upper = a.zone === 'tall' ? b : a;
            const def = tall.fixtureId ? getFixture(tall.fixtureId) : undefined;
            const bodyTop = def?.occupiedHeightIn?.({ element: tall, config: tall.fixture, metrics: m });
            const upV = elementVertical(upper, wall, m, d);
            if (bodyTop != null && bodyTop > upV.yBottom + 1e-6) {
              out.push({ kind: 'applianceFit', message: `Section ${shortId(tall.id)} (${def?.label ?? 'appliance'}) reaches ${toFraction(bodyTop)} but the cabinet above it starts at ${toFraction(upV.yBottom)} — lower the appliance, raise the ceiling, or shorten the upper.` });
            }
          }
        }
      }

      // An upper over a base run: enough clearance above the counter to actually
      // use it, and shallow enough that the counter in front stays open (an
      // upper as deep as the base below it is a head-banger).
      for (const el of els) {
        if (el.zone !== 'upper' || !el.cabinet) continue;
        const under = els.filter((b) => b !== el && b.zone === 'base' && (b.cabinet || b.workbench || b.fixtureId) && elementsOverlapX(el, b));
        if (under.length === 0) continue;
        const label = `Section ${shortId(el.id)}`;
        const v = elementVertical(el, wall, m, d);
        const gap = v.yBottom - m.counterTopY;
        // gap < 0 is already the upperOverlap warning above.
        if (gap > -1 / 32 && gap < MIN_COUNTER_TO_UPPER - 1e-6) {
          out.push({ kind: 'clearance', message: `${label}: only ${toFraction(Math.max(0, gap))} between the countertop and the upper — 16–18" is standard; raise or shorten the upper.` });
        }
        const upDepth = elementDepth(el, d);
        const underDepth = Math.max(...under.map((b) => elementDepth(b, d)));
        if (upDepth > underDepth - 1e-6) {
          out.push({ kind: 'depth', message: `${label}: the ${toFraction(upDepth)} deep upper is as deep as the base below — you'll hit your head; uppers run ~12–15" deep.` });
        } else if (upDepth > underDepth - MIN_COUNTER_WORKSPACE + 1e-6) {
          out.push({ kind: 'depth', message: `${label}: the ${toFraction(upDepth)} deep upper leaves only ${toFraction(underDepth - upDepth)} of open counter in front of it — keep uppers ≥ ${MIN_COUNTER_WORKSPACE}" shallower than the base.` });
        }
      }

      // Floor-standing cabinets that touch at different depths: the fronts won't
      // line up and the merged countertop splits at the step.
      const floorCabs = els.filter((e) => (e.zone === 'base' || e.zone === 'tall') && e.cabinet).sort((a, b) => a.xIn - b.xIn);
      for (let i = 0; i + 1 < floorCabs.length; i++) {
        const a = floorCabs[i];
        const b = floorCabs[i + 1];
        if (Math.abs(a.xIn + a.widthIn - b.xIn) > 1 / 32) continue; // only touching neighbours
        const da = elementDepth(a, d);
        const db = elementDepth(b, d);
        if (Math.abs(da - db) > 1 / 32) {
          out.push({ kind: 'depth', message: `Section ${shortId(a.id)} and ${shortId(b.id)} sit side by side at different depths (${toFraction(da)} vs ${toFraction(db)}) — the fronts won't line up and the countertop steps.` });
        }
      }

      // A cooking surface (range / cooktop) with no extraction above it: look for
      // a hood fixture overlapping it in x anywhere on this wall.
      for (const el of els) {
        const def = el.fixtureId ? getFixture(el.fixtureId) : undefined;
        if (def?.vent !== 'cooktop') continue;
        const hooded = els.some((e) => e !== el && e.fixtureId && getFixture(e.fixtureId)?.vent === 'hood' && elementsOverlapX(el, e));
        if (!hooded) {
          out.push({ kind: 'missingHood', message: `Section ${shortId(el.id)}: a cooking surface with no hood — add a hood fan in the upper band above it.` });
        }
      }
    }
  }

  // Project-wide setup sanity. Only nag about the counter/toe kick when
  // something actually stands under them.
  const pd = project.defaults;
  if (floorCabinets && pd.legHeightIn < MIN_TOEKICK_HEIGHT - 1e-6) {
    out.push({ kind: 'toekick', message: pd.legHeightIn <= 0
      ? 'No toe kick — base cabinets sit flat on the floor and you can\'t stand close to the counter. Set the leg height to ~4".'
      : `A ${toFraction(pd.legHeightIn)} toe kick is too low for your feet — 3–4" is standard.` });
  }
  if (baseRun) {
    const [minH, maxH] = COUNTER_HEIGHT_RANGE;
    if (pd.counterHeightIn < minH - 1e-6 || pd.counterHeightIn > maxH + 1e-6) {
      out.push({ kind: 'counter', message: `Counter height ${toFraction(pd.counterHeightIn)} is unusually ${pd.counterHeightIn < minH ? 'low' : 'high'} — 36" is standard (34" ADA, 42" bar).` });
    }
    const [minT, maxT] = COUNTER_THICKNESS_RANGE;
    if (pd.countertopEnabled !== false && (pd.counterThicknessIn < minT - 1e-6 || pd.counterThicknessIn > maxT + 1e-6)) {
      out.push({ kind: 'counter', message: `A ${toFraction(pd.counterThicknessIn)} countertop is ${pd.counterThicknessIn < minT ? 'too thin to span the cabinets' : 'unusually thick'} — 1 1/2" is typical.` });
    }
  }

  // Questionable sheet stock for a role: panels too thin to hold screws, carry
  // spans, or take hinge cups.
  for (const mt of project.materials ?? []) {
    for (const [role, minIn, why] of MIN_ROLE_THICKNESS) {
      if ((mt.roles ?? []).includes(role) && mt.thicknessIn < minIn - 1e-6) {
        out.push({ kind: 'material', message: `${mt.name} (${toFraction(mt.thicknessIn)}) is thin for ${why}. Use ≥ ${toFraction(minIn)} stock.` });
      }
    }
  }

  // Parts that can't be nested on their sheet stock.
  for (const g of buildCutList(project).groups) {
    for (const o of g.nesting?.oversize ?? []) {
      out.push({ kind: 'oversize', message: `${o.label} (${toFraction(o.wIn)} × ${toFraction(o.lIn)}) is larger than a ${g.material.name} sheet.` });
    }
  }

  return out;
}
