import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ProgressView, WindGrid } from '../api/types.gen';
import type { Recording } from '../replay/player';
import { coastPaths } from '../components/Airspace';
import { levelColour, routeBetween } from '../components/fleetGeometry';
import { resolutionDescription } from '../components/ResolutionFeed';
import { number, utc } from '../components/format';
import { pathD, project } from '../geo/projection';
import { complexity } from '../study/SkeletonView';
import { HOLD_S, LoopTimeline, SPEEDS, type LoopEncounter, type Plane } from './timeline';
import './loop.css';

const INTRO_S = 4;
const signed = (minutes: number | null | undefined) => minutes == null ? '—' : `${minutes > 0 ? '+' : ''}${number(minutes, 1)} min`;
const OUTRO_S = 1.6;
const TRAIL_S = 15 * 60;
const PLANE = 'M0 -7 L1.5 -1 L7 2 L7 3.5 L1 2 L1 6 L3 7.5 L-3 7.5 L-1 6 L-1 2 L-7 3.5 L-7 2 L-1.5 -1 Z';
const meridians = [-80, -70, -60, -50, -40, -30, -20, -10, 0, 10].map(lon => pathD(Array.from({ length: 50 }, (_, i) => [lon, 25 + i])));
const parallels = [30, 35, 40, 45, 50, 55, 60, 65, 70].map(lat => pathD(Array.from({ length: 110 }, (_, i) => [-95 + i, lat])));

interface Box { x: number; y: number; w: number; h: number }

function bounds(points: number[][], pad: number, minW: number): Box {
  const xy = points.map(p => project(p[0], p[1]));
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const w = Math.max(minW, (Math.max(...xs) - Math.min(...xs)) * (1 + 2 * pad)), h = (Math.max(...ys) - Math.min(...ys)) * (1 + 2 * pad);
  return { x: (Math.min(...xs) + Math.max(...xs) - w) / 2, y: (Math.min(...ys) + Math.max(...ys) - h) / 2, w, h };
}

