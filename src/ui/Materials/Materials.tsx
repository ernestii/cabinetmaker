import { useState } from 'react';
import { ActionIcon, Badge, Button, Group, Menu, NumberInput, Popover, Switch, Text, Tooltip } from '@mantine/core';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useStore, genId } from '../../state/store';
import { defaultPricing } from '../../domain/seed';
import { materialFromProduct, type CatalogProduct } from '../../domain/catalog';
import { toFraction } from '../../domain/format';
import type { Material, MaterialRole, Pricing } from '../../domain/types';
import { ConfirmDelete } from '../components/ConfirmDelete';
import { PageToc } from '../components/PageToc';
import { PageHeader } from '../components/PageHeader';
import { CatalogPicker } from './CatalogPicker';
import { MaterialDrawer } from './MaterialDrawer';
import { ROLE_META, SHEET_ROLES } from './meta';

/** Rows of the hardware & labour price table (all fields of `Pricing`). */
const PRICE_ROWS: { key: keyof Pricing; label: string; unit: string; detail?: string }[] = [
  { key: 'hingeEach', label: 'Hinge', unit: 'each', detail: 'Concealed euro hinge' },
  { key: 'slidePairEach', label: 'Drawer slides', unit: 'pair', detail: 'One pair per drawer' },
  { key: 'pullEach', label: 'Pull / knob', unit: 'each' },
  { key: 'pushLatchEach', label: 'Push latch', unit: 'each', detail: 'Push-to-open / touch latch' },
  { key: 'legEach', label: 'Workbench leg', unit: 'each', detail: 'Adjustable bench leg (workbench runs)' },
  { key: 'edgeBandingPer100Ft', label: 'Edge banding', unit: 'per 100 ft', detail: 'Sold by the roll' },
  { key: 'laborPerHour', label: 'Shop labour', unit: 'per hour', detail: '$0 shows build time without a cost' },
];

