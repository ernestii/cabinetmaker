import { useEffect, useRef } from 'react';
import { ActionIcon, Button, Checkbox, ColorInput, Group, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { IconChevronUp, IconChevronDown, IconRestore } from '@tabler/icons-react';
import {
  CABINET_WIDTH_PRESETS, MIN_CABINET_WIDTH, MIN_ELEMENT_WIDTH, MIN_UPPER_HEIGHT,
  DEPTH_PRESETS, UPPER_HEIGHT_PRESETS, CEILING_GAP_PRESETS, DRAWER_HEIGHT_PRESETS, WORKBENCH_DRAWER_BANK_H,
} from '../../domain/constants';
import { useStore, getElement, allWalls, activeWall, wallContaining, type SectionType } from '../../state/store';
import { autoExposedSides } from '../../domain/layout';
import { toFraction } from '../../domain/format';
import type { Construction, FixtureConfig, Opening, OpeningType, RunKind, WallElement, Zone } from '../../domain/types';
import { elementKind, bandDepth, defaultDoorCount, effectiveWorkbenchSupport, workbenchSupportedSides } from '../../domain/elements';
import { getFrontType, listFrontTypes, listFixtures, getFixture, listCabinetAddons, listSelectionCommands } from '../../domain/plugins';
import { PluginFields } from '../plugins/PluginFields';
import { getAddonPanel, getFixturePanel, getFrontPanel, type InspectorPanel, type InspectorPanelProps } from '../plugins/registry';
import { InchInput } from '../components/InchInput';
import { InfoTip } from '../components/InfoTip';
import { ConfirmDelete } from '../components/ConfirmDelete';
import { Settings } from '../Settings/Settings';
import { BACK_STYLE_OPTS, DRAWER_JOINT_OPTS, SLIDE_TYPE_OPTS, labelOf } from '../constructionOptions';
import type { HandleType } from '../../domain/types';

// Front types, door styles, and fixtures are all registry-driven, so plugins
// surface in these dropdowns with no edits here.
const OPENING_TYPES: { value: OpeningType; label: string }[] = listFrontTypes()
  .filter((d) => d.selectable !== false)
  .map((d) => ({ value: d.id, label: d.label }));
const OPENING_LABEL = Object.fromEntries(listFrontTypes().map((d) => [d.id, d.label])) as Record<string, string>;
const CABINET_ADDONS = listCabinetAddons().map((a) => ({ id: a.id, label: a.label, description: a.description, slots: a.slots, fields: a.fields }));
const ZONE_OPTS: { value: Zone; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'upper', label: 'Upper' },
  { value: 'tall', label: 'Tall' },
];
/** An element's zone maps to a cabinet run kind for add-on filtering + handle defaults. */
function runKindOf(zone: Zone): RunKind {
  return zone === 'upper' ? 'upper' : zone === 'tall' ? 'tall' : 'base';
}

