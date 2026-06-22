/**
 * Shared SVG primitives for assembly figures, matching the cut-list sheet
 * diagram's drawing language: dimension lines with outward arrowheads and
 * halo'd labels. Everything is drawn in the figure's inch coordinate space;
 * `fs` is the base font size in those units (the renderer derives it from the
 * viewBox so text stays a consistent on-screen size across figures).
 */

function Arrowhead({ x, y, dir, s }: { x: number; y: number; dir: 'left' | 'right' | 'up' | 'down'; s: number }) {
  const L = s;
  const W = s * 0.38;
  const pts = {
    left: `${x},${y} ${x + L},${y - W} ${x + L},${y + W}`,
    right: `${x},${y} ${x - L},${y - W} ${x - L},${y + W}`,
    up: `${x},${y} ${x - W},${y + L} ${x + W},${y + L}`,
    down: `${x},${y} ${x - W},${y - L} ${x + W},${y - L}`,
  }[dir];
  return <polygon points={pts} className="dim-arrow" />;
}

/** A dimension line (horizontal or vertical) with outward arrowheads, end ticks
 *  and a halo'd label stating the true measured span. */
export function DimLine({ from, to, text, small, below, fs }: {
  from: [number, number]; to: [number, number]; text: string; small?: boolean; below?: boolean; fs: number;
}) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const horizontal = Math.abs(y1 - y2) < 1e-6;
  const len = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
  const tick = fs * 0.5;
  const tfs = small ? fs * 0.78 : fs;
  const arrow = Math.min(fs * 0.7, len * 0.25);
  const arrows = len > fs * 1.6;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return (
    <g className="fig-dim" pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="dim-axis" />
      {horizontal ? (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} className="dim-axis" />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} className="dim-axis" />
          {arrows && <Arrowhead x={Math.min(x1, x2)} y={y1} dir="left" s={arrow} />}
          {arrows && <Arrowhead x={Math.max(x1, x2)} y={y2} dir="right" s={arrow} />}
          <text x={midX} y={below ? midY + fs : midY - fs * 0.5} textAnchor="middle" className="dim-axis-label" style={{ fontSize: tfs }}>{text}</text>
        </>
      ) : (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} className="dim-axis" />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} className="dim-axis" />
          {arrows && <Arrowhead x={x1} y={Math.min(y1, y2)} dir="up" s={arrow} />}
          {arrows && <Arrowhead x={x2} y={Math.max(y1, y2)} dir="down" s={arrow} />}
          <text x={midX - fs * 0.7} y={midY} textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(-90, ${midX - fs * 0.7}, ${midY})`} className="dim-axis-label" style={{ fontSize: tfs }}>{text}</text>
        </>
      )}
    </g>
  );
}

/** A numbered callout marker; its text lives in the HTML legend under the figure. */
export function CalloutMarker({ at, n, fs }: { at: [number, number]; n: number; fs: number }) {
  const r = fs * 0.62;
  return (
    <g className="fig-callout" pointerEvents="none">
      <circle cx={at[0]} cy={at[1]} r={r} />
      <text x={at[0]} y={at[1] + r * 0.06} textAnchor="middle" dominantBaseline="central" style={{ fontSize: fs * 0.72 }}>{n}</text>
    </g>
  );
}
