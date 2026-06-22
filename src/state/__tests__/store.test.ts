import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, MIN_ELEMENT_WIDTH, MIN_CABINET_WIDTH } from '../store';
import { seedProject } from '../../domain/seed';
import type { Project } from '../../domain/types';
import { firstWall } from '../store';

function reset() {
  useStore.getState().resetToSeed();
}

describe('store: JSON import/export', () => {
  beforeEach(reset);

  it('round-trips a project through export → load', () => {
    const before = useStore.getState().exportJSON();
    expect(useStore.getState().loadJSON(before)).toBe(true);
    expect(useStore.getState().exportJSON()).toBe(before);
  });

  it('rejects invalid JSON and keeps the current project', () => {
    const before = useStore.getState().project;
    expect(useStore.getState().loadJSON('{not json')).toBe(false);
    expect(useStore.getState().project).toBe(before);
  });

  it('rejects a JSON object without a rooms array', () => {
    expect(useStore.getState().loadJSON('{"name":"x"}')).toBe(false);
  });

  it('migrates a legacy material role → roles[] and adds default pricing', () => {
    const legacy = seedProject() as Project & { pricing?: unknown };
    // Simulate a pre-roles, pre-pricing save.
    (legacy.materials[0] as unknown as { role: string; roles?: unknown }).role = 'carcass';
    delete (legacy.materials[0] as { roles?: unknown }).roles;
    delete legacy.pricing;

    expect(useStore.getState().loadJSON(JSON.stringify(legacy))).toBe(true);

    const p = useStore.getState().project;
    expect(p.materials[0].roles).toEqual(['carcass']);
    expect(p.pricing).toBeTruthy();
    expect(p.pricing?.hingeEach).toBeGreaterThan(0);
  });

  it('backfills defaults/materials when an imported file omits them', () => {
    // A minimal-but-valid file: rooms present, but defaults/materials missing.
    const minimal = JSON.stringify({ id: 'x', name: 'Imported', units: 'in', rooms: [{ id: 'r', name: 'R', walls: [] }] });
    expect(useStore.getState().loadJSON(minimal)).toBe(true);
    const p = useStore.getState().project;
    expect(p.defaults.counterThicknessIn).toBeGreaterThan(0);
    expect(p.materials.length).toBeGreaterThan(0);
    expect(p.pricing).toBeTruthy();
  });
});