/** Grow a content box to the screen's aspect, keeping it centred. */
function fit(box: Box, aspect: number): Box {
  const w = Math.max(box.w, box.h * aspect), h = w / aspect;
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

function heading(lon: number, lat: number, deg: number) {
  const b = deg * Math.PI / 180, [x, y] = project(lon, lat);
  const [nx, ny] = project(lon + .1 * Math.sin(b) / Math.cos(lat * Math.PI / 180), lat + .1 * Math.cos(b));
  return Math.atan2(nx - x, y - ny) * 180 / Math.PI;
}

const BaseMap = memo(function BaseMap({ tracks }: { tracks: { id: string; points: number[][] }[] }) {
  return <>
    <rect x="-2000" y="-2000" width="5000" height="5000" className="loop-ocean"/>
    <g className="loop-graticule">{[...meridians, ...parallels].map((d, i) => <path key={i} d={d}/>)}</g>
    <g className="loop-land">{coastPaths.map((d, i) => <path key={i} d={d}/>)}</g>
    <path className="loop-fir" d={pathD([[-30, 35], [-30, 66]])}/>
    <g className="loop-tracks">{tracks.map(t => <path key={t.id} d={pathD(t.points)}/>)}</g>
  </>;
});

const Wind = memo(function Wind({ grid }: { grid: WindGrid | null }) {
  const d = useMemo(() => {
    if (!grid) return '';
    const [lo, la, hi, lb] = grid.bounds, out: string[] = [];
    for (let row = 0; row < grid.height; row += 1) for (let col = row % 2; col < grid.width; col += 2) {
      const i = row * grid.width + col, lon = lo + (hi - lo) * col / (grid.width - 1), lat = la + (lb - la) * row / (grid.height - 1);
      const [x, y] = project(lon, lat), [xx, yy] = project(lon + grid.u_ms[i] * 3000 / (111320 * Math.cos(lat * Math.PI / 180)), lat + grid.v_ms[i] * 3000 / 111320);
      out.push(`M${x.toFixed(1)},${y.toFixed(1)}L${xx.toFixed(1)},${yy.toFixed(1)}`);
    }
    return out.join('');
  }, [grid]);
  return <path className="loop-wind" d={d}/>;
});

function phaseOf(e: LoopEncounter | null, t: number) {
  if (!e) return 'monitor' as const;
  if (t < e.start) return 'build' as const;
  if (t < e.cleared) return (e.progress.at(-1)?.s ?? Infinity) <= t ? 'verify' as const : 'sample' as const;
  return 'cleared' as const;
}

function progressAt(e: LoopEncounter, t: number): ProgressView | null {
  let found: ProgressView | null = null;
  for (const { s, p } of e.progress) { if (s > t) break; found = p; }
  return found;
}

/** β follows a linear schedule, so it can be shown continuously between sampler snapshots. */
function betaAt(e: LoopEncounter, t: number) {
  const pts = e.progress;
  if (!pts.length || t <= e.start) return 0;
  if (t >= pts.at(-1)!.s) return pts.at(-1)!.p.beta;
  const k = pts.findIndex(p => p.s > t);
  const a = k > 0 ? pts[k - 1] : { s: e.start, p: { beta: 0 } as ProgressView }, b = pts[k];
  return a.p.beta + (b.p.beta - a.p.beta) * (t - a.s) / (b.s - a.s || 1);
}

/** Candidates tied for the lowest complexity among those that pass every check. */
function bestRoutes(e: LoopEncounter) {
  const costs = e.solve.candidates.map(c => complexity(c.theta, c.chi));
  const best = Math.min(...costs.filter((_, i) => e.solve.candidate_feasible[i]));
  return new Set(costs.flatMap((c, i) => e.solve.candidate_feasible[i] && Math.abs(c - best) < 1e-9 ? [i] : []));
}

function Datalink({ lines, elapsed }: { lines: string[]; elapsed: number }) {
  const text = lines.join('\n'), shown = Math.floor(Math.max(0, elapsed) * 42);
  return <pre className="loop-datalink">{text.slice(0, shown)}<i className={shown < text.length ? 'typing' : ''}/></pre>;
}

export function LoopDemo() {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const load = (url: string) => fetch(url).then(r => r.ok ? r.json() as Promise<Recording> : Promise.reject(new Error(url)));
    load('/replay/loop.json').catch(() => load('/replay/fleet.json')).then(setRecording).catch(() => setFailed(true));
  }, []);
  const timeline = useMemo(() => recording ? new LoopTimeline(recording) : null, [recording]);
  if (failed) return <div className="loop-root loop-empty">Replay data not found.</div>;
  if (!timeline) return <div className="loop-root loop-empty">Loading the North Atlantic…</div>;
  return <LoopStage timeline={timeline}/>;
}

