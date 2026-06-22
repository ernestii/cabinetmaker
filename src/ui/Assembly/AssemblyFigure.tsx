import type { AssemblyFigure as Figure } from '../../domain/assembly/figures';
import { CalloutMarker, DimLine } from './svg/dims';
import { fitLabel } from './svg/fit';

/**
 * Renders one dimensioned assembly figure. Pure presentation: it maps the
 * figure's inch-space primitives onto an SVG and does no geometry of its own.
 * `fs` (font size in inches) scales with the viewBox so labels read at a
 * consistent on-screen size regardless of the cabinet's size.
 *
 * Long annotations are numbered callout markers on the drawing with the full
 * text in an HTML legend below — SVG text never has to fit, so it can never
 * overflow or collide.
 */
export function AssemblyFigure({ fig }: { fig: Figure }) {
  const { view } = fig;
  const fs = Math.max(view.w, view.h) * 0.03;
  const leaders = fig.leaders ?? [];
  return (
    <div className="fig-wrap">
      <svg className="fig fig-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet" role="img" aria-label={fig.title}>
        {fig.boxes.map((b, i) => {
          const size = b.label ? fitLabel(b.label, b.w, b.h, fs) : null;
          return (
            <g key={`b${i}`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} className={`fig-box ${b.cls}`}>
                {b.partId && <title>{b.partId}</title>}
              </rect>
              {b.label && size && (
                <text x={b.x + b.w / 2} y={b.y + b.h / 2} textAnchor="middle" dominantBaseline="middle"
                  className="fig-box-label" style={{ fontSize: size }}>{b.label}</text>
              )}
            </g>
          );
        })}
        {(fig.holes ?? []).map((h, i) => (
          <circle key={`h${i}`} cx={h.cx} cy={h.cy} r={h.dIn / 2}
            className={h.kind === 'cup' ? 'fig-cup' : h.kind === 'plate' ? 'fig-plate' : 'fig-pin'}>
            {h.note && <title>{h.note}</title>}
          </circle>
        ))}
        {fig.dims.map((d, i) => <DimLine key={`d${i}`} from={d.from} to={d.to} text={d.text} small={d.small} below={d.below} fs={fs} />)}
        {leaders.map((l, i) => <CalloutMarker key={`l${i}`} at={l.at} n={i + 1} fs={fs} />)}
      </svg>
      {leaders.length > 0 && (
        <ol className="fig-legend">
          {leaders.map((l, i) => (
            <li key={i}><span className="fig-legend-num">{i + 1}</span><span>{l.text}</span></li>
          ))}
        </ol>
      )}
    </div>
  );
}