describe('store: element mutations', () => {
  beforeEach(reset);

  it('resizeElement clamps a cabinet to the cabinet minimum width', () => {
    const el = firstWall(useStore.getState().project)!.elements[0]; // seed element is a cabinet
    // Ask for an impossibly small width; a cabinet section clamps to MIN_CABINET_WIDTH.
    useStore.getState().resizeElement(el.id, 1);
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === el.id)!;
    expect(after.widthIn).toBe(MIN_CABINET_WIDTH);
  });

  it('resizeElement clamps an empty section to the bare element minimum width', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { kind: 'empty', xIn: 0, widthIn: 24 });
    const el = firstWall(useStore.getState().project)!.elements[0];
    useStore.getState().resizeElement(el.id, 1);
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === el.id)!;
    expect(after.widthIn).toBe(MIN_ELEMENT_WIDTH);
  });

  it('resizeElement snaps a size-locked appliance to its standard widths', () => {
    // Add a dishwasher (standard widths [18, 24], locked by default), then resize off-size.
    useStore.getState().addElement('base', { kind: 'appliance', widthIn: 24 });
    const el = firstWall(useStore.getState().project)!.elements.find((e) => e.fixtureId === 'dishwasher')!;
    useStore.getState().resizeElement(el.id, 20); // closer to 18 than 24
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === el.id)!;
    expect(after.widthIn).toBe(18);
  });

  it('addElement appends a new element to the active wall', () => {
    const before = firstWall(useStore.getState().project)!.elements.length;
    useStore.getState().addElement('base');
    expect(firstWall(useStore.getState().project)!.elements.length).toBe(before + 1);
  });

  it('removeElement drops the targeted element', () => {
    const target = firstWall(useStore.getState().project)!.elements[0].id;
    useStore.getState().removeElement(target);
    const ids = firstWall(useStore.getState().project)!.elements.map((e) => e.id);
    expect(ids).not.toContain(target);
  });

  it('moveElement keeps a lone element within the wall bounds', () => {
    // A clean wall with a single element: moving past the end clamps to lengthIn - widthIn.
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 24 });
    const wall = firstWall(useStore.getState().project)!;
    const el = wall.elements[0];
    useStore.getState().moveElement(el.id, wall.lengthIn + 100);
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === el.id)!;
    expect(after.xIn).toBe(wall.lengthIn - after.widthIn);
  });

  it('moveElement stops at a neighbour instead of overlapping it', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 24 });
    useStore.getState().addElement('base', { xIn: 40, widthIn: 24 });
    const [a, b] = firstWall(useStore.getState().project)!.elements;
    // Drag A far to the right; it should rest against B's left edge, not overlap.
    useStore.getState().moveElement(a.id, 1000);
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === a.id)!;
    expect(after.xIn).toBe(b.xIn - a.widthIn);
  });

  it('resizeElement caps width at the next neighbour (no overlap)', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 24 });
    useStore.getState().addElement('base', { xIn: 40, widthIn: 24 });
    const [a, b] = firstWall(useStore.getState().project)!.elements;
    useStore.getState().resizeElement(a.id, 100); // would run well into B
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === a.id)!;
    expect(after.xIn + after.widthIn).toBeLessThanOrEqual(b.xIn + 1e-6);
  });

  it('a tall column blocks a base element from sliding under it', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 24 });
    useStore.getState().addElement('tall', { xIn: 50, widthIn: 24 });
    const base = firstWall(useStore.getState().project)!.elements.find((e) => e.zone === 'base')!;
    const tall = firstWall(useStore.getState().project)!.elements.find((e) => e.zone === 'tall')!;
    useStore.getState().moveElement(base.id, 1000);
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === base.id)!;
    expect(after.xIn).toBe(tall.xIn - after.widthIn);
  });

  it('setElementFixture sets/clears an element fixture', () => {
    const el = firstWall(useStore.getState().project)!.elements[0];
    useStore.getState().setElementFixture(el.id, 'dishwasher');
    expect(firstWall(useStore.getState().project)!.elements.find((x) => x.id === el.id)!.fixtureId).toBe('dishwasher');
    useStore.getState().setElementFixture(el.id, '');
    expect(firstWall(useStore.getState().project)!.elements.find((x) => x.id === el.id)!.fixtureId).toBeUndefined();
  });

  it('a standalone appliance (fridge) clears the cabinet and adopts its band', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 36 });
    const el = firstWall(useStore.getState().project)!.elements[0];
    expect(el.cabinet).toBeTruthy();
    useStore.getState().setElementFixture(el.id, 'fridge');
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === el.id)!;
    expect(after.cabinet).toBeUndefined(); // not "cabinet AND fridge"
    expect(after.zone).toBe('tall'); // fridge can't live in the base band
  });

  it('addElement seeds a specific appliance by fixtureId and adopts its band', () => {
    useStore.getState().resetToBlank();
    // The canvas creation picker passes an explicit fixtureId (e.g. a range in a
    // base gap, or a fridge for a tall column) rather than the band default.
    useStore.getState().addElement('base', { xIn: 0, kind: 'appliance', fixtureId: 'range' });
    useStore.getState().addElement('tall', { xIn: 60, kind: 'appliance', fixtureId: 'fridge' });
    const els = firstWall(useStore.getState().project)!.elements;
    const range = els.find((e) => e.fixtureId === 'range')!;
    const fridge = els.find((e) => e.fixtureId === 'fridge')!;
    expect(range.zone).toBe('base');
    expect(range.cabinet).toBeUndefined();
    expect(fridge.zone).toBe('tall'); // fridge is a full-height appliance
  });

  it('adding a cabinet to a standalone appliance clears that appliance', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { kind: 'appliance' }); // dishwasher (standalone)
    const el = firstWall(useStore.getState().project)!.elements[0];
    useStore.getState().setElementCabinet(el.id, true);
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === el.id)!;
    expect(after.cabinet).toBeTruthy();
    expect(after.fixtureId).toBeUndefined();
  });

  it('an integratable cooktop coexists with a base cabinet', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 30 });
    const el = firstWall(useStore.getState().project)!.elements[0];
    useStore.getState().setElementFixture(el.id, 'cooktop');
    const after = firstWall(useStore.getState().project)!.elements.find((x) => x.id === el.id)!;
    expect(after.cabinet).toBeTruthy(); // integrated: cabinet kept
    expect(after.fixtureId).toBe('cooktop');
  });
});

