import type { PackedSheet, Placement } from '../../domain/cutlist/nesting';
import { toFraction } from '../../domain/format';

/* All coordinates are sheet inches (the SVG viewBox is the sheet itself).
   The left margin hosts the row-height dimension chain and rip badges. */
const ML = 6.5; // left margin
const MT = 1.5;
const MR = 1.5;
const MB = 1.5;
const DIM_FS = 1.7; // dimension text size
const ARROW_L = 1.0;
const ARROW_W = 0.38;

function Arrowhead({ x, y, dir }: { x: number; y: number; dir: 'left' | 'right' | 'up' | 'down' }) {
  const pts = {
    left: `${x},${y} ${x + ARROW_L},${y - ARROW_W} ${x + ARROW_L},${y + ARROW_W}`,
    right: `${x},${y} ${x - ARROW_L},${y - ARROW_W} ${x - ARROW_L},${y + ARROW_W}`,
    up: `${x},${y} ${x - ARROW_W},${y + ARROW_L} ${x + ARROW_W},${y + ARROW_L}`,
    down: `${x},${y} ${x - ARROW_W},${y - ARROW_L} ${x + ARROW_W},${y - ARROW_L}`,
  }[dir];
  return <polygon points={pts} className="sheet-dim-arrow" />;
}

/**
 * Engineering-style dimension line between two points on one axis: a line with
 * outward arrowheads at both ends and a fraction label, so a measurement always
 * shows *which* edge it spans. Arrowheads are explicit polygons (not <marker>
 * defs) so many diagrams on one page can't collide on marker ids.
 */
function Dim({ a, b, at, vertical = false, fs = DIM_FS }: {
  a: number; b: number; at: number; vertical?: boolean; fs?: number;
}) {
  const len = b - a;
  const mid = (a + b) / 2;
  const size = Math.min(fs, Math.max(0.9, len * 0.32));
  const arrows = len > 3;
  if (vertical) {
    return (
      <g>
        <line x1={at} y1={a} x2={at} y2={b} className="sheet-dim-line" />
        {arrows && <Arrowhead x={at} y={a} dir="up" />}
        {arrows && <Arrowhead x={at} y={b} dir="down" />}
        <text x={at - 0.5} y={mid} className="sheet-dim-text" textAnchor="middle"
          transform={`rotate(-90, ${at - 0.5}, ${mid})`} style={{ fontSize: size }}>{toFraction(len)}</text>
      </g>
    );
  }
  return (
    <g>
      <line x1={a} y1={at} x2={b} y2={at} className="sheet-dim-line" />
      {arrows && <Arrowhead x={a} y={at} dir="left" />}
      {arrows && <Arrowhead x={b} y={at} dir="right" />}
      <text x={mid} y={at - 0.45} className="sheet-dim-text" textAnchor="middle" style={{ fontSize: size }}>{toFraction(len)}</text>
    </g>
  );
}

/** Numbered badge tying a cut line on the diagram to the written cut sequence. */
function CutBadge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g className="sheet-cut-badge">
      <circle cx={x} cy={y} r={1.25} />
      <text x={x} y={y + 0.06} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: n >= 10 ? 1.15 : 1.4 }}>{n}</text>
    </g>
  );
}

export type PartHover = (partId: string | null, anchor?: { x: number; y: number }) => void;

/**
 * A placed part. Big parts get true dimension lines along their top and left
 * edges; small ones fall back to a centred label with explicit axis arrows
 * (↔ width, ↕ height) so orientation is never ambiguous. Hovering it reports
 * the part id + an anchor point for the 3D where-does-this-go preview.
 */
