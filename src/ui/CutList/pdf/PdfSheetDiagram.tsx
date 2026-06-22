import { Svg, G, Rect, Line, Polygon, Circle, Text } from '@react-pdf/renderer';
import type { PackedSheet, Placement } from '../../../domain/cutlist/nesting';
import { toFraction } from '../../../domain/format';
import { C } from './styles';

/* react-pdf port of ui/CutList/SheetDiagram.tsx. Same inch-space viewBox and the
   same geometry; only the rendering primitives differ (no CSS classes, so the
   stroke/fill that lived in styles.css are passed as props here). The on-screen
   diagram's hover/3D preview is screen-only and intentionally absent. */
const ML = 6.5; // left margin (row-height chain + rip badges)
const MT = 1.5;
const MR = 1.5;
const MB = 1.5;
const DIM_FS = 1.7;
const ARROW_L = 1.0;
const ARROW_W = 0.38;

// react-pdf SVG <Text> has no dominantBaseline; nudge y to vertically centre.
const vmid = (y: number, fs: number) => y + fs * 0.35;

function Arrowhead({ x, y, dir }: { x: number; y: number; dir: 'left' | 'right' | 'up' | 'down' }) {
  const pts = {
    left: `${x},${y} ${x + ARROW_L},${y - ARROW_W} ${x + ARROW_L},${y + ARROW_W}`,
    right: `${x},${y} ${x - ARROW_L},${y - ARROW_W} ${x - ARROW_L},${y + ARROW_W}`,
    up: `${x},${y} ${x - ARROW_W},${y + ARROW_L} ${x + ARROW_W},${y + ARROW_L}`,
    down: `${x},${y} ${x - ARROW_W},${y - ARROW_L} ${x + ARROW_W},${y - ARROW_L}`,
  }[dir];
  return <Polygon points={pts} fill={C.dim} />;
}

/** Engineering dimension line with outward arrowheads and a fraction label. */
function Dim({ a, b, at, vertical = false, fs = DIM_FS }: {
  a: number; b: number; at: number; vertical?: boolean; fs?: number;
}) {
  const len = b - a;
  const mid = (a + b) / 2;
  const size = Math.min(fs, Math.max(0.9, len * 0.32));
  const arrows = len > 3;
  if (vertical) {
    return (
      <G>
        <Line x1={at} y1={a} x2={at} y2={b} stroke={C.dim} strokeWidth={0.14} />
        {arrows && <Arrowhead x={at} y={a} dir="up" />}
        {arrows && <Arrowhead x={at} y={b} dir="down" />}
        <Text x={at - 0.5} y={mid} fill={C.dimText} textAnchor="middle"
          transform={`rotate(-90, ${at - 0.5}, ${mid})`} style={{ fontFamily: 'Helvetica-Bold', fontSize: size }}>{toFraction(len)}</Text>
      </G>
    );
  }
  return (
    <G>
      <Line x1={a} y1={at} x2={b} y2={at} stroke={C.dim} strokeWidth={0.14} />
      {arrows && <Arrowhead x={a} y={at} dir="left" />}
      {arrows && <Arrowhead x={b} y={at} dir="right" />}
      <Text x={mid} y={at - 0.45} fill={C.dimText} textAnchor="middle"
        style={{ fontFamily: 'Helvetica-Bold', fontSize: size }}>{toFraction(len)}</Text>
    </G>
  );
}

/** Numbered badge tying a cut line to the written cut sequence. */
function CutBadge({ x, y, n }: { x: number; y: number; n: number }) {
  const fs = n >= 10 ? 1.15 : 1.4;
  return (
    <G>
      <Circle cx={x} cy={y} r={1.25} fill={C.cut} stroke={C.sheetBg} strokeWidth={0.14} />
      <Text x={x} y={vmid(y, fs)} fill="#fff" textAnchor="middle"
        style={{ fontFamily: 'Helvetica-Bold', fontSize: fs }}>{String(n)}</Text>
    </G>
  );
}

/** A placed part: big parts get true dimension lines; small ones a compact label. */
function PartRect({ p }: { p: Placement }) {
  const big = p.w >= 12 && p.h >= 7;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return (
    <G>
      <Rect x={p.x} y={p.y} width={p.w} height={p.h} fill={C.part} stroke={C.partStroke} strokeWidth={0.16} />
      {big ? (
        <G>
          <Dim a={p.x} b={p.x + p.w} at={p.y + 1.9} />
          <Dim vertical a={p.y} b={p.y + p.h} at={p.x + 1.9} />
          <Text x={cx + 0.8} y={vmid(cy, 2)} fill={C.ink} textAnchor="middle"
            style={{ fontFamily: 'Helvetica-Bold', fontSize: Math.min(2.2, p.w * 0.06 + 1.2) }}>{p.partId}</Text>
        </G>
      ) : (
        <CompactLabel p={p} />
      )}
      {p.rotated && (
        <Text x={p.x + p.w - 0.6} y={p.y + 2.4} fill={C.ink} textAnchor="end"
          style={{ fontFamily: 'Helvetica-Bold', fontSize: 1.6 }}>rot</Text>
      )}
    </G>
  );
}