function LoopStage({ timeline }: { timeline: LoopTimeline }) {
  const { recording, encounters } = timeline;
  const total = INTRO_S + timeline.duration;
  const [now, setNow] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1600, h: 1000 });
  const camera = useRef<Box | null>(null);
  const last = useRef(performance.now());

  useEffect(() => {
    let frame = 0;
    const began = performance.now();
    const tick = (at: number) => { setNow(((at - began) / 1000) % total); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [total]);
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const real = Math.max(0, now - INTRO_S);
  const t = timeline.simAt(real);
  const speed = now < INTRO_S ? 300 : timeline.speedAt(t);
  const recordedSpeed = recording.world.speed || 10;
  const encounter = encounters.find(e => t >= e.detect && t < e.cleared + HOLD_S + 200) ?? null;
  const phase = phaseOf(encounter, t);
  const planes = timeline.planes(t);
  const done = timeline.resolved.filter(e => e.cleared <= t);
  const aspect = size.w / Math.max(1, size.h);

  // Trails are recomputed eight times a second rather than every frame.
  const trailTick = Math.floor(now * 8);
  const trails = useMemo(() => timeline.activeTrajectories(t).map(f => ({ id: f.id, level: f.level, d: pathD(routeBetween(f.path, t - TRAIL_S, t)) })), [trailTick, timeline]); // eslint-disable-line react-hooks/exhaustive-deps
  const windBucket = Math.floor(t / 900);
  const grid = useMemo(() => timeline.wind(t), [windBucket, timeline]); // eslint-disable-line react-hooks/exhaustive-deps

  const overview = useMemo(() => bounds(recording.world.tracks.flatMap(tr => tr.points), .16, 600), [recording]);
  const focus = useMemo(() => encounter ? bounds([...encounter.solve.nominal.points, ...(encounter.point ? [[encounter.point.lon, encounter.point.lat]] : [])], .14, 360) : null, [encounter]);
  const target = fit(focus && phase !== 'monitor' ? focus : overview, aspect);
  const dt = Math.min(.1, (performance.now() - last.current) / 1000);
  last.current = performance.now();
  const cam = camera.current ? (() => { const k = 1 - Math.exp(-dt * 1.5), c = camera.current!; return { x: c.x + (target.x - c.x) * k, y: c.y + (target.y - c.y) * k, w: c.w + (target.w - c.w) * k, h: c.h + (target.h - c.h) * k }; })() : target;
  camera.current = cam;
  const u = cam.w / Math.max(1, size.w) * (size.h / 1080);

  const conflicting = new Set(encounter && phase !== 'cleared' ? encounter.solve.conflicts_with : []);
  const progress = encounter ? progressAt(encounter, t) : null;
  const ghosts = encounter && (phase === 'sample' || phase === 'verify')
    ? (progress ? [...new Set(progress.active_candidates.flat())] : encounter.solve.candidates.map((c, i) => c.points.length ? i : -1).filter(i => i >= 0).slice(0, 60))
      .map(i => ({ i, path: encounter.solve.candidates[i] })).filter(g => g.path?.points.length).slice(0, 48)
    : [];
  const library = encounter && phase === 'build' ? (() => {
    const drawn = encounter.solve.candidates.flatMap((c, i) => c.points.length ? [i] : []);
    return drawn.slice(0, Math.ceil(drawn.length * Math.min(1, (t - encounter.detect) / Math.max(1, encounter.start - encounter.detect))));
  })() : [];
  const cleared = encounter && phase === 'cleared' ? encounter.record.trajectory : null;
  const newFlight = encounter ? planes.find(p => p.id === encounter.solve.flight_id) : undefined;
  const fade = now < INTRO_S ? Math.min(1, (INTRO_S - now) / 1.2) : real > timeline.duration - OUTRO_S ? Math.min(1, (real - (timeline.duration - OUTRO_S)) / OUTRO_S) : 0;

  return <div className="loop-root" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}>
    <div className="loop-map" ref={mapRef}>
      <svg viewBox={`${cam.x} ${cam.y} ${cam.w} ${cam.h}`} preserveAspectRatio="none" style={{ '--u': u } as React.CSSProperties} aria-label="North Atlantic fleet replay">
        <defs>
          <radialGradient id="loopVignette" cx="50%" cy="45%" r="75%"><stop offset="0" stopColor="#0d2a36" stopOpacity=".55"/><stop offset="1" stopColor="#020507" stopOpacity="0"/></radialGradient>
          <filter id="loopGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={2.2 * u}/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <BaseMap tracks={recording.world.tracks}/>
        <rect x={cam.x} y={cam.y} width={cam.w} height={cam.h} fill="url(#loopVignette)"/>
        <Wind grid={grid}/>
        <g className="loop-trails">{trails.map(tr => <path key={tr.id} d={tr.d} style={{ stroke: levelColour(tr.level) }}/>)}</g>

        {encounter && phase !== 'monitor' && <g className={`loop-encounter phase-${phase}`}>
          {phase !== 'cleared' && encounter.solve.conflicts_with.map(id => { const p = timeline.trajectory(id, encounter.start); return p && <path key={id} className="loop-conflict-route" d={pathD(p.points)}/>; })}
          <g className="loop-library-routes">{library.map(i => <path key={i} d={pathD(encounter.solve.candidates[i].points)} className={encounter.solve.candidate_feasible[i] ? 'safe' : 'unsafe'}/>)}</g>
          <path key={`nominal-${encounter.id}`} className="loop-filed" d={pathD(encounter.solve.nominal.points)} pathLength={1}/>
          <g className="loop-ghosts" filter="url(#loopGlow)">{ghosts.map(g => <path key={`${progress?.sweep ?? 'lib'}-${g.i}`} d={pathD(g.path.points)} className={encounter.solve.candidate_feasible[g.i] ? 'safe' : 'unsafe'} style={{ animationDelay: `${(g.i % 9) * 60}ms` }}/>)}</g>
          {cleared && <g filter="url(#loopGlow)"><path key={`clear-${encounter.id}`} className="loop-cleared" d={pathD(cleared.points)} pathLength={1}/></g>}
          {encounter.point && phase !== 'cleared' && (() => { const [x, y] = project(encounter.point.lon, encounter.point.lat); return <g transform={`translate(${x} ${y}) scale(${u})`} className="loop-conflict">
            <circle r="34" className="ring a"/><circle r="34" className="ring b"/><circle r="16" className="core"/>
            <path d="M-9 -9L9 9M9 -9L-9 9" className="cross"/>
            <g transform={x > cam.x + cam.w * .62 ? 'translate(-346 -34)' : 'translate(46 -34)'} className="loop-callout"><rect width="300" height="74" rx="6"/><text x="16" y="28" className="title">CONFLICT PREDICTED</text><text x="16" y="56">{encounter.solve.callsign} × {encounter.solve.conflicts_with.join(', ')} · FL{number(encounter.point.levelFl)}</text></g>
          </g>; })()}
          {!newFlight && (() => { const p = encounter.solve.nominal.points[0], [x, y] = project(p[0], p[1]); return <g transform={`translate(${x} ${y}) scale(${u})`} className="loop-entry">
            <path d="M0 -12L12 0L0 12L-12 0Z"/><text x="20" y="-10" className="title">{encounter.solve.callsign}</text><text x="20" y="14">FILED · ENTERS {utc(recording.world.start_utc, encounter.solve.nominal.times_s[0])}Z</text>
          </g>; })()}
        </g>}

        <g className="loop-planes">{planes.map(p => <PlaneMark key={p.id} plane={p} u={u} conflict={conflicting.has(p.id)} focus={p.id === encounter?.solve.flight_id && phase !== 'monitor'}/>)}</g>
      </svg>

      <header className="loop-brand"><img src="/images/QuantumDiceLogoRGB%20transparent__white%20gradient.png" alt="Quantum Dice"/><div><span>AIR TRAFFIC CONTROL · NORTH ATLANTIC</span><strong>Live deconfliction on a probabilistic computer</strong></div></header>
      <div className="loop-clock">
        <div className="loop-time"><span>SIMULATION TIME</span><strong>{utc(recording.world.start_utc, t)}<small>Z</small></strong></div>
        <div className="loop-speed" aria-label={`Playback ${speed} times real time`}>{SPEEDS.map(s => <b key={s} className={s === speed ? 'on' : ''}>{s}×</b>)}</div>
      </div>
      <div className="loop-stats">
        <div><strong>{planes.length}</strong><span>aircraft airborne</span></div>
        <div><strong>{done.length}</strong><span>conflicts resolved</span></div>
        <div className="good"><strong>{timeline.lossesAt(t)}</strong><span>separation losses</span></div>
      </div>
      <div className="loop-corner">
        <div className="loop-legend">{[310, 330, 350, 370, 390, 410].map(l => <span key={l} style={{ '--c': levelColour(l) } as React.CSSProperties}><i/>FL{l}</span>)}</div>
        <figure className="loop-qr"><img src="/images/case-study-qr.svg" alt="QR code linking to the Quantum Dice × NATS case study"/><figcaption><span>SCAN FOR</span>The full case study</figcaption></figure>
      </div>
    </div>

    <SolverPanel encounter={encounter} phase={phase} t={t} recordedSpeed={recordedSpeed} progress={progress} done={done}/>

    <footer className="loop-footer"><span>SIMULATION · synthetic traffic and wind · CPU p-bit emulator, not ORBIT hardware · not for operational use</span><i style={{ width: `${now / total * 100}%` }}/></footer>
    <div className="loop-curtain" style={{ opacity: fade }}>
      <img src="/images/QuantumDiceLogoRGB%20transparent__white%20gradient.png" alt=""/>
      <img className="loop-orbit" src="/images/orbit_logo_dark_background.png" alt="ORBIT"/><span>Every new flight, fitted into a moving ocean, verified before it is cleared.</span>
    </div>
  </div>;
}

