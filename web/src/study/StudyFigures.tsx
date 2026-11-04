/**
 * Results from the PAM-I study (Baros, Al-Hasso & Carvell), run on ORBIT hardware with ERA5
 * winds. Values are read from the study's figures (best solution per scenario; dashed-line
 * timings), not measured by this demonstrator. Confirm exact statistics with the study team
 * before quoting them outside a presentation.
 */
export const STUDY = {
  scenarios: 60,
  flightsPerScenario: 30,
  resolution: [
    { label: 'One level change', detail: 'climb or descend, then return', count: 19 },
    { label: 'One lateral offset', detail: 'step aside, then return', count: 3 },
    { label: 'One of each', detail: 'one level change and one offset', count: 25 },
    { label: 'More involved', detail: 'several changes', count: 13 },
  ],
  arrival: { envelopeMin: 10, typical: [-1.5, 4.5] as const, earliest: -3.5, latest: 9.25 },
  timing: [
    { label: 'First safe route', seconds: 0.04 },
    { label: 'Within 1% of the best', seconds: 0.75 },
    { label: 'Best route', seconds: 1.27 },
  ],
} as const;

export const simpleFixes = STUDY.resolution.slice(0, 3).reduce((sum, r) => sum + r.count, 0);

// One hue, ordered from simplest (brightest) to most involved (deepest).
const RAMP = ['#b1edc8', '#7fd3a6', '#4fae84', '#2f7d61'];
const INK = ['#06130d', '#06130d', '#06130d', '#f2f7f9'];

export function ResolutionFigure() {
  const total = STUDY.resolution.reduce((sum, r) => sum + r.count, 0);
  return <figure className="study-figure">
    <figcaption><strong>{simpleFixes} of {total}</strong><span>scenarios resolved with at most one level change and one lateral offset</span></figcaption>
    <div className="segmented" role="img" aria-label={STUDY.resolution.map(r => `${r.label}: ${r.count} of ${total}`).join('; ')}>
      {STUDY.resolution.map((r, i) => <div key={r.label} tabIndex={0} title={`${r.label} (${r.detail}): ${r.count} of ${total} scenarios`} style={{ flexGrow: r.count, background: RAMP[i], color: INK[i] }}>{r.count >= 5 ? r.count : ''}</div>)}
    </div>
    <ul className="figure-legend">{STUDY.resolution.map((r, i) => <li key={r.label}><i style={{ background: RAMP[i] }}/>{r.label}</li>)}</ul>
  </figure>;
}

export function ArrivalFigure() {
  const { envelopeMin, typical, earliest, latest } = STUDY.arrival;
  const x = (min: number) => 40 + (min + envelopeMin) / (2 * envelopeMin) * 920;
  return <figure className="study-figure">
    <figcaption><strong>±{envelopeMin} min</strong><span>arrival envelope held in every solved scenario; most land within {typical[0]} to +{typical[1]} min</span></figcaption>
    <svg viewBox="0 -6 1000 98" role="img" aria-label={`Arrival-time change: envelope plus or minus ${envelopeMin} minutes, typical ${typical[0]} to ${typical[1]} minutes, extremes ${earliest} and ${latest} minutes`}>
      <rect className="arrival-envelope" x={x(-envelopeMin)} y="18" width={x(envelopeMin) - x(-envelopeMin)} height="34" rx="4"><title>Schedule envelope: ±{envelopeMin} min</title></rect>
      <rect className="arrival-typical" x={x(typical[0])} y="18" width={x(typical[1]) - x(typical[0])} height="34" rx="4"><title>Most best solutions: {typical[0]} to +{typical[1]} min</title></rect>
      <line className="arrival-zero" x1={x(0)} x2={x(0)} y1="10" y2="60"/>
      {[earliest, latest].map(v => <g key={v}><circle className="arrival-extreme" cx={x(v)} cy="35" r="5"><title>{v > 0 ? 'Latest' : 'Earliest'}: {v > 0 ? '+' : ''}{v} min</title></circle><text className="figure-note" x={x(v)} y="8" textAnchor="middle">{v > 0 ? '+' : ''}{v}</text></g>)}
      {[-10, -5, 0, 5, 10].map(v => <text key={v} className="figure-tick" x={x(v)} y="80" textAnchor="middle">{v === 0 ? 'on time' : `${v > 0 ? '+' : ''}${v} min`}</text>)}
    </svg>
  </figure>;
}

export function TimingFigure() {
  const max = 1.5, width = 640;
  return <figure className="study-figure">
    <figcaption><strong>≈{STUDY.timing[0].seconds} s</strong><span>typical time to the first safe route on ORBIT; ≈{STUDY.timing[2].seconds.toFixed(1)} s to the best</span></figcaption>
    <svg viewBox="0 0 1000 118" role="img" aria-label={STUDY.timing.map(t => `${t.label}: about ${t.seconds} seconds`).join('; ')}>
      <line className="figure-baseline" x1="250" x2="250" y1="4" y2="112"/>
      {STUDY.timing.map((t, i) => {
        const w = Math.max(4, t.seconds / max * width), y = 10 + i * 36;
        return <g key={t.label}><text className="figure-label" x="236" y={y + 15} textAnchor="end">{t.label}</text>
          <path className="timing-bar" d={`M250 ${y} H${250 + w - 4} a4 4 0 0 1 4 4 V${y + 16} a4 4 0 0 1 -4 4 H250 Z`}><title>{t.label}: ≈{t.seconds} s</title></path>
          <text className="figure-value" x={258 + w} y={y + 15}>{t.seconds} s</text></g>;
      })}
    </svg>
  </figure>;
}

export function StudyTable() {
  return <table className="tech-table">
    <caption>Study figures as presented</caption>
    <tbody>
      {STUDY.resolution.map(r => <tr key={r.label}><th>{r.label}</th><td>{r.count} / {STUDY.scenarios}</td></tr>)}
      <tr><th>Arrival change, typical</th><td>{STUDY.arrival.typical[0]} to +{STUDY.arrival.typical[1]} min</td></tr>
      <tr><th>Arrival change, extremes</th><td>{STUDY.arrival.earliest} / +{STUDY.arrival.latest} min</td></tr>
      {STUDY.timing.map(t => <tr key={t.label}><th>{t.label}</th><td>≈{t.seconds} s</td></tr>)}
    </tbody>
  </table>;
}
