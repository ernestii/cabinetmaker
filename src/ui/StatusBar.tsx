import { forwardRef, useMemo } from 'react';
import { Box, Button, HoverCard, List, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconClock, IconCubeUnfolded } from '@tabler/icons-react';
import { useStore } from '../state/store';
import { Dock } from './Dock';
import { buildCost } from '../domain/cutlist/cost';
import { buildLabor } from '../domain/cutlist/labor';
import { auditProject } from '../domain/geometry/audit';
import { validateProject } from '../domain/validate';
import { defaultPricing } from '../domain/seed';
import { feetInches, money } from '../domain/format';

/** Compact money for the status pill: $3,712 → "$3.7K", $950 → "$950". */
function moneyCompact(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`;
}

/** Calendar duration for a labour total at a given pace (hours/day). */
function paceDays(totalHours: number, hoursPerDay: number): string {
  const days = Math.max(1, Math.ceil(totalHours / hoursPerDay));
  if (days <= 6) return `${days} day${days === 1 ? '' : 's'}`;
  const weeks = days / 5; // 5 working days a week
  return `~${weeks < 2 ? weeks.toFixed(1) : Math.round(weeks)} week${Math.round(weeks) === 1 ? '' : 's'}`;
}

/**
 * Bottom chrome: ONE floating glassy bar pinned bottom-centre on desktop — the
 * view dock, then a hairline, then the build issues + geometry audit + time +
 * cost readouts. A single pill means the dock and the status segments can
 * never collide at narrow window widths (they used to float separately and
 * overlap). On phones it's an in-flow strip above the tab bar. Each status
 * segment expands a detail popover on hover; an all-clear issue state shows
 * nothing at all.
 */
export function StatusBar() {
  const project = useStore((s) => s.project);
  const view = useStore((s) => s.ui.view);

  const cost = useMemo(() => { try { return buildCost(project); } catch { return null; } }, [project]);
  const labor = useMemo(() => { try { return buildLabor(project); } catch { return null; } }, [project]);
  const warnings = useMemo(() => { try { return validateProject(project); } catch { return []; } }, [project]);
  const audit = useMemo(() => { try { return auditProject(project); } catch { return null; } }, [project]);
  const pricing = project.pricing ?? defaultPricing();

  // Cost breakdown rows (mirrors the old cost pill).
  const rows: { label: string; detail: string; cost: number }[] = [];
  if (cost) {
    for (const m of cost.materials) if (m.cost > 0) rows.push({ label: m.name, detail: `${m.sheets} sheet${m.sheets === 1 ? '' : 's'} × ${money(m.pricePerSheet)}`, cost: m.cost });
    if (cost.counter.slabs > 0) rows.push({ label: cost.counter.name, detail: `${cost.counter.slabs} slab${cost.counter.slabs === 1 ? '' : 's'} × ${money(cost.counter.pricePerSlab)}`, cost: cost.counter.cost });
    if (cost.bandingCost > 0) rows.push({ label: 'Edge banding', detail: `${feetInches(cost.bandingFeet * 12)} × ${money(pricing.edgeBandingPer100Ft)}/100'`, cost: cost.bandingCost });
    if (cost.hardware.hinges > 0) rows.push({ label: 'Hinges', detail: `${cost.hardware.hinges} × ${money(pricing.hingeEach)}`, cost: cost.hardware.hinges * pricing.hingeEach });
    if (cost.hardware.slidePairs > 0) rows.push({ label: 'Drawer slides', detail: `${cost.hardware.slidePairs} pair × ${money(pricing.slidePairEach)}`, cost: cost.hardware.slidePairs * pricing.slidePairEach });
    if (cost.hardware.pulls > 0) rows.push({ label: 'Pulls / knobs', detail: `${cost.hardware.pulls} × ${money(pricing.pullEach)}`, cost: cost.hardware.pulls * pricing.pullEach });
    if (cost.hardware.pushLatches > 0) rows.push({ label: 'Push latches', detail: `${cost.hardware.pushLatches} × ${money(pricing.pushLatchEach ?? 0)}`, cost: cost.hardware.pushLatches * (pricing.pushLatchEach ?? 0) });
  }

  // Geometry audit stays silent when clean — it only surfaces on real issues.
  const auditIssues = (view === 'cutlist' || view === 'assembly') && audit && audit.cabinets > 0 ? audit.issues.length : 0;
  // Build time + cost collapse into a single pill: "42h · $3.7K".
  const buildHours = labor && labor.totalHours > 0 ? `${Math.round(labor.totalHours)}h` : null;
  const buildCostStr = cost && cost.total > 0 ? moneyCompact(cost.total) : null;
  const buildSummary = [buildHours, buildCostStr].filter(Boolean).join(' · ');
  const hasAny = warnings.length > 0 || auditIssues > 0 || buildSummary !== '';

  return (
    <footer role="status" className="status-bar">
      {/* Desktop view dock — the centre pill (hidden on phones). */}
      <Dock />

      {hasAny && (
      <>
      {/* Hairline between the dock chips and the status readouts (desktop only —
          on phones the dock is hidden and the strip holds just the readouts). */}
      <Box component="span" className="dock-sep" visibleFrom="sm" aria-hidden />
      <div className="status-cluster status-right">
      {/* Build issues — only when there are some; all-clear is silence. */}
      {warnings.length > 0 && (
        <HoverCard width="auto" shadow="md" radius="xl" position="top" withArrow openDelay={80} closeDelay={80}>
          <HoverCard.Target>
            <Seg color="brand" icon={<IconAlertTriangle size={14} />}>
              {warnings.length} build issue{warnings.length > 1 ? 's' : ''}
            </Seg>
          </HoverCard.Target>
          <HoverCard.Dropdown maw={460}>
            <List size="sm">
              {warnings.slice(0, 10).map((w, i) => <List.Item key={i}>{w.message}</List.Item>)}
              {warnings.length > 10 && <List.Item>…and {warnings.length - 10} more.</List.Item>}
            </List>
          </HoverCard.Dropdown>
        </HoverCard>
      )}

      {/* Geometry audit (cut-list / assembly only) — shown only when it finds issues. */}
      {auditIssues > 0 && (
        <HoverCard width="auto" shadow="md" radius="xl" position="top" withArrow openDelay={80} closeDelay={80}>
          <HoverCard.Target>
            <Seg color="brand" icon={<IconCubeUnfolded size={14} />}>Geometry · {auditIssues}</Seg>
          </HoverCard.Target>
          <HoverCard.Dropdown maw={460}>
            <Stack gap={4}>
              <Text fw={700}>Geometry audit found {auditIssues} issue{auditIssues === 1 ? '' : 's'}</Text>
              <List size="sm" c="danger.4">{audit!.issues.slice(0, 8).map((m, i) => <List.Item key={i}>{m}</List.Item>)}</List>
              {auditIssues > 8 && <Text c="dimmed" fz="sm">…and {auditIssues - 8} more.</Text>}
            </Stack>
          </HoverCard.Dropdown>
        </HoverCard>
      )}

      {/* Build estimate: time + cost in one pill ("42h • $3.7K"), full breakdowns
          on hover. The card drops the dropdown padding and lays the two ledgers
          flush, split by a hairline; each section header carries its own total so
          the tables stay pure breakdown. */}
      {buildSummary && (
        <HoverCard width="auto" shadow="md" radius="xl" position="top-end" withArrow openDelay={80} closeDelay={80}>
          <HoverCard.Target>
            <Seg color="gray" numeric icon={<IconClock size={14} />} className="est-seg">
              <span className="est-seg-label">
                {buildHours && <span>{buildHours}</span>}
                {buildHours && buildCostStr && <span className="est-dot" aria-hidden />}
                {buildCostStr && <span>{buildCostStr}</span>}
              </span>
            </Seg>
          </HoverCard.Target>
          {/* overflow:hidden keeps the flush sections inside the rounded corners
              (radius="xl" on the HoverCards = 8px, matching the floating bar). */}
          <HoverCard.Dropdown p={0} maw={480} style={{ overflow: 'hidden' }}>
            {labor && labor.totalHours > 0 && (
              <section className="est-section">
                <header className="est-head">
                  <span className="est-head-label">Build time</span>
                  <span className="est-head-total">{labor.totalHours.toFixed(1)}h</span>
                </header>
                <table className="est-table">
                  <tbody>
                    {labor.items.map((it, i) => (
                      <tr key={i}><td>{it.label}</td><td className="est-detail">{it.count} × {it.hoursEach}h</td><td className="est-amt">{it.hours.toFixed(1)}h</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="est-paces">
                  {([['After work', 2], ['Weekends', 6], ['Full time', 8]] as const).map(([label, perDay]) => (
                    <div key={label} className="est-pace">
                      <span className="est-pace-val">{paceDays(labor.totalHours, perDay)}</span>
                      <span className="est-pace-label">{label} · {perDay} h/day</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {cost && cost.total > 0 && (
              <section className="est-section">
                <header className="est-head">
                  <span className="est-head-label">Materials &amp; hardware</span>
                  <span className="est-head-total">{money(cost.total)}</span>
                </header>
                <table className="est-table">
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}><td>{r.label}</td><td className="est-detail">{r.detail}</td><td className="est-amt">{money(r.cost)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </HoverCard.Dropdown>
        </HoverCard>
      )}
      </div>
      </>
      )}
    </footer>
  );
}

/** A status-bar segment: a flat subtle button (the HoverCard trigger). `numeric`
 *  turns on tabular figures for the cost/time readouts. Forwards the ref + rest
 *  props because HoverCard.Target attaches its hover handlers by cloning this
 *  element — swallow them and the popovers never open. */
const Seg = forwardRef<HTMLButtonElement, {
  color: string; icon: React.ReactNode; numeric?: boolean; children: React.ReactNode;
} & React.ComponentPropsWithoutRef<'button'>>(function Seg({ color, icon, numeric, children, style, ...rest }, ref) {
  return (
    <Button ref={ref} variant="subtle" color={color} size="compact-xs" leftSection={icon}
      style={numeric ? { fontVariantNumeric: 'tabular-nums', ...style } : style} {...rest}>
      {children}
    </Button>
  );
});
