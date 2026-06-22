/**
 * Built-in front types: drawer, door, fixed (open), falseFront.
 *
 * Each `build` does exactly what the old switch in buildCabinet.ts did, and each
 * `steps` mirrors the old per-opening branch in assembly/steps.ts, so part ids,
 * ordinals, hardware counts, and instructions are all unchanged.
 */
import type { AssemblyStep } from '../../assembly/steps';
import type { FrontTypeDef, FrontTypeHardware } from '../types';
import { doorCountField, doorStyleField, handleField, hingeSideField, shelvesField, slideField } from '../fields';
import { BOTTOM_GROOVE_UP, SCREWS_PER_JOINT } from '../../constants';
import { GROOVE_DEPTH, buildDrawer, buildFace, resolveSlideLength } from '../../geometry/drawerBox';
import { buildFixedDivider, fixedDividerPlan } from '../../geometry/dividers';
import { buildDoor, hingePlan } from '../../geometry/doors';
import { handleHardware, handleNote } from '../../geometry/handles';
import { toFraction } from '../../format';

const NO_HW: FrontTypeHardware = { hinges: 0, slidePairs: 0, pulls: 0, pushLatches: 0 };

export const drawerFront: FrontTypeDef = {
  id: 'drawer',
  label: 'Drawer',
  opens: 'drawer',
  fields: [slideField(), handleField('drawer'), doorStyleField()],
  build({ ctx, f, item, ordinal }): FrontTypeHardware {
    buildDrawer(ctx, f, item, ordinal);
    const h = handleHardware(item.opening, 1, ctx.drawerHandle);
    return { hinges: 0, slidePairs: 1, pulls: h.pulls, pushLatches: h.pushLatches };
  },
  steps({ item, ordinal, index, c, defaults, depthIn }): AssemblyStep[] {
    const C = `C${index}`;
    const out: AssemblyStep[] = [];
    // Resolve exactly like buildDrawer does, so the step text can never quote a
    // slide the geometry rejected (e.g. a 22" default in an 18"-deep carcass).
    const slide = resolveSlideLength(depthIn, item.opening.drawer?.slideLenIn);
    const slideLabel = c.slideType === 'under' ? 'under-mount' : 'side-mount';
    const joint =
      c.drawerJoint === 'dadoScrew'
        ? `glue the front/back into the side dados + ${SCREWS_PER_JOINT} screws per corner`
        : `glue the front/back into the side dados`;
    const undermount = c.slideType === 'under' ? ' Box depth = slide length; notch the rear of the bottom for the lock.' : '';
    // Machining first: the dados and grooves are routed flat, before any glue-up.
    const dado = toFraction(c.dadoDepthIn);
    out.push({
      phase: 'boxes',
      text:
        `Drawer ${ordinal} routing: cut a ${dado}-deep × ${toFraction(c.drawerThicknessIn)}-wide dado across the inside of both sides, ` +
        `${dado} from each end (the front/back seat in them). Then rout a ${toFraction(GROOVE_DEPTH)}-deep × ` +
        `${toFraction(c.drawerBottomThicknessIn)} groove for the bottom, ${toFraction(BOTTOM_GROOVE_UP)} up from the bottom edge, ` +
        `inside all four panels.`,
      partIds: [`${C}-DR${ordinal}-SIDE`, `${C}-DR${ordinal}-FB`],
    });
    out.push({
      phase: 'boxes',
      text: `Build drawer ${ordinal} box: ${joint}, then capture the bottom in its grooves. Mount on ${toFraction(slide)} ${slideLabel} slides.${undermount}`,
      partIds: [`${C}-DR${ordinal}-SIDE`, `${C}-DR${ordinal}-FB`, `${C}-DR${ordinal}-BOT`],
    });
    const dh = handleNote(item.opening, defaults.drawerHandle);
    if (dh) out.push({ phase: 'faces', text: `Drawer ${ordinal} handle: ${dh}.`, partIds: [`${C}-DR${ordinal}-FACE`] });
    return out;
  },
};