/** Fit "id / W w / L h" lines inside a small rect, shrinking and dropping id when cramped. */
function CompactLabel({ p }: { p: Placement }) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const wText = `W ${toFraction(p.w)}`;
  const hText = `L ${toFraction(p.h)}`;
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
    <G>
      {lines.map((t, i) => {
        const isId = i === 0 && lines.length === 3;
        const size = isId ? fs : fs * 0.95;
        return (
          <Text key={i} x={cx} y={vmid(y0 + i * lh, size)} fill={isId ? C.ink : C.ink2}
            textAnchor="middle" style={{ fontFamily: 'Helvetica-Bold', fontSize: size }}>{t}</Text>
        );
      })}
    </G>
  );
}

/**
 * The nesting diagram for one sheet, sized to fit `maxW` × `maxH` points while
 * keeping the inch aspect ratio. Mirrors SheetDiagram one-to-one.
 */
export function PdfSheetDiagram({ sheet, sheetW, sheetH, kerfIn = 0, trimIn = 0, maxW, maxH }: {
  sheet: PackedSheet; sheetW: number; sheetH: number;
  kerfIn?: number; trimIn?: number; maxW: number; maxH: number;
}) {
  const guillotine = !!sheet.shelves?.length;
  const blade = Math.max(kerfIn, 0.55);
  const trim = trimIn > 0 ? Math.max(trimIn, 0.9) : 0;
  const ml = ML + trim;
  const vbW = sheetW + ml + MR + trim;
  const vbH = sheetH + MT + MB + 2 * trim;
  const scale = Math.min(maxW / vbW, maxH / vbH);

  return (
    <Svg
      width={vbW * scale}
      height={vbH * scale}
      viewBox={`${-ml} ${-(MT + trim)} ${vbW} ${vbH}`}
    >
      {trim > 0 && (
        <Rect x={-trim} y={-trim} width={sheetW + 2 * trim} height={sheetH + 2 * trim}
          fill={C.trim} stroke={C.line} strokeWidth={0.2} />
      )}
      <Rect x={0} y={0} width={sheetW} height={sheetH} fill={C.sheetBg} stroke={C.line} strokeWidth={0.2} />

      {sheet.placements.map((p, i) => <PartRect key={i} p={p} />)}

      {/* Row-height chain in the left margin (guillotine layouts only). */}
      {guillotine && sheet.shelves!.map((sh) => (
        <G key={sh.index}>
          <Line x1={-trim - 0.2} y1={sh.yIn} x2={-trim - 4.3} y2={sh.yIn} stroke={C.dim} strokeWidth={0.1} opacity={0.55} />
          <Line x1={-trim - 0.2} y1={sh.yIn + sh.heightIn} x2={-trim - 4.3} y2={sh.yIn + sh.heightIn} stroke={C.dim} strokeWidth={0.1} opacity={0.55} />
          <Dim vertical a={sh.yIn} b={sh.yIn + sh.heightIn} at={-trim - 3.4} fs={1.5} />
        </G>
      ))}

      {/* Numbered blade paths matching the written cut sequence one-to-one. */}
      {sheet.cuts?.map((c) => {
        const mid = c.posIn + kerfIn / 2;
        if (c.kind === 'rip') {
          return (
            <G key={c.order}>
              <Line x1={0} y1={mid} x2={sheetW} y2={mid} stroke={C.cut} strokeWidth={blade} strokeDasharray="2 1.1" opacity={0.85} />
              <CutBadge x={-trim - 1.5} y={mid} n={c.order} />
            </G>
          );
        }
        if (c.kind === 'crosscut') {
          return (
            <G key={c.order}>
              <Line x1={mid} y1={c.spanIn[0]} x2={mid} y2={c.spanIn[1]} stroke={C.cut} strokeWidth={blade} strokeDasharray="2 1.1" opacity={0.85} />
              <CutBadge x={mid} y={c.spanIn[0] + 1.6} n={c.order} />
            </G>
          );
        }
        return (
          <G key={c.order}>
            <Line x1={c.spanIn[0]} y1={mid} x2={c.spanIn[1]} y2={mid} stroke={C.cut} strokeWidth={blade} strokeDasharray="1 1" opacity={0.6} />
            <CutBadge x={c.spanIn[0] + 1.6} y={mid} n={c.order} />
          </G>
        );
      })}
    </Svg>
  );
}