describe('store: section type', () => {
  beforeEach(reset);

  const only = () => firstWall(useStore.getState().project)!.elements[0];
  const reload = (id: string) => firstWall(useStore.getState().project)!.elements.find((x) => x.id === id)!;

  it('cabinet → appliance clears the cabinet and adopts the fixture band', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 30 });
    const el = only();
    expect(el.cabinet).toBeTruthy();
    useStore.getState().setElementType(el.id, 'appliance');
    const after = reload(el.id);
    expect(after.cabinet).toBeUndefined();
    expect(after.fixtureId).toBe('dishwasher'); // base band default
    expect(after.zone).toBe('base');
  });

  it('appliance → workbench forces the base band and clears the fixture', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { kind: 'appliance' }); // dishwasher
    const el = only();
    useStore.getState().setElementType(el.id, 'workbench');
    const after = reload(el.id);
    expect(after.workbench).toBe(true);
    expect(after.cabinet).toBeUndefined();
    expect(after.fixtureId).toBeUndefined();
    expect(after.zone).toBe('base');
  });

  it('any type → empty clears all content fields', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 30 });
    const el = only();
    useStore.getState().setElementType(el.id, 'empty');
    const after = reload(el.id);
    expect(after.cabinet).toBeUndefined();
    expect(after.workbench).toBeUndefined();
    expect(after.fixtureId).toBeUndefined();
    expect(after.fixture).toBeUndefined();
  });

  it('an upper appliance picks the hood (zone default)', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('upper', { xIn: 0, widthIn: 30 });
    const el = only();
    useStore.getState().setElementType(el.id, 'appliance');
    expect(reload(el.id).fixtureId).toBe('hood');
  });

  it('setDropInCooktop adds a cooktop over a base cabinet without dropping it', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 36 });
    const el = only();
    useStore.getState().setDropInCooktop(el.id, true);
    const after = reload(el.id);
    expect(after.cabinet).toBeTruthy();
    expect(after.fixtureId).toBe('cooktop');
    expect(after.fixture?.widthLocked).toBe(false); // shared width stays the cabinet's
    expect(after.widthIn).toBe(36); // not snapped to a cooktop standard size
  });

  it('setDropInCooktop off clears only the cooktop', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 36 });
    const el = only();
    useStore.getState().setDropInCooktop(el.id, true);
    useStore.getState().setDropInCooktop(el.id, false);
    const after = reload(el.id);
    expect(after.cabinet).toBeTruthy();
    expect(after.fixtureId).toBeUndefined();
  });
});