export function Materials() {
  const project = useStore((s) => s.project);
  const updateProject = useStore((s) => s.updateProject);
  const pricing = project.pricing ?? defaultPricing();
  const [picker, setPicker] = useState<'sheet' | 'countertop' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<keyof Pricing | null>(null);
  const counterOn = project.defaults.countertopEnabled !== false;

  const setMat = (id: string, patch: Partial<Material>) =>
    updateProject((p) => { const m = p.materials.find((x) => x.id === id); if (m) Object.assign(m, patch); });
  const toggleRole = (id: string, role: MaterialRole) =>
    updateProject((p) => {
      const m = p.materials.find((x) => x.id === id); if (!m) return;
      m.roles = m.roles.includes(role) ? m.roles.filter((r) => r !== role) : [...m.roles, role];
    });
  const addCustom = (variant: 'sheet' | 'countertop') => {
    const id = genId('mat');
    updateProject((p) => {
      p.materials.push(variant === 'sheet'
        ? { id, name: 'Custom sheet stock', thicknessIn: 0.75, color: '#cccccc', grained: true, roles: [], sheetW: 48, sheetH: 96, kerfIn: 0.125, edgeTrimIn: 0.25, pricePerSheet: 0 }
        : { id, name: 'Custom countertop', thicknessIn: 1.5, color: '#946a34', textureUrl: 'butcher', grained: true, roles: ['counter'], sheetW: 25, sheetH: 96, kerfIn: 0, edgeTrimIn: 0, pricePerSheet: 0 });
    });
    setEditingId(id); // straight into the drawer to name + price it
  };
  const addFromCatalog = (prod: CatalogProduct) =>
    updateProject((p) => { p.materials.push(materialFromProduct(prod, genId('mat'))); });
  const removeMaterial = (id: string) => {
    if (editingId === id) setEditingId(null);
    updateProject((p) => { p.materials = p.materials.filter((m) => m.id !== id); });
  };
  const setPricing = (patch: Partial<typeof pricing>) =>
    updateProject((p) => { p.pricing = { ...(p.pricing ?? defaultPricing()), ...patch }; });
  const setCounterEnabled = (on: boolean) =>
    updateProject((p) => { p.defaults.countertopEnabled = on; });

  const sheetMats = project.materials.filter((m) => !m.roles.includes('counter'));
  const counterMats = project.materials.filter((m) => m.roles.includes('counter'));
  const editing = project.materials.find((m) => m.id === editingId) ?? null;

  return (
    <div className="materials pad">
      <PageHeader title="Materials" subtitle="Stock sheets, pricing and edge banding — edits here flow into the cut list and shopping list" />

      <div className="report-layout">
      <PageToc selector=".materials-main h2" dataKey={project.materials} />
      <div className="materials-main">
      <RoleCoverage sheetMats={sheetMats} toggleRole={toggleRole} onOpenCatalog={() => setPicker('sheet')} />

      {/* ---- Sheet goods ---- */}
      <SectionHead title="Sheet goods">
        <AddMenu onCatalog={() => setPicker('sheet')} onCustom={() => addCustom('sheet')} customLabel="Custom sheet stock" />
      </SectionHead>
      {sheetMats.length > 0 ? (
        <MaterialTable mats={sheetMats} variant="sheet" onEdit={setEditingId} onRemove={removeMaterial} />
      ) : (
        <Text c="dark.1" fz="xs" my="sm">No sheet goods yet — add one from the catalog.</Text>
      )}

      {/* ---- Countertops ---- */}
      <SectionHead
        title="Countertops"
        hint={counterOn
          ? 'Counters are built over your base runs and cut to length from slabs — shown on the Cut List and Shopping list.'
          : 'Countertops are turned off — no slab is built, priced, or listed. Turn the switch on to include one.'}
      >
        <Switch size="sm" checked={counterOn} onChange={(e) => setCounterEnabled(e.currentTarget.checked)}
          label={counterOn ? 'Included' : 'Off'} />
        <AddMenu onCatalog={() => setPicker('countertop')} onCustom={() => addCustom('countertop')} customLabel="Custom countertop" />
      </SectionHead>
      <div className={counterOn ? undefined : 'mat-off'}>
        {counterMats.length > 0 ? (
          <MaterialTable mats={counterMats} variant="counter" onEdit={setEditingId} onRemove={removeMaterial} />
        ) : (
          <Text c="dark.1" fz="xs" my="sm">No countertop chosen — add one from the catalog (butcher block, laminate, slab…).</Text>
        )}
      </div>

      {/* ---- Hardware & labour ---- */}
      <SectionHead title="Hardware & labour pricing"
        hint="Per-piece prices that feed the cost estimate and shopping list. Click a row to change its price." />
      <table className="parts-table mat-table">
        <thead>
          <tr><th>Item</th><th className="num mat-col-price">Price</th><th className="mat-col-unit">Unit</th><th aria-label="Edit" /></tr>
        </thead>
        <tbody>
          {PRICE_ROWS.map((r) => (
            <tr key={r.key} onClick={() => setPriceEdit(priceEdit === r.key ? null : r.key)}>
              <td>
                <Text fz={13} fw={600} span>{r.label}</Text>
                {r.detail && <Text fz="xs" c="dimmed">{r.detail}</Text>}
              </td>
              <td className="mono num">${(pricing[r.key] ?? 0).toFixed(2)}</td>
              <td><Text fz="xs" c="dimmed" span>{r.unit}</Text></td>
              <td className="mat-actions">
                <Popover opened={priceEdit === r.key} onChange={(o) => setPriceEdit(o ? r.key : null)}
                  position="bottom-end" withArrow shadow="md" trapFocus>
                  <Popover.Target>
                    <ActionIcon variant="subtle" color="gray" size="md" title="Edit price" aria-label={`Edit ${r.label} price`}
                      onClick={(e) => { e.stopPropagation(); setPriceEdit(priceEdit === r.key ? null : r.key); }}>
                      <IconPencil size={15} />
                    </ActionIcon>
                  </Popover.Target>
                  <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
                    <Group gap={8} wrap="nowrap">
                      <NumberInput size="xs" w={110} min={0} prefix="$" decimalScale={2} data-autofocus
                        value={pricing[r.key] ?? 0}
                        onChange={(v) => setPricing({ [r.key]: Number(v) || 0 })}
                        onKeyDown={(e) => { if (e.key === 'Enter') setPriceEdit(null); }} />
                      <Text fz="xs" c="dimmed">{r.unit}</Text>
                    </Group>
                  </Popover.Dropdown>
                </Popover>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </div>

      <CatalogPicker opened={picker != null} category={picker ?? undefined} onClose={() => setPicker(null)} onAdd={addFromCatalog} />
      <MaterialDrawer material={editing} onClose={() => setEditingId(null)} setMat={setMat} toggleRole={toggleRole} />
    </div>
  );
}

/** A material-section header: small-caps title on the left, actions on the right,
 *  optional hint underneath — all above the hairline rule, so the rule reads as
 *  the boundary between header and content. */
function SectionHead({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="mat-section-head">
      <Group justify="space-between">
        {/* A real h2 so the page ToC's scrollspy picks the section up. */}
        <Text component="h2" m={0} fw={700} fz="13px" tt="uppercase" style={{ letterSpacing: '0.05em', scrollMarginTop: 10 }}>{title}</Text>
        <Group gap="md">{children}</Group>
      </Group>
      {hint && <Text c="dark.1" fz="xs" mt={6}>{hint}</Text>}
    </div>
  );
}

/** "+ Add" button: pick a priced catalog product or start a custom material. */
function AddMenu({ onCatalog, onCustom, customLabel }: { onCatalog: () => void; onCustom: () => void; customLabel: string }) {
  return (
    <Menu shadow="md" position="bottom-end" withinPortal>
      <Menu.Target>
        <Button variant="default" size="xs" leftSection={<IconPlus size={13} />}>Add</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={onCatalog}>From catalog…</Menu.Item>
        <Menu.Item onClick={onCustom}>{customLabel}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** Which sheet stock each job resolves to (first material claiming the role wins).
 *  Uncovered jobs get a warning cell with a one-click assign menu. */
function RoleCoverage({ sheetMats, toggleRole, onOpenCatalog }: {
  sheetMats: Material[];
  toggleRole: (id: string, role: MaterialRole) => void;
  onOpenCatalog: () => void;
}) {
  return (
    <div className="role-strip">
      {SHEET_ROLES.map((role) => {
        const mat = sheetMats.find((m) => m.roles.includes(role));
        return (
          <div key={role} className={`role-cell${mat ? '' : ' role-cell-missing'}`}>
            <Tooltip label={ROLE_META[role].hint} withArrow position="top" openDelay={300}>
              <Text fz="10px" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.05em' }}>
                {ROLE_META[role].label}
              </Text>
            </Tooltip>
            {mat ? (
              <Group gap={6} mt={4} wrap="nowrap">
                <span className="mat-swatch mat-swatch-sm" style={{ background: mat.color }} aria-hidden />
                <Text fz="xs" truncate>{mat.name}</Text>
              </Group>
            ) : (
              <Menu shadow="md" position="bottom-start" withinPortal>
                <Menu.Target>
                  <Button variant="light" color="yellow" size="compact-xs" mt={4}>None — assign…</Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {sheetMats.length > 0 && <Menu.Label>Use existing stock</Menu.Label>}
                  {sheetMats.map((m) => (
                    <Menu.Item key={m.id} onClick={() => toggleRole(m.id, role)}
                      leftSection={<span className="mat-swatch mat-swatch-sm" style={{ background: m.color }} aria-hidden />}>
                      {m.name}
                    </Menu.Item>
                  ))}
                  {sheetMats.length > 0 && <Menu.Divider />}
                  <Menu.Item onClick={onOpenCatalog}>Add from catalog…</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Static material list; every property is edited in the drawer (row click or ✎). */
function MaterialTable({ mats, variant, onEdit, onRemove }: {
  mats: Material[];
  variant: 'sheet' | 'counter';
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const isCounter = variant === 'counter';
  return (
    <table className="parts-table mat-table">
      <thead>
        <tr>
          <th aria-label="Colour" />
          <th>Material</th>
          <th className="mat-col-dim">Thickness</th>
          <th className="mat-col-dim">{isCounter ? 'Slab (D × L)' : 'Sheet (W × L)'}</th>
          <th className="num mat-col-price">{isCounter ? 'Price / slab' : 'Price / sheet'}</th>
          {!isCounter && <th className="mat-col-roles">Used for</th>}
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {mats.map((m) => (
          <tr key={m.id} onClick={() => onEdit(m.id)}>
            <td width={30}><span className="mat-swatch" style={{ background: m.color }} aria-hidden /></td>
            <td>
              <Text fz={13} fw={600} span>{m.name}</Text>
              <Text fz="xs" c="dimmed">{m.productId ? 'Catalog stock' : 'Custom'}</Text>
            </td>
            <td className="mono">{toFraction(m.thicknessIn)}</td>
            <td className="mono">{m.sheetW} × {m.sheetH}"</td>
            <td className="mono num">${(m.pricePerSheet ?? 0).toFixed(2)}</td>
            {!isCounter && (
              <td>
                {m.roles.length > 0 ? (
                  <Group gap={4}>
                    {m.roles.map((r) => (
                      <Tooltip key={r} label={ROLE_META[r].hint} withArrow position="top" openDelay={300}>
                        <Badge size="xs" variant="light" color="gray">{ROLE_META[r].short}</Badge>
                      </Tooltip>
                    ))}
                  </Group>
                ) : (
                  <Badge size="xs" variant="light" color="yellow">No jobs yet</Badge>
                )}
              </td>
            )}
            <td className="mat-actions">
              <ActionIcon variant="subtle" color="gray" size="md" title="Edit" aria-label={`Edit ${m.name}`}
                onClick={(e) => { e.stopPropagation(); onEdit(m.id); }}>
                <IconPencil size={15} />
              </ActionIcon>
              <ConfirmDelete icon title="Delete material" message={`Delete "${m.name}"?`} onConfirm={() => onRemove(m.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
