import { memo, useMemo } from 'react';
import type { PathView, SolveView } from '../api/types.gen';

/** Unique deviation shapes in one dimension, so 1,321 candidates draw as a few hundred lines. */
function shapes(solve: SolveView, key: 'theta' | 'chi') {
  const byShape = new Map<string, { values: number[]; feasible: boolean; indices: number[] }>();
  solve.candidates.forEach((candidate, i) => {
    const values = candidate[key], id = values.join(',');
    const shape = byShape.get(id) ?? { values, feasible: false, indices: [] };
    shape.feasible ||= solve.candidate_feasible[i];
    shape.indices.push(i);
    byShape.set(id, shape);
  });
  return [...byShape.values()];
}

const signed = (n: number) => n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';

/**
 * The deviation skeleton around the filed route, as in the study: waypoints run left to right,
 * lateral offsets (30 NM steps) and flight levels (one legal level per step) run vertically.
 */
export const SkeletonView = memo(function SkeletonView({ solve, chosen, active, compact = false, showFeasibility = true }: {
  solve: SolveView; chosen?: PathView | null; active?: number[] | null; compact?: boolean; showFeasibility?: boolean;
}) {
  const lateral = useMemo(() => shapes(solve, 'theta'), [solve]);
  const vertical = useMemo(() => shapes(solve, 'chi'), [solve]);
  const activeSet = useMemo(() => new Set(active ?? []), [active]);
  const n = solve.nominal.points.length;
  const K = Math.max(1, ...solve.candidates.flatMap(c => c.theta.map(Math.abs)));
  const J = Math.max(1, ...solve.candidates.flatMap(c => c.chi.map(Math.abs)));
  const filedFl = Math.round(solve.nominal.points[Math.min(1, n - 1)][2]);
  const W = compact ? 420 : 1000;
  const row = compact ? 15 : 25, left = compact ? 10 : 120, right = W - (compact ? 10 : 15), gap = compact ? 22 : 48;
  const lateralTop = compact ? 10 : 30, verticalTop = lateralTop + 2 * K * row + gap;
  const height = verticalTop + 2 * J * row + (compact ? 10 : 26);
  const x = (i: number) => left + i * (right - left) / Math.max(1, n - 1);
  const line = (values: number[], top: number, M: number) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${(top + (M - v) * row).toFixed(1)}`).join(' ');

  function strip(kind: 'lateral' | 'vertical', items: typeof lateral, top: number, M: number, values?: number[]) {
    const levels = Array.from({ length: 2 * M + 1 }, (_, i) => M - i);
    return <g className={`skeleton-strip ${kind}`}>
      {!compact && <text className="skeleton-title" x={left - 108} y={top - 14}>{kind === 'lateral' ? 'LATERAL OFFSET' : 'FLIGHT LEVEL'}</text>}
      {levels.map(v => <g key={v}>
        <line className={v === 0 ? 'skeleton-axis filed' : 'skeleton-axis'} x1={x(0)} x2={x(n - 1)} y1={top + (M - v) * row} y2={top + (M - v) * row}/>
        {!compact && <text className="skeleton-label" x={left - 14} y={top + (M - v) * row + 4} textAnchor="end">{kind === 'lateral' ? v === 0 ? 'filed' : `${signed(v * 30)} NM` : `FL${filedFl + 20 * v}${v === 0 ? ' filed' : ''}`}</text>}
        {Array.from({ length: n - 2 }, (_, i) => <circle key={i} className="skeleton-node" cx={x(i + 1)} cy={top + (M - v) * row} r={compact ? 1.6 : 2.4}/>)}
      </g>)}
      {items.map(s => {
        const sampled = s.indices.some(i => activeSet.has(i));
        const state = sampled ? 'sampled' : !showFeasibility ? 'quiet' : s.feasible ? 'feasible' : 'rejected';
        return <path key={s.values.join(',')} d={line(s.values, top, M)} className={`skeleton-path ${state}`}><title>{s.feasible ? 'Passes safety and schedule checks' : 'Rejected by safety or schedule checks'}{sampled ? ' · in the current sample' : ''}</title></path>;
      })}
      <path className="skeleton-filed" d={line(Array(n).fill(0), top, M)}/>
      {values && <><path className="skeleton-chosen-glow" d={line(values, top, M)}/><path className="skeleton-chosen" d={line(values, top, M)}/></>}
      <circle className="skeleton-end" cx={x(0)} cy={top + M * row} r={compact ? 3 : 5}/><circle className="skeleton-end" cx={x(n - 1)} cy={top + M * row} r={compact ? 3 : 5}/>
    </g>;
  }

  return <svg className={`skeleton-view ${compact ? 'compact' : ''}`} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Deviation skeleton with ${solve.candidates.length} candidate routes around the filed route`}>
    {strip('lateral', lateral, lateralTop, K, chosen?.theta)}
    {strip('vertical', vertical, verticalTop, J, chosen?.chi)}
    {!compact && <><text className="skeleton-edge" x={x(0)} y={height - 4} textAnchor="middle">OCEANIC ENTRY</text><text className="skeleton-edge" x={x(n - 1)} y={height - 4} textAnchor="end">EXIT</text></>}
  </svg>;
});

/** Squared changes in deviation, weighted 2 (lateral) to 1 (vertical), as in the study. */
export function complexity(theta: number[], chi: number[]) {
  let total = 0;
  for (let i = 1; i < theta.length; i++) total += 2 * (theta[i] - theta[i - 1]) ** 2 + (chi[i] - chi[i - 1]) ** 2;
  return total;
}

/** Two illustrative shapes that show why squared changes favour one sustained manoeuvre. */
export function ScoringSketch() {
  const sustained = [0, 1, 1, 1, 1, 1, 1, 0], zigzag = [0, 1, 0, 1, 0, 1, 0, 0];
  const d = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${8 + i * 22},${30 - v * 20}`).join(' ');
  const flat = Array(8).fill(0);
  return <div className="scoring-sketch">
    {[{ values: sustained, label: 'One sustained change', good: true }, { values: zigzag, label: 'Zig-zag', good: false }].map(item => <div key={item.label} className={item.good ? 'good' : 'bad'}>
      <svg viewBox="0 0 170 40" aria-hidden="true"><path d={d(flat)} className="sketch-filed"/><path d={d(item.values)} className="sketch-route"/></svg>
      <span>{item.label}</span><strong>{complexity(flat, item.values)}</strong>
    </div>)}
  </div>;
}