describe('store: multi-select + bulk commands', () => {
  beforeEach(reset);

  const els = () => firstWall(useStore.getState().project)!.elements;

  /** Lay out three uneven base sections and return their ids left→right. */
  function threeUneven(): string[] {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 10, kind: 'empty' });
    useStore.getState().addElement('base', { xIn: 15, widthIn: 10, kind: 'empty' });
    useStore.getState().addElement('base', { xIn: 60, widthIn: 10, kind: 'empty' });
    return [...els()].sort((a, b) => a.xIn - b.xIn).map((e) => e.id);
  }

  it('toggleSelect builds and trims the selection set', () => {
    const [a, b, c] = threeUneven();
    useStore.getState().select(a);
    expect(useStore.getState().ui.selectedElementIds).toEqual([a]);
    useStore.getState().toggleSelect(b);
    useStore.getState().toggleSelect(c);
    expect(new Set(useStore.getState().ui.selectedElementIds)).toEqual(new Set([a, b, c]));
    // Toggling the primary off promotes another selected section to primary.
    useStore.getState().toggleSelect(a);
    expect(useStore.getState().ui.selectedElementIds).not.toContain(a);
    expect(useStore.getState().ui.selectedElementId).toBeTruthy();
    expect([b, c]).toContain(useStore.getState().ui.selectedElementId);
  });

  it('spread-evenly redistributes the selected sections (outer edges fixed)', () => {
    const [a, b, c] = threeUneven();
    useStore.getState().select(a);
    useStore.getState().toggleSelect(b);
    useStore.getState().toggleSelect(c);
    useStore.getState().runSelectionCommand('spread-evenly');
    const byId = Object.fromEntries(els().map((e) => [e.id, e.xIn]));
    expect(byId[a]).toBeCloseTo(0); // left edge stays
    expect(byId[b]).toBeCloseTo(30); // even 20" gaps
    expect(byId[c]).toBeCloseTo(60); // right edge stays
  });

  it('runSelectionCommand is a no-op for a single (or empty) selection', () => {
    const [a] = threeUneven();
    useStore.getState().select(a);
    const before = els().map((e) => e.xIn);
    useStore.getState().runSelectionCommand('spread-evenly');
    expect(els().map((e) => e.xIn)).toEqual(before);
  });
});

describe('store: undo / redo', () => {
  beforeEach(reset);

  const els = () => firstWall(useStore.getState().project)!.elements;

  it('undo restores the previous project, redo reapplies it', () => {
    useStore.getState().resetToBlank();
    expect(els()).toHaveLength(0);
    useStore.getState().addElement('base', { xIn: 0, widthIn: 24 });
    expect(els()).toHaveLength(1);

    useStore.getState().undo();
    expect(els()).toHaveLength(0);

    useStore.getState().redo();
    expect(els()).toHaveLength(1);
  });

  it('coalesces a run of moves on the same element into one undo step', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 24 });
    const id = els()[0].id;

    useStore.getState().moveElement(id, 30);
    useStore.getState().moveElement(id, 40);
    expect(els()[0].xIn).toBe(40);

    // A single undo rewinds the whole drag, not just the last increment.
    useStore.getState().undo();
    expect(els()[0].xIn).toBe(0);
  });

  it('a new edit clears the redo stack', () => {
    useStore.getState().resetToBlank();
    useStore.getState().addElement('base', { xIn: 0, widthIn: 24 });
    useStore.getState().undo();
    expect(useStore.getState().future.length).toBe(1);

    useStore.getState().addElement('base', { xIn: 30, widthIn: 24 });
    expect(useStore.getState().future.length).toBe(0);
  });

  it('a no-op edit does not grow the undo stack', () => {
    useStore.getState().resetToBlank();
    const before = useStore.getState().past.length;
    useStore.getState().updateProject(() => { /* touch nothing */ });
    expect(useStore.getState().past.length).toBe(before);
  });

  it('loading a project starts a fresh timeline (nothing to undo)', () => {
    useStore.getState().addElement('base');
    const json = useStore.getState().exportJSON();
    useStore.getState().loadJSON(json);
    expect(useStore.getState().past).toHaveLength(0);
    const before = useStore.getState().project;
    useStore.getState().undo(); // no history → no change
    expect(useStore.getState().project).toBe(before);
  });
});

describe('store: reset actions', () => {
  it('resetToBlank produces a wall with no elements', () => {
    useStore.getState().resetToBlank();
    expect(firstWall(useStore.getState().project)!.elements).toHaveLength(0);
  });

  it('resetToSeed restores the demo elements', () => {
    useStore.getState().resetToBlank();
    useStore.getState().resetToSeed();
    expect(firstWall(useStore.getState().project)!.elements.length).toBeGreaterThan(0);
  });
});
