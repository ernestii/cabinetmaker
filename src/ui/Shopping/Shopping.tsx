import { useMemo } from 'react';
import { Checkbox, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { buildShoppingList } from '../../domain/shopping/buildShoppingList';
import { buildLabor } from '../../domain/cutlist/labor';
import { money } from '../../domain/format';
import { useStore } from '../../state/store';
import { PageToc } from '../components/PageToc';
import { PageHeader } from '../components/PageHeader';

const hrs = (n: number) => `${n.toFixed(1)} h`;

/**
 * A printable, check-off-as-you-go shopping list: everything the project needs
 * to buy, grouped by department with real products + ballpark prices. Drives off
 * the same cut list / cost engine as the Cut List tab.
 */
export function Shopping() {
  const project = useStore((s) => s.project);
  const list = useMemo(() => buildShoppingList(project), [project]);
  const labor = useMemo(() => buildLabor(project), [project]);
  // Check-off state is a shopping scratch pad — kept in localStorage so it
  // survives a reload, but separate from the saved project (it's not exported).
  const [checked, setChecked] = useLocalStorage<Record<string, boolean>>({
    key: 'cabinetmaker-shopping-checked',
    defaultValue: {},
  });
  const toggle = (key: string) => setChecked((c) => ({ ...c, [key]: !c[key] }));

  const itemCount = list.sections.reduce((s, sec) => s + sec.items.length, 0);

  return (
    <div className="shopping pad">
      <PageHeader
        title="Shopping list"
        subtitle={itemCount === 0
          ? 'Nothing to buy yet'
          : `${itemCount} items across ${list.sections.length} departments · ${money(list.total)} est. · check things off as you buy`}
        onPrint={itemCount > 0 ? () => window.print() : undefined}
      />

      {itemCount === 0 && <Text c="dark.1" fz="xs">Add some cabinets and the parts you need to buy will show up here.</Text>}

      <div className="report-layout">
      {itemCount > 0 && <PageToc selector=".shop-main h2" dataKey={list} />}
      <div className="shop-main">
      {list.sections.map((sec) => (
        <section key={sec.title} className="mat-group shop-section">
          <h2>{sec.title} — {money(sec.subtotal)}</h2>
          <table className="parts-table shop-table">
            <thead>
              <tr>
                <th aria-label="Bought" className="shop-check-col"></th>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th className="shop-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {sec.items.map((it) => (
                <tr key={it.key} className={checked[it.key] ? 'shop-bought' : undefined}>
                  <td className="shop-check-col">
                    <Checkbox size="xs" checked={!!checked[it.key]} onChange={() => toggle(it.key)} aria-label={`Bought ${it.name}`} />
                  </td>
                  <td>
                    <div className="shop-name">{it.name}</div>
                    <div className="shop-detail">{it.detail}</div>
                  </td>
                  <td className="shop-num">{it.qty}</td>
                  <td className="shop-unit">{it.unit} @ {money(it.unitPrice)}</td>
                  <td className="shop-num">{money(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {itemCount > 0 && labor.totalHours > 0 && (
        <section className="mat-group shop-section">
          <h2>Build time — {hrs(labor.totalHours)}{labor.cost > 0 ? ` · ${money(labor.cost)}` : ''}</h2>
          <table className="parts-table">
            <tbody>
              {labor.items.map((it) => (
                <tr key={it.label}>
                  <td>{it.label}</td>
                  <td>{it.count} × {it.hoursEach} h{labor.ratePerHour > 0 ? ` × ${money(labor.ratePerHour)}` : ''}</td>
                  <td className="shop-num">{hrs(it.hours)}{labor.ratePerHour > 0 ? ` · ${money(it.hours * labor.ratePerHour)}` : ''}</td>
                </tr>
              ))}
              <tr className="cost-total">
                <td><strong>Total</strong></td>
                <td></td>
                <td className="shop-num"><strong>{hrs(labor.totalHours)}{labor.cost > 0 ? ` · ${money(labor.cost)}` : ''}</strong></td>
              </tr>
            </tbody>
          </table>
          <Text c="dark.1" fz="xs">Ballpark shop hours{labor.ratePerHour > 0 ? ` at ${money(labor.ratePerHour)}/h` : ' — set a labour rate in Materials to price it'}.</Text>
        </section>
      )}

      {itemCount > 0 && (
        <section className="mat-group cost-summary">
          <table className="parts-table">
            <tbody>
              {list.sections.map((sec) => (
                <tr key={sec.title}><td>{sec.title}</td><td></td><td className="shop-num">{money(sec.subtotal)}</td></tr>
              ))}
              {labor.cost > 0 ? (
                <>
                  <tr><td>Labour</td><td></td><td className="shop-num">{money(labor.cost)}</td></tr>
                  <tr className="cost-total"><td><strong>Materials + labour</strong></td><td></td><td className="shop-num"><strong>{money(list.total + labor.cost)}</strong></td></tr>
                </>
              ) : (
                <tr className="cost-total"><td><strong>Estimated total</strong></td><td></td><td className="shop-num"><strong>{money(list.total)}</strong></td></tr>
              )}
            </tbody>
          </table>
          <Text c="dark.1" fz="xs">
            Prices are ballpark planning estimates and move with the market — confirm with your supplier.
            Products are generic material types (no brand affiliation). Tune any price on the Materials tab.
          </Text>
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