function PartRect({ p, onHover }: { p: Placement; onHover?: PartHover }) {
  const big = p.w >= 12 && p.h >= 7;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return (
    <g
      onPointerEnter={onHover ? (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onHover(p.partId, { x: r.right, y: r.top + r.height / 2 });
      } : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
    >
      <rect x={p.x} y={p.y} width={p.w} height={p.h} className="placed" />
      {big ? (
        <>
          {/* Dimension lines span the part's true edges — the label IS the saw measurement. */}
          <Dim a={p.x} b={p.x + p.w} at={p.y + 1.9} />
          <Dim vertical a={p.y} b={p.y + p.h} at={p.x + 1.9} />
          <text x={cx + 0.8} y={cy + 0.9} className="placed-id" textAnchor="middle"
            dominantBaseline="middle" style={{ fontSize: Math.min(2.2, p.w * 0.06 + 1.2) }}>{p.partId}</text>
        </>
      ) : (
        <CompactLabel p={p} />
      )}
      {p.rotated && (
        <text x={p.x + p.w - 0.6} y={p.y + 2.4} className="placed-rot" textAnchor="end">
          ↻
          <title>Rotated 90° from its listed W×L to nest tighter (grain allows it).</title>
        </text>
      )}
    </g>
  );
}

/** Fit "id / ↔ w / ↕ h" lines inside a small rect, shrinking and dropping the id when cramped. */
function CompactLabel({ p }: { p: Placement }) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const wText = `↔ ${toFraction(p.w)}`;
  const hText = `↕ ${toFraction(p.h)}`;
  const longest = Math.max(p.partId.length, wText.length, hText.length);
  let lines = [p.partId, wText, hText];
  let fs = Math.min(1.8, (p.w * 0.92) / (longest * 0.58), (p.h * 0.9) / (lines.length * 1.25));
  if (fs < 1.0) {
    lines = [wText, hText];
    fs = Math.min(1.7, (p.w * 0.92) / (Math.max(wText.length, hText.length) * 0.58), (p.h * 0.9) / (lines.length * 1.25));
  }
  fs = Math.max(fs, 0.55);
  const lh = fs * 1.25;
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  return (
    <g>
      {lines.map((t, i) => (
        <text key={i} x={cx} y={y0 + i * lh} className={i === 0 && lines.length === 3 ? 'placed-id' : 'placed-dim'}
          textAnchor="middle" dominantBaseline="middle" style={{ fontSize: i === 0 && lines.length === 3 ? fs : fs * 0.95 }}>{t}</text>
      ))}
    </g>
  );
}

export function SheetDiagram({ sheet, sheetW, sheetH, kerfIn = 0, trimIn = 0, onPartHover }: {
  sheet: PackedSheet; sheetW: number; sheetH: number;
  /** Saw kerf — the blade path is drawn at least this wide. */
  kerfIn?: number;
  /** Factory edge trim — drawn as a band around the usable area. */
  trimIn?: number;
  /** Hover reporting for the 3D part preview. */
  onPartHover?: PartHover;
}) {
  const guillotine = !!sheet.shelves?.length;
  // True kerf (1/8") and trim (1/4") are sub-pixel at this scale, so both are
  // drawn exaggerated to a visible minimum; every *measurement* stays true.
  const blade = Math.max(kerfIn, 0.55);
  const trim = trimIn > 0 ? Math.max(trimIn, 0.9) : 0;
  const ml = ML + trim;
  return (
    <div className="sheet-diagram">
      <svg viewBox={`${-ml} ${-(MT + trim)} ${sheetW + ml + MR + trim} ${sheetH + MT + MB + 2 * trim}`}
        className="sheet-svg" preserveAspectRatio="xMidYMid meet">
        {/* Factory edge trimmed off all four sides; parts nest in the area inside. */}
        {trim > 0 && (
          <rect x={-trim} y={-trim} width={sheetW + 2 * trim} height={sheetH + 2 * trim} className="sheet-trim" />
        )}
        <rect x={0} y={0} width={sheetW} height={sheetH} className="sheet-bg" />

        {sheet.placements.map((p, i) => <PartRect key={i} p={p} onHover={onPartHover} />)}

        {/* Row-height chain in the left margin: one chained dimension per strip,
            extension lines tying each strip boundary out to the chain. */}
        {guillotine && sheet.shelves!.map((sh) => (
          <g key={sh.index}>
            <line x1={-trim - 0.2} y1={sh.yIn} x2={-trim - 4.3} y2={sh.yIn} className="sheet-dim-ext" />
            <line x1={-trim - 0.2} y1={sh.yIn + sh.heightIn} x2={-trim - 4.3} y2={sh.yIn + sh.heightIn} className="sheet-dim-ext" />
            <Dim vertical a={sh.yIn} b={sh.yIn + sh.heightIn} at={-trim - 3.4} fs={1.5} />
          </g>
        ))}

        {/* Numbered blade paths, matching the written cut sequence one-to-one.
            Each is centred in the kerf gap the packer reserved past the part edge. */}
        {sheet.cuts?.map((c) => {
          const mid = c.posIn + kerfIn / 2;
          if (c.kind === 'rip') {
            return (
              <g key={c.order}>
                <line x1={0} y1={mid} x2={sheetW} y2={mid} className="sheet-cutline" style={{ strokeWidth: blade }} />
                <CutBadge x={-trim - 1.5} y={mid} n={c.order} />
              </g>
            );
          }
          if (c.kind === 'crosscut') {
            return (
              <g key={c.order}>
                <line x1={mid} y1={c.spanIn[0]} x2={mid} y2={c.spanIn[1]} className="sheet-cutline" style={{ strokeWidth: blade }} />
                <CutBadge x={mid} y={c.spanIn[0] + 1.6} n={c.order} />
              </g>
            );
          }
          return (
            <g key={c.order}>
              <line x1={c.spanIn[0]} y1={mid} x2={c.spanIn[1]} y2={mid} className="sheet-cutline sheet-cutline-trim" style={{ strokeWidth: blade }} />
              <CutBadge x={c.spanIn[0] + 1.6} y={mid} n={c.order} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
