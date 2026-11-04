import { ArrowRight, CheckCircle2 } from 'lucide-react';

/** Small plane glyph pointing along +x, centred on the origin. */
const PLANE = 'M7 0L2 -1.2L-1.5 -6L-3.5 -6L-1.5 -1.2L-5 -1.2L-6.5 -3.2L-8 -3.2L-7 0L-8 3.2L-6.5 3.2L-5 1.2L-1.5 1.2L-3.5 6L-1.5 6L2 1.2Z';
const plane = (x: number, y: number, angle = 0, cls = '') => <path className={`art-plane ${cls}`} d={PLANE} transform={`translate(${x} ${y}) rotate(${angle})`}/>;

/** Two flights both bend a little, instead of one bending a lot. */
function MultiAircraft() {
  return <svg viewBox="0 0 220 110" aria-hidden="true">
    <path className="art-filed" d="M14 78L206 30"/><path className="art-filed" d="M14 30L206 80"/>
    <circle className="art-conflict" cx="110" cy="54" r="11"/>
    <path className="art-route green" d="M14 78C70 64 92 34 130 32S180 36 206 30"/>
    <path className="art-route lilac" d="M14 30C60 40 88 78 126 80S182 78 206 80"/>
    {plane(206, 30, -10, 'green')}{plane(206, 80, 2, 'lilac')}
    {plane(52, 12, 0, 'quiet')}{plane(168, 100, 0, 'quiet')}
  </svg>;
}

/** One aircraft diverts; everyone already cleared keeps their route. */
function Emergency() {
  return <svg viewBox="0 0 220 110" aria-hidden="true">
    {[22, 50].map(y => <g key={y}><path className="art-traffic" d={`M10 ${y}H210`}/>{plane(70 + y, y, 0, 'quiet')}{plane(165 - y / 2, y, 0, 'quiet')}</g>)}
    <path className="art-filed" d="M10 76H210"/>
    <path className="art-route amber" d="M10 76H74C104 76 120 84 140 92S176 96 184 96"/>
    {plane(74, 76, 0, 'amber')}
    <g className="art-alert" transform="translate(74 62)"><path d="M0 -8L7 4H-7Z"/><path className="mark" d="M0 -4V0M0 2V2.5"/></g>
    <g className="art-runway" transform="translate(186 96)"><rect x="0" y="-4" width="28" height="8" rx="1.5"/><path d="M5 0H23"/></g>
  </svg>;
}

/** A day of filings, each inserted in turn; the re-planned ones stand out. */
function FullDay() {
  const rows = Array.from({ length: 7 }, (_, r) => Array.from({ length: 6 }, (_, k) => {
    const start = ((r * 37 + k * 53) % 180) + 14, length = 22 + ((r * 13 + k * 7) % 20);
    return { start, length, changed: (r * 6 + k) % 5 === 2 };
  }).filter(b => b.start + b.length < 206));
  return <svg viewBox="0 0 220 110" aria-hidden="true">
    {rows.map((bars, r) => bars.map((b, k) => <rect key={`${r}-${k}`} className={`art-bar ${b.changed ? 'changed' : ''}`} x={b.start} y={8 + r * 11} width={b.length} height="5" rx="2.5"/>))}
    <path className="art-axis" d="M14 92H206"/>
    {[0, 6, 12, 18, 24].map(h => <g key={h}><path className="art-axis" d={`M${14 + h * 8} 90V94`}/><text className="art-text" x={14 + h * 8} y="105" textAnchor="middle">{String(h).padStart(2, '0')}:00</text></g>)}
  </svg>;
}

/** Each airport agrees its own arrival window; inserted flights land inside it. */
function Airports() {
  const airports = [['LHR', 18, [-6, 3, 9]], ['CDG', 28, [-12, 4, 16]], ['FRA', 12, [-4, 2, 7]]] as const;
  return <svg viewBox="0 0 220 110" aria-hidden="true">
    <path className="art-axis" d="M128 6V96"/>
    <text className="art-text" x="128" y="106" textAnchor="middle">scheduled arrival</text>
    {airports.map(([name, half, dots], i) => {
      const y = 18 + i * 30;
      return <g key={name}>
        <text className="art-label" x="12" y={y + 4}>{name}</text>
        <path className="art-traffic" d={`M44 ${y}H210`}/>
        <rect className="art-window" x={128 - half * 2} y={y - 8} width={half * 4} height="16" rx="3"/>
        {dots.map(d => <circle key={d} className="art-dot" cx={128 + d * 2} cy={y} r="3"/>)}
      </g>;
    })}
  </svg>;
}

function Encoding() {
  const on = new Set([0, 7, 9, 14, 16, 21, 22, 28, 30, 35, 3, 18, 33]);
  return <svg viewBox="0 0 48 48" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <rect key={i} className={`art-cell ${on.has(i) ? 'on' : ''}`} x={4 + (i % 6) * 7} y={4 + Math.floor(i / 6) * 7} width="5.5" height="5.5" rx="1"/>)}</svg>;
}
function Hardware() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><circle className="art-ring" cx="24" cy="24" r="17"/><circle className="art-core" cx="24" cy="24" r="4.5"/></svg>;
}
function Weather() {
  return <svg viewBox="0 0 48 48" aria-hidden="true">
    {[12, 22, 32].map((y, i) => <path key={y} className="art-wind" d={`M4 ${y}C14 ${y - 6} 24 ${y + 6} 34 ${y}S42 ${y - 3} 44 ${y - 2}`} style={{ animationDelay: `${i * .3}s` }}/>)}
    {plane(36, 40, -8, 'small')}
  </svg>;
}

const SHOWN = ['A formulation built around operational smoothness', 'Solved on ORBIT hardware in about a second (study)', 'An end-to-end pipeline with independent verification (this demonstrator)'];
const RESEARCH = [
  { title: 'Multi-aircraft deviations', note: 'and rules for who to perturb', Art: MultiAircraft },
  { title: 'Emergency response', note: 'procedures under the same objective', Art: Emergency },
  { title: 'A full day of operations', note: 'sequential deconfliction at scale', Art: FullDay },
  { title: 'Airport collaboration', note: 'agreed schedule envelopes', Art: Airports },
];
const INTEGRATION = [
  { title: 'Full study encoding', note: 'in the demonstrator pipeline', Icon: Encoding },
  { title: 'ORBIT hardware', note: 'in the loop', Icon: Hardware },
  { title: 'Real weather and traffic', note: 'in place of synthetic data', Icon: Weather },
];

export function Roadmap() {
  return <div className="story-roadmap">
    <section className="roadmap-shown"><span className="roadmap-label">SHOWN TODAY</span>
      <div>{SHOWN.map(s => <p key={s}><CheckCircle2 size={20}/>{s}</p>)}</div>
    </section>
    <section className="roadmap-research"><span className="roadmap-label">RESEARCH NEXT</span>
      <div>{RESEARCH.map(({ title, note, Art }) => <article key={title}><Art/><strong>{title}</strong><span>{note}</span></article>)}</div>
    </section>
    <section className="roadmap-integrate"><span className="roadmap-label">INTEGRATION NEXT</span>
      <div>{INTEGRATION.map(({ title, note, Icon }, i) => <div key={title} className="roadmap-step">{i > 0 && <ArrowRight className="roadmap-arrow" size={18}/>}<Icon/><p><strong>{title}</strong>{note}</p></div>)}</div>
    </section>
  </div>;
}