export const doorFront: FrontTypeDef = {
  id: 'door',
  label: 'Door',
  opens: 'door',
  fields: [
    doorCountField(),
    hingeSideField(),
    handleField('door'),
    shelvesField(),
    // Off by default: stacked doors share one cavity unless the user opts in to
    // walling each door off with a fixed divider panel between the sections.
    { target: 'setting:divider', label: 'Section divider', kind: 'toggle', default: false },
    doorStyleField(),
  ],
  hostsShelves: true,
  build({ ctx, f, item, ordinal }): FrontTypeHardware {
    buildDoor(ctx, f, item, ordinal);
    // A fixed divider closes this door's section off from its neighbours so a
    // stack of doors reads as separate cubbies (DDIV ids keep it distinct from
    // an open bay's DIV panels in the same cabinet).
    for (const d of fixedDividerPlan(ctx.cabinet.front, item, ordinal, ctx.index, 'DDIV')) {
      buildFixedDivider(ctx, f, d.yCenter, d.partId, d.label);
    }
    const leaves = item.opening.doorCount === 2 ? 2 : 1;
    const h = handleHardware(item.opening, leaves, ctx.doorHandle);
    return { hinges: hingePlan(item.faceHeightIn).count * leaves, slidePairs: 0, pulls: h.pulls, pushLatches: h.pushLatches };
  },
  steps({ cabinet, item, ordinal, index, defaults }): AssemblyStep[] {
    const C = `C${index}`;
    const out: AssemblyStep[] = [];
    const specs = fixedDividerPlan(cabinet.front, item, ordinal, index, 'DDIV');
    if (specs.length > 0) {
      const what = specs.length === 1 ? 'a fixed divider panel' : `${specs.length} fixed divider panels`;
      out.push({
        phase: 'carcass',
        text: `Door ${ordinal} section: dado ${what} into both sides and glue in to wall this door off from its neighbour.`,
        partIds: specs.map((s) => s.partId),
      });
    }
    const hp = hingePlan(item.faceHeightIn);
    const leaves = item.opening.doorCount === 2 ? 2 : 1;
    out.push({
      phase: 'doors',
      text: `Door ${ordinal}: bore ${hp.count}× Ø35mm hinge cups${leaves === 2 ? ' (each leaf)' : ''}, mount plates and hang. See the boring guide.`,
      partIds: [`${C}-DOOR${ordinal}`],
    });
    const oh = handleNote(item.opening, defaults.doorHandle);
    if (oh) out.push({ phase: 'doors', text: `Door ${ordinal} handle: ${oh}.`, partIds: [`${C}-DOOR${ordinal}`] });
    return out;
  },
};

/**
 * An open (no-door/no-drawer) bay. Can host adjustable shelves, and — when
 * "Enclose" is on (the default) — closes itself off from its neighbours with
 * fixed horizontal divider panels dado'd into the sides, so it reads as an
 * integrated compartment (a solid surface to set things on; hides a drawer box
 * below) instead of an open reveal that looks into the adjacent sections.
 */
export const fixedFront: FrontTypeDef = {
  id: 'fixed',
  label: 'Open bay',
  fields: [
    { target: 'setting:enclose', label: 'Enclose', kind: 'toggle', default: true },
    shelvesField(),
  ],
  hostsShelves: true,
  build({ ctx, f, item, ordinal }): FrontTypeHardware {
    for (const d of fixedDividerPlan(ctx.cabinet.front, item, ordinal, ctx.index)) {
      buildFixedDivider(ctx, f, d.yCenter, d.partId, d.label);
    }
    return NO_HW;
  },
  steps({ cabinet, item, ordinal, index }): AssemblyStep[] {
    const specs = fixedDividerPlan(cabinet.front, item, ordinal, index);
    if (specs.length === 0) return [];
    const what = specs.length === 1 ? 'a fixed divider panel' : `${specs.length} fixed divider panels`;
    return [{
      phase: 'carcass',
      text: `Open bay ${ordinal}: dado ${what} into both sides and glue in to close the bay — it forms a solid surface and hides any drawer box below.`,
      partIds: specs.map((s) => s.partId),
    }];
  },
};

/** A decorative face that's cut + edge-banded but has no box/hardware. */
export const falseFront: FrontTypeDef = {
  id: 'falseFront',
  label: 'False front',
  fields: [doorStyleField()],
  selectable: false,
  build({ ctx, f, item, ordinal }): FrontTypeHardware {
    buildFace(ctx, f, item, `C${ctx.index}-FF${ordinal}`, `False front ${ordinal}`, 1);
    return NO_HW;
  },
};

export const builtinFrontTypes: FrontTypeDef[] = [drawerFront, doorFront, fixedFront, falseFront];