function PlaneMark({ plane, u, conflict, focus }: { plane: Plane; u: number; conflict: boolean; focus: boolean }) {
  const [x, y] = project(plane.lon, plane.lat);
  const colour = conflict ? '#ffb36b' : focus ? '#ffffff' : levelColour(plane.level);
  return <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${u})`} className={`loop-plane ${conflict ? 'conflict' : ''} ${focus ? 'focus' : ''}`} style={{ color: colour }}>
    {(conflict || focus) && <circle r="20" className="halo"/>}
    <path d={PLANE} transform={`rotate(${heading(plane.lon, plane.lat, plane.heading).toFixed(1)}) scale(${focus || conflict ? 1.6 : 1.1})`}/>
    {(conflict || focus) && <text x="16" y="-10">{plane.callsign}<tspan x="16" dy="20">FL{number(plane.level)}</tspan></text>}
  </g>;
}

const STEPS = [['detect', 'Conflict predicted'], ['build', 'Candidate routes built and checked'], ['sample', 'p-bits sample the QUBO'], ['verify', 'Independent verification'], ['cleared', 'Clearance sent']] as const;

function SolverPanel({ encounter: e, phase, t, recordedSpeed, progress, done }: { encounter: LoopEncounter | null; phase: ReturnType<typeof phaseOf>; t: number; recordedSpeed: number; progress: ProgressView | null; done: LoopEncounter[] }) {
  const order = ['detect', 'build', 'sample', 'verify', 'cleared'];
  const at = phase === 'monitor' ? -1 : order.indexOf(phase);
  const title = { monitor: 'MONITORING', build: 'CONFLICT DETECTED', sample: 'SAMPLING', verify: 'VERIFYING', cleared: 'CLEARANCE ISSUED' }[phase];
  return <aside className={`loop-panel phase-${phase}`}>
    <div className="loop-panel-head"><span>ORBIT SOLVER</span></div>
    <div className="loop-state"><i/><strong>{title}</strong>{e && phase !== 'monitor' && <span>{e.solve.callsign} · {phase === 'cleared' ? 'separation and schedule verified' : `${e.solve.conflicts_with.length} aircraft in the way`}</span>}</div>
    {!e || phase === 'monitor' ? <Monitor done={done}/> : <>
      <ol className="loop-steps">{STEPS.map(([key, label], i) => {
        const state = i < at || (key === 'detect') || (phase === 'cleared') ? 'done' : i === at ? 'active' : 'todo';
        return <li key={key} className={state}><i/>{label}</li>;
      })}</ol>
      <Library e={e} t={t} phase={phase} recordedSpeed={recordedSpeed}/>
      {(phase === 'sample' || phase === 'verify') && <Sampler e={e} t={t} progress={progress}/>}
      {phase === 'cleared' && <div className="loop-result">
        <span>VERIFIED CLEARANCE</span>
        <strong>{resolutionDescription(e.record)}</strong>
        <p>then back on the filed route · arrival {signed(e.record.metrics.arrival_dev_min)}, inside ±10</p>
        <Datalink lines={e.record.message} elapsed={(t - e.cleared) / recordedSpeed}/>
      </div>}
    </>}
  </aside>;
}

function Library({ e, t, phase, recordedSpeed }: { e: LoopEncounter; t: number; phase: string; recordedSpeed: number }) {
  const total = e.solve.candidates.length, safe = e.solve.metrics.n_candidates_feasible ?? e.solve.candidate_feasible.filter(Boolean).length;
  const share = phase === 'build' ? Math.min(1, (t - e.detect) / Math.max(1, e.start - e.detect)) : 1;
  return <div className="loop-library">
    <div><strong>{number(Math.round(total * share))}</strong><span>possible routes</span></div>
    <div className="safe"><strong>{number(Math.round(safe * share))}</strong><span>pass every safety check</span></div>
    <div><strong>{number(Math.max(0, (Math.min(t, e.cleared) - e.detect) / recordedSpeed), 1)}<small>s</small></strong><span>wall-clock time</span></div>
  </div>;
}

function Sampler({ e, t, progress }: { e: LoopEncounter; t: number; progress: ProgressView | null }) {
  const beta = betaAt(e, t), best = useMemo(() => bestRoutes(e), [e]);
  const replicas = progress?.active_candidates ?? Array.from({ length: 24 }, () => []);
  const energies = e.progress.filter(p => p.s <= t).map(p => p.p.energy);
  const max = Math.max(...e.progress.map(p => p.p.energy), 1e-9);
  return <div className="loop-sampler">
    <div className="loop-beta"><span>β · inverse temperature</span><b>{number(beta, 1)}</b><i><em style={{ width: `${Math.min(100, beta / 32 * 100)}%` }}/></i><small>explore → settle</small></div>
    <div className="loop-replicas">{replicas.map((ids, r) => {
      const id = ids[0] ?? -1;
      const tone = id < 0 ? 'empty' : best.has(id) ? 'best' : e.solve.candidate_feasible[id] ? 'safe' : 'unsafe';
      return <i key={r} className={tone}/>;
    })}</div>
    <div className="loop-replica-key"><span><em className="best"/>best safe route <em className="safe"/>other safe <em className="unsafe"/>unsafe</span><b>sweep {number(progress?.sweep ?? 0)}</b></div>
    <div className="loop-replica-key"><span>24 p-bit replicas search in parallel, each holding one route</span><b>{replicas.filter(ids => best.has(ids[0] ?? -1)).length} / 24 on the best</b></div>
    <svg className="loop-energy" viewBox="0 0 100 30" preserveAspectRatio="none">
      <path d={energies.map((v, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, e.progress.length - 1) * 100).toFixed(1)},${(28 - v / max * 26).toFixed(1)}`).join(' ')}/>
    </svg>
    <div className="loop-replica-key"><span>energy falls as the search settles</span></div>
  </div>;
}

function Monitor({ done }: { done: LoopEncounter[] }) {
  return <div className="loop-monitor">
    <p>Every cleared flight is checked against every other, continuously. A new request that would conflict is re-planned before it is cleared.</p>
    <span className="loop-label">RECENT CLEARANCES</span>
    <ul>{done.slice(-5).reverse().map(e => <li key={e.id}><b>{e.record.callsign}</b><span>{resolutionDescription(e.record)}</span><small>{signed(e.record.metrics.arrival_dev_min)}</small></li>)}{!done.length && <li className="none">Waiting for the first new request…</li>}</ul>
  </div>;
}