export function Inspector() {
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const select = useStore((s) => s.select);
  const removeElement = useStore((s) => s.removeElement);
  const resizeElement = useStore((s) => s.resizeElement);
  const updateElement = useStore((s) => s.updateElement);
  const setDropInCooktop = useStore((s) => s.setDropInCooktop);
  const setElementFixture = useStore((s) => s.setElementFixture);
  const updateCabinet = useStore((s) => s.updateCabinet);
  const runFrontCommand = useStore((s) => s.runFrontCommand);
  const addOpening = useStore((s) => s.addOpening);
  const updateOpening = useStore((s) => s.updateOpening);
  const removeOpening = useStore((s) => s.removeOpening);
  const moveOpening = useStore((s) => s.moveOpening);
  const selectOpening = useStore((s) => s.selectOpening);

  // Scroll the selected front's row into view — e.g. when a drawer is clicked in
  // the object tree, its settings come into view without a manual scroll.
  const openingRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    const id = ui.selectedOpeningId;
    if (id) openingRefs.current[id]?.scrollIntoView({ block: 'nearest' });
  }, [ui.selectedOpeningId]);

  // The Room/Project node shows project-wide settings; an element shows its
  // section inspector; otherwise the selected wall's properties.
  if (ui.roomSelected) return <div className="inspector"><Settings /></div>;
  // Several sections selected at once → the bulk-command panel, not a single
  // section's controls (its commands mirror the elevation's floating toolbar).
  if ((ui.selectedElementIds?.length ?? 0) > 1) return <MultiInspector ids={ui.selectedElementIds!} />;
  const el = getElement(project, ui.selectedElementId);
  if (!el) return <WallProps />;

  const d = project.defaults;
  const cab = el.cabinet;
  const fixtureDef = getFixture(el.fixtureId);
  const runKind = runKindOf(el.zone);
  const kind = elementKind(el);
  // One exclusive "section type" drives the whole Inspector body. A cabinet with an
  // integrated drop-in cooktop still reads as a Cabinet (the cooktop is a toggle).
  const type: SectionType =
    kind === 'appliance' ? 'appliance' : kind === 'workbench' ? 'workbench' : cab ? 'cabinet' : 'empty';
  // A single human title for the section header (e.g. "Upper cabinet",
  // "Dishwasher") — replaces the old Type/Zone badge pair.
  const sectionTitle =
    type === 'appliance' ? fixtureDef?.label ?? 'Appliance'
    : type === 'workbench' ? 'Workbench'
    : type === 'empty' ? 'Empty section'
    : `${ZONE_OPTS.find((z) => z.value === el.zone)?.label ?? el.zone} cabinet`;
  // The appliance list is zone-scoped: only fixtures whose band matches this
  // section show up, and the integratable cooktop is reached via its own toggle.
  const applianceData = listFixtures()
    .filter((dfn) => dfn.zone === el.zone && !dfn.integratable && dfn.selectable !== false)
    .map((dfn) => ({ value: dfn.id, label: dfn.label }));
  const minWidth = type === 'cabinet' || type === 'workbench' ? MIN_CABINET_WIDTH : MIN_ELEMENT_WIDTH;

  const setOpening = (op: Opening, patch: Partial<Opening>) => updateOpening(el.id, op.id, patch);
  const setConstruction = (patch: Partial<Construction>) =>
    cab && updateCabinet(el.id, { construction: { ...cab.construction, ...patch } });

  // Add-ons offered for this cabinet (filtered by its run kind). Selecting one
  // stores its id on `cab.addons`.
  const cabAddons = CABINET_ADDONS.filter((a) => !a.slots || a.slots.includes(runKind));
  const toggleAddon = (id: string, on: boolean) => {
    if (!cab) return;
    const cur = cab.addons ?? [];
    updateCabinet(el.id, { addons: on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id) });
  };
  // Exposed/finished sides auto-detect from the layout; the user can override.
  // `cab.exposedSides` set (incl. []) = manual override; undefined = auto.
  const exposedWall = wallContaining(project, el.id);
  const autoExposed = cab && exposedWall ? autoExposedSides(exposedWall, el, d) : [];
  const exposedOverridden = cab?.exposedSides !== undefined;
  const effectiveExposed = cab?.exposedSides ?? autoExposed;
  const setExposed = (side: 'left' | 'right', on: boolean) => {
    if (!cab) return;
    const base = cab.exposedSides ?? autoExposed; // start the override from what's effective now
    updateCabinet(el.id, { exposedSides: on ? [...new Set([...base, side])] : base.filter((x) => x !== side) });
  };
  const resetExposedToAuto = () => cab && updateCabinet(el.id, { exposedSides: undefined });
  const getAddonField = (addonId: string) => (target: string): unknown =>
    target.startsWith('setting:') ? cab?.addonSettings?.[addonId]?.[target.slice(8)] : undefined;
  const setAddonField = (addonId: string) => (target: string, value: unknown) => {
    if (!cab || !target.startsWith('setting:')) return;
    const key = target.slice(8);
    const cur = cab.addonSettings ?? {};
    updateCabinet(el.id, { addonSettings: { ...cur, [addonId]: { ...cur[addonId], [key]: value } } });
  };

  // "Remaining length" preset: how wide this element could grow to fill the rest
  // of its wall band (wall length minus this element's left edge).
  const wall = allWalls(project).find((w) => (w.elements ?? []).some((e) => e.id === el.id));
  const snap16 = (v: number) => Math.round(v * 16) / 16;
  const fill = wall ? snap16(wall.lengthIn - el.xIn) : 0;
  const widthExtra = fill >= minWidth ? [{ label: 'Remaining length', value: fill }] : undefined;

  return (
    <div className="inspector">
      <section className="insp-section">
        <div className="insp-head">
          <h3 className="insp-title">{sectionTitle}</h3>
          <ConfirmDelete icon title="Delete section" message="Delete this section and everything in it?"
            onConfirm={() => {
              removeElement(el.id);
              select(undefined);
            }} />
        </div>

        {/* An appliance's width is its stock size, set by the Appliance-width
            picker below — so the generic Width input is only for the other kinds.
            Move a section by dragging it (or arrow-keys) in the elevation. */}
        {type !== 'appliance' && (
          <label className="field">
            <span>Width</span>
            <InchInput value={el.widthIn} min={minWidth} w="100%" presets={CABINET_WIDTH_PRESETS} extraPresets={widthExtra} onCommit={(v) => resizeElement(el.id, v)} />
          </label>
        )}
        {type === 'empty' && <Text c="dark.1" fz="xs">Empty section — reserved width with nothing in it. Pick a type to fill it.</Text>}
      </section>

      {type === 'appliance' && (
        <section className="insp-section">
          <div className="insp-head"><h3>Appliance</h3></div>
          <label className="field">
            <span>Model</span>
            <Select size="xs" w="100%" allowDeselect={false} data={applianceData} value={el.fixtureId ?? ''}
              onChange={(v) => v && setElementFixture(el.id, v)} />
          </label>
          {fixtureDef && (
            <FixtureControls el={el} onChange={(patch) => updateElement(el.id, patch)} onResize={(w) => resizeElement(el.id, w)} />
          )}
        </section>
      )}

      {type === 'workbench' && (
        <section className="insp-section">
          <label className="field">
            <span>Depth</span>
            <OverrideInput value={el.depthOverrideIn} placeholder={toFraction(d.baseDepthIn)} presets={DEPTH_PRESETS}
              onCommit={(v) => updateElement(el.id, { depthOverrideIn: v })} onClear={() => updateElement(el.id, { depthOverrideIn: undefined })} />
          </label>
          {(() => {
            const sides = wall ? workbenchSupportedSides(wall, el) : { left: false, right: false };
            const flanked = sides.left && sides.right;
            const eff = effectiveWorkbenchSupport(el.workbenchSupport, sides.left, sides.right);
            return (
              <>
                <label className="field">
                  <span>Support <InfoTip label="How the bench is braced under the top: Legs (centre leg added over 60&quot;), reinforced apron Stretchers, a bank of drawers, or None — carried by the cabinets it abuts (needs one on BOTH sides)." /></span>
                  <Select size="xs" w="100%" allowDeselect={false}
                    data={[
                      { value: 'none', label: 'None (on cabinets)', disabled: !flanked },
                      { value: 'legs', label: 'Legs' },
                      { value: 'stretchers', label: 'Stretchers (reinforced)' },
                      { value: 'drawer', label: 'Drawer bank' },
                    ]}
                    value={eff}
                    onChange={(v) => v && updateElement(el.id, { workbenchSupport: v as NonNullable<WallElement['workbenchSupport']> })} />
                </label>
                {!flanked && (el.workbenchSupport ?? 'legs') === 'none' && (
                  <Text c="dark.1" fz="xs">"None" needs a cabinet on both sides — using legs for now.</Text>
                )}
                {eff === 'none' && el.widthIn > 48 && (
                  <Text c="danger.4" fz="xs">⚠ A {toFraction(el.widthIn)} span between the cabinets will sag — add stretchers or a drawer box.</Text>
                )}
              </>
            );
          })()}
          {effectiveWorkbenchSupport(el.workbenchSupport, wall ? workbenchSupportedSides(wall, el).left : false, wall ? workbenchSupportedSides(wall, el).right : false) === 'drawer' && (
            <label className="field">
              <span>Drawer height</span>
              <InchInput value={el.workbenchDrawerHeightIn ?? WORKBENCH_DRAWER_BANK_H} min={2} w="100%" presets={DRAWER_HEIGHT_PRESETS}
                onCommit={(v) => updateElement(el.id, { workbenchDrawerHeightIn: v })} />
            </label>
          )}
        </section>
      )}

      {type === 'cabinet' && (
        <section className="insp-section">
          {el.zone === 'base' && (
            <>
              <Checkbox size="xs" label="Drop-in cooktop" description="A cooktop set into the counter, cabinet below"
                checked={el.fixtureId === 'cooktop'} onChange={(e) => setDropInCooktop(el.id, e.currentTarget.checked)} />
              {el.fixtureId === 'cooktop' && (
                <FixtureControls el={el} onChange={(patch) => updateElement(el.id, patch)} onResize={(w) => resizeElement(el.id, w)} />
              )}
            </>
          )}
          {el.zone === 'upper' && (
            <label className="field" style={{ marginTop: 8 }}>
              <span>Upper height</span>
              <OverrideInput value={el.heightOverrideIn} min={MIN_UPPER_HEIGHT} placeholder={toFraction(d.upperHeightIn)} presets={UPPER_HEIGHT_PRESETS}
                onCommit={(v) => updateElement(el.id, { heightOverrideIn: v })} onClear={() => updateElement(el.id, { heightOverrideIn: undefined })} />
            </label>
          )}
          {(el.zone === 'upper' || el.zone === 'tall') && (
            <label className="field">
              <span>Ceiling gap <InfoTip label="Drops the top of this cabinet below the ceiling — e.g. to clear garage-door rails." /></span>
              <OverrideInput value={el.ceilingGapOverrideIn} min={0} placeholder={toFraction(el.zone === 'upper' ? d.upperCeilingGapIn : 0)} presets={CEILING_GAP_PRESETS}
                onCommit={(v) => updateElement(el.id, { ceilingGapOverrideIn: v })} onClear={() => updateElement(el.id, { ceilingGapOverrideIn: undefined })} />
            </label>
          )}
        </section>
      )}

      {cab && (
        <section className="insp-section">
          <label className="field">
            <span>Depth</span>
            <OverrideInput value={cab.depthOverrideIn} placeholder={toFraction(bandDepth(d, el.zone))} presets={DEPTH_PRESETS}
              onCommit={(v) => updateCabinet(el.id, { depthOverrideIn: v })} onClear={() => updateCabinet(el.id, { depthOverrideIn: undefined })} />
          </label>

          <OverrideSelect label="Back" options={BACK_STYLE_OPTS} def={d.backStyle}
            value={cab.construction?.backStyle} onChange={(v) => setConstruction({ backStyle: v })} />

          {cab.front.some((o) => o.type === 'drawer') && (
            <>
              <h4 className="insp-subhead">Drawer construction</h4>
              <OverrideSelect label="Joint" options={DRAWER_JOINT_OPTS} def={d.drawerJoint}
                value={cab.construction?.drawerJoint} onChange={(v) => setConstruction({ drawerJoint: v })} />
              <OverrideSelect label="Slide type" options={SLIDE_TYPE_OPTS} def={d.slideType}
                value={cab.construction?.slideType} onChange={(v) => setConstruction({ slideType: v })} />
            </>
          )}

          <hr className="insp-rule" />
          <Group justify="space-between" align="center">
            <h4 className="insp-subhead" style={{ margin: 0 }}>Finished sides</h4>
            {exposedOverridden && (
              <Button variant="subtle" size="compact-xs" onClick={resetExposedToAuto}>Auto</Button>
            )}
          </Group>
          <Text c="dark.1" fz="xs" mb={4}>
            {exposedOverridden ? 'Manual override — ' : 'Auto from the layout — '}
            exposed ends are cut from face stock, not hidden carcass ply.
          </Text>
          <Group gap="md">
            <Checkbox size="xs" label="Left exposed"
              checked={effectiveExposed.includes('left')}
              onChange={(e) => setExposed('left', e.currentTarget.checked)} />
            <Checkbox size="xs" label="Right exposed"
              checked={effectiveExposed.includes('right')}
              onChange={(e) => setExposed('right', e.currentTarget.checked)} />
          </Group>

          {cabAddons.length > 0 && (
            <>
              <hr className="insp-rule" />
              <h4 className="insp-subhead">Add-ons</h4>
              {cabAddons.map((a) => {
                const on = (cab.addons ?? []).includes(a.id);
                return (
                  <div key={a.id}>
                    <Checkbox size="xs" mt={6} label={a.label}
                      checked={on} onChange={(e) => toggleAddon(a.id, e.currentTarget.checked)} />
                    {on && ((a.fields && a.fields.length > 0) || getAddonPanel(a.id)) && (
                      <div className="opening-row-fields" style={{ marginTop: 6 }}>
                        <PluginFields fields={a.fields ?? []} ctx={{ get: getAddonField(a.id) }} set={setAddonField(a.id)} />
                        <PluginPanel panel={getAddonPanel(a.id)} get={getAddonField(a.id)} set={setAddonField(a.id)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          <hr className="insp-rule" />
          <div className="insp-head">
            <h3>Fronts</h3>
            <Button variant="default" size="xs" onClick={() => addOpening(el.id)}>+ Add front</Button>
          </div>

          <div className="opening-list">
            {cab.front.map((op, i) => {
              const sel = op.id === ui.selectedOpeningId;
              const def = getFrontType(op.type);
              // One field adapter shared by the declarative fields and the
              // plugin's optional custom panel, so both read/write the same opening.
              const get = frontFieldGet(op, def?.opens === 'drawer' ? d.drawerHandle : d.doorHandle);
              const set = (target: string, value: unknown) => frontFieldSet(setOpening, op, target, value);
              const fieldCtx = { get, slot: runKind, position: { index: i, count: cab.front.length } };
              return (
                <div key={op.id} ref={(node) => { openingRefs.current[op.id] = node; }}
                  className={`opening-row${sel ? ' selected' : ''}`}
                  role="button" tabIndex={0}
                  aria-label={`Front ${i + 1}: ${OPENING_LABEL[op.type] ?? op.type}`} aria-pressed={sel}
                  onClick={() => selectOpening(op.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOpening(op.id); } }}>
                  <div className="opening-row-top">
                    <span className="op-index">{i + 1}</span>
                    <div className="row-reorder">
                      <ActionIcon variant="subtle" size="sm" color="gray" disabled={i === 0} title="Move up" aria-label="Move up"
                        onClick={(e) => { e.stopPropagation(); moveOpening(el.id, op.id, -1); }}><IconChevronUp size={15} /></ActionIcon>
                      <ActionIcon variant="subtle" size="sm" color="gray" disabled={i === cab.front.length - 1} title="Move down" aria-label="Move down"
                        onClick={(e) => { e.stopPropagation(); moveOpening(el.id, op.id, 1); }}><IconChevronDown size={15} /></ActionIcon>
                    </div>
                    <ConfirmDelete icon title="Delete front" message={`Delete this ${(OPENING_LABEL[op.type] ?? 'front').toLowerCase()}?`}
                      onConfirm={() => removeOpening(el.id, op.id)} />
                    <Select size="xs" allowDeselect={false} style={{ flex: 1 }} data={OPENING_TYPES} value={op.type}
                      onChange={(v) => v && setOpening(op, {
                        type: v as OpeningType, handle: undefined,
                        // Switching to a door picks single/pair by cabinet width.
                        ...(v === 'door' && op.doorCount == null ? { doorCount: defaultDoorCount(cab.widthIn) } : {}),
                      })} aria-label="Front type" />
                  </div>
                  <div className="opening-row-fields">
                    <label className="mini">
                      <span className="mini-label">Height</span>
                      <Group gap={6} wrap="nowrap">
                        <SegmentedControl
                          flex={1}
                          data={[{ value: 'auto', label: 'Auto' }, { value: 'fixed', label: 'Fixed' }]}
                          value={op.heightIn === 'auto' ? 'auto' : 'fixed'}
                          onChange={(v) => setOpening(op, { heightIn: v === 'auto' ? 'auto' : op.heightIn === 'auto' ? 6 : op.heightIn })}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {op.heightIn !== 'auto' && <InchInput value={op.heightIn} min={1} w={64} presets={DRAWER_HEIGHT_PRESETS} onCommit={(v) => setOpening(op, { heightIn: v })} />}
                      </Group>
                    </label>
                    <PluginFields fields={def?.fields ?? []} ctx={fieldCtx} set={set} />
                    <PluginPanel panel={getFrontPanel(op.type)} get={get} set={set} slot={runKind} position={fieldCtx.position} />
                    {(def?.commands ?? []).map((cmd) => (
                      <Button key={cmd.id} size="xs" variant="default" mt={6} title={cmd.description}
                        onClick={(e) => { e.stopPropagation(); runFrontCommand(el.id, op.id, cmd.id); }}>{cmd.label}</Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <Text c="dark.1" fz="xs">Auto fronts split the leftover height evenly. Total reveal = N × 1/8".</Text>
        </section>
      )}
    </div>
  );
}

/** Mounts a plugin's custom Inspector panel (or nothing), so each call site is a one-liner. */
function PluginPanel({ panel: Panel, ...props }: { panel?: InspectorPanel } & InspectorPanelProps) {
  return Panel ? <Panel {...props} /> : null;
}

/** Read an opening's value for a plugin field target (core fields + the settings bag). */
function frontFieldGet(op: Opening, handleDefault: HandleType) {
  return (target: string): unknown => {
    switch (target) {
      case 'doorCount': return op.doorCount ?? 1;
      case 'hingeSide': return op.hingeSide ?? 'left';
      case 'handle': return op.handle ?? handleDefault;
      case 'shelves': return op.shelves ?? 0;
      case 'slideLen': return op.drawer?.slideLenIn ?? 22;
      case 'doorStyle': return op.doorStyle ?? 'slab';
      default: return target.startsWith('setting:') ? op.settings?.[target.slice(8)] : undefined;
    }
  };
}

/** Write an opening's value for a plugin field target. */
function frontFieldSet(setOpening: (op: Opening, patch: Partial<Opening>) => void, op: Opening, target: string, value: unknown): void {
  switch (target) {
    case 'doorCount': setOpening(op, { doorCount: Number(value) as 1 | 2 }); break;
    case 'hingeSide': setOpening(op, { hingeSide: value as 'left' | 'right' }); break;
    case 'handle': setOpening(op, { handle: value as HandleType }); break;
    case 'shelves': setOpening(op, { shelves: Number(value) || 0 }); break;
    case 'slideLen': setOpening(op, { drawer: { ...op.drawer, slideLenIn: Number(value) } }); break;
    case 'doorStyle': setOpening(op, { doorStyle: String(value) }); break;
    default: if (target.startsWith('setting:')) setOpening(op, { settings: { ...op.settings, [target.slice(8)]: value } });
  }
}

/**
 * Fixture controls for an element with an appliance: declarative fields + the
 * plugin's optional panel, the standard-size picker + size lock, and a
 * countertop pass/break hint. `get`/`set` adapt over `el.fixture` (core fields +
 * `setting:` bag), writing the whole config back via `updateElement`.
 */
function FixtureControls({ el, onChange, onResize }: {
  el: WallElement; onChange: (patch: Partial<WallElement>) => void; onResize: (widthIn: number) => void;
}) {
  const def = getFixture(el.fixtureId);
  const fixture: FixtureConfig = el.fixture ?? {};
  const get = (target: string): unknown =>
    target.startsWith('setting:') ? fixture.settings?.[target.slice(8)] : (fixture as Record<string, unknown>)[target];
  const set = (target: string, value: unknown): void => {
    if (target.startsWith('setting:')) onChange({ fixture: { ...fixture, settings: { ...fixture.settings, [target.slice(8)]: value } } });
    else onChange({ fixture: { ...fixture, [target]: value } });
  };
  const sizes = def?.standardWidthsIn ?? [];
  return (
    <>
      <PluginFields fields={def?.fields ?? []} ctx={{ get }} set={set} />
      <PluginPanel panel={getFixturePanel(el.fixtureId)} get={get} set={set} />
      {/* A standalone appliance is always locked to its stock widths (its width
          IS its model size), so the picker is the only width control. An
          integratable drop-in (cooktop) takes its width from the host cabinet, so
          it shows no width control at all. */}
      {sizes.length > 0 && !def?.integratable && (
        <label className="field" style={{ marginTop: 8 }}>
          <span>Appliance width</span>
          <Select size="xs" w="100%" allowDeselect={false}
            data={sizes.map((s) => ({ value: String(s), label: toFraction(s) }))}
            value={String(sizes.reduce((b, s) => (Math.abs(s - el.widthIn) < Math.abs(b - el.widthIn) ? s : b), sizes[0]))}
            onChange={(v) => v && onResize(Number(v))} />
        </label>
      )}
      <Text c="dark.1" fz="xs">{def?.countertop === 'break' ? 'Countertop stops on both sides of this appliance.' : 'Countertop runs continuously over this appliance.'}</Text>
    </>
  );
}

/** Numeric override field with a placeholder default, common-size presets, and a clear-to-default ✕. */
function OverrideInput({ value, placeholder, onCommit, onClear, min = 3, presets }: {
  value?: number; placeholder: string; onCommit: (v: number) => void; onClear: () => void; min?: number;
  presets?: readonly number[];
}) {
  return (
    <div className="override-control">
      {/* InchInput now shows its own " suffix, so drop the one the placeholder
          default carries to avoid a doubled inch mark. */}
      <InchInput value={value ?? null} placeholder={placeholder.replace('"', '')} min={min} w="100%"
        presets={presets} onCommit={onCommit} onClear={onClear} />
      {value != null && (
        <ActionIcon color="gray" variant="subtle" size="md" title="Reset to default" aria-label="Reset to default" onClick={onClear}><IconRestore size={15} /></ActionIcon>
      )}
    </div>
  );
}

/** Per-cabinet construction override: a Select whose first option is the project default. */
function OverrideSelect<T extends string>({ label, options, def, value, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  def: T;
  value: T | undefined;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Select size="xs" w="100%" allowDeselect={false}
        data={[{ value: '', label: `Default · ${labelOf(options, def)}` }, ...options]}
        value={value ?? ''}
        onChange={(v) => onChange((v || undefined) as T | undefined)} />
    </label>
  );
}

/**
 * Shown when several sections are selected at once: a count, the bulk commands
 * that apply (Axis 6 — same set as the elevation's floating toolbar, surfaced
 * here too for discoverability + phones), and a clear-selection action. New
 * selection-command plugins appear here automatically.
 */
function MultiInspector({ ids }: { ids: string[] }) {
  const project = useStore((s) => s.project);
  const selectedWallId = useStore((s) => s.ui.selectedWallId);
  const runSelectionCommand = useStore((s) => s.runSelectionCommand);
  const select = useStore((s) => s.select);
  const wall = activeWall(project, selectedWallId);
  const elements = (wall?.elements ?? []).filter((e) => ids.includes(e.id)).sort((a, b) => a.xIn - b.xIn);
  const cmds = wall
    ? listSelectionCommands().filter(
        (c) => elements.length >= (c.minElements ?? 2) && (!c.enabledFor || c.enabledFor({ elements, wall, project, defaults: project.defaults })),
      )
    : [];
  return (
    <div className="inspector">
      <section className="insp-section">
        <div className="insp-head"><h3>{elements.length} sections</h3></div>
        <Text c="dark.1" fz="xs">Ctrl/Cmd or Shift-click sections in the elevation to add or remove them. Arrow keys nudge the whole set; Delete removes them.</Text>
        {cmds.length > 0 ? (
          <Stack gap={6} mt={8}>
            {cmds.map((c) => (
              <Button key={c.id} variant="default" size="xs" fullWidth title={c.description}
                onClick={() => { runSelectionCommand(c.id); select(undefined); }}>{c.label}</Button>
            ))}
          </Stack>
        ) : (
          <Text c="dark.1" fz="xs">No bulk actions apply to this selection.</Text>
        )}
      </section>
      <section className="insp-section">
        <Button variant="subtle" size="xs" color="gray" onClick={() => select(undefined)}>Clear selection</Button>
      </section>
    </div>
  );
}

/** Shown when a wall (but no section) is selected: wall size/colour + a link to
 *  the Room's project-wide settings. */
function WallProps() {
  const project = useStore((s) => s.project);
  const selectedWallId = useStore((s) => s.ui.selectedWallId);
  const updateProject = useStore((s) => s.updateProject);
  const removeWall = useStore((s) => s.removeWall);
  const selectRoom = useStore((s) => s.selectRoom);
  const walls = allWalls(project);
  const wall = activeWall(project, selectedWallId);
  const setWall = (patch: Partial<NonNullable<typeof wall>>) =>
    updateProject((p) => { const w = activeWall(p, selectedWallId); if (w) Object.assign(w, patch); });
  if (!wall) return <div className="inspector empty">No wall.</div>;

  return (
    <div className="inspector">
      <section className="insp-section">
        <div className="insp-head">
          <h3>Wall</h3>
          {walls.length > 1 && <ConfirmDelete icon title="Delete wall" message="Delete this wall and its cabinets?" onConfirm={() => removeWall(wall.id)} />}
        </div>
        <label className="field"><span>Length</span><InchInput value={wall.lengthIn} min={12} w="100%" onCommit={(v) => setWall({ lengthIn: v })} /></label>
        <label className="field"><span>Ceiling</span><InchInput value={wall.ceilingHeightIn} min={48} w="100%" onCommit={(v) => setWall({ ceilingHeightIn: v })} /></label>
        <label className="field"><span>Wall colour</span>
          <ColorInput size="xs" w="100%" format="hex" value={wall.color ?? '#101214'} placeholder="#101214"
            swatches={['#101214', '#1d2733', '#26201a', '#22262b', '#2a2330', '#e8e6e1']}
            onChange={(v) => setWall({ color: v || undefined })} aria-label="Wall colour" />
        </label>
      </section>

      <section className="insp-section">
        {/* Project-wide heights/depths/construction live on the Room — reachable
            from the tree, or here (the path that works on phones with no tree). */}
        <Button variant="default" size="xs" fullWidth onClick={() => selectRoom()}>Project settings…</Button>
        <Text c="dark.1" fz="xs" mt={8}>Counter heights, depths and construction defaults live in Project settings. Select a section to edit it, or click an empty band in the elevation to add one.</Text>
      </section>
    </div>
  );
}
