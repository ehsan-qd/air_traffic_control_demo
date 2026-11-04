import { liveEnabled } from '../api/runtime';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Binary, Building2, CheckCircle2, CircleDashed, Expand, Pause, Play, Plane, Presentation, Repeat2, RotateCcw, ShieldCheck, Users, X } from 'lucide-react';
import type { FlightView, InsertionRecord, PathView, SolveView, WorldView } from '../api/types.gen';
import { Airspace, type MapZoom } from '../components/Airspace';
import { Cockpit } from '../components/Cockpit';
import { EnergyChart } from '../components/Telemetry';
import { resolutionDescription } from '../components/ResolutionFeed';
import { ms, number, readable, utc } from '../components/format';
import { pathD, project } from '../geo/projection';
import { useDemo, type SolveArchive } from '../store/useDemo';
import { replay, type Cue } from '../replay/player';
import { chapters, clockLabel, STUDY_DURATION_MS, type SceneId } from './chapters';
import { predictedEncounter, type Encounter } from './encounter';
import { complexity, ScoringSketch, SkeletonView } from './SkeletonView';
import { ArrivalFigure, ResolutionFigure, STUDY, StudyTable, TimingFigure } from './StudyFigures';
import { Roadmap } from './Roadmap';
import type { useStudyLoop } from './useStudyLoop';
import './story.css';

type Director = ReturnType<typeof useStudyLoop>;
const STORY_FLIGHT = 'XAT417';
const CAPTURE_BETAS = [0.6, 8, 32];
/** The point in the run each scene needs; entering a scene never waits for it. */
const SCENE_CUE: Record<SceneId, Cue | null> = { ask: 'filed', conflict: 'solve', options: 'solve', orbit: 'cleared', clearance: 'cleared', study: null, next: 'complete' };

const plural = (n: number | undefined, one: string, many = `${one}s`) => `${number(n)} ${n === 1 ? one : many}`;
const minutes = (value: number | undefined) => value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value), 1)} min`;
const seconds = (value: number | undefined) => value == null ? '—' : `${number(value / 1000, 1)} s`;

/** Fit projected points into a map window with the 1000 × 535 aspect. */
function frame(points: number[][], minWidth = 300, pad = 0.12): MapZoom | null {
  if (!points.length) return null;
  const xy = points.map(p => project(p[0], p[1]));
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = Math.min(1000, Math.max(minWidth, (x1 - x0) * (1 + 2 * pad), (y1 - y0) * (1 + 2 * pad) * 1000 / 535));
  const h = w * 0.535;
  return { w, x: Math.max(0, Math.min(1000 - w, (x0 + x1 - w) / 2)), y: Math.max(0, Math.min(535 - h, (y0 + y1 - h) / 2)) };
}

/** Milliseconds since the scene opened; stops while the presentation is paused. */
function useSceneClock(scene: number, running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => setElapsed(0), [scene]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsed(t => t + 200), 200);
    return () => window.clearInterval(timer);
  }, [running, scene]);
  return elapsed;
}

function readTech() { try { return localStorage.getItem('pam-tech') === '1'; } catch { return false; } }
function writeTech(on: boolean) { try { localStorage.setItem('pam-tech', on ? '1' : '0'); } catch { /* Preference only. */ } }

function Figure({ value, label, tone }: { value: ReactNode; label: ReactNode; tone?: 'good' | 'warn' }) {
  return <div className={`story-figure ${tone ?? ''}`}><strong>{value}</strong><span>{label}</span></div>;
}
function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return <table className="tech-table"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>;
}
function Waiting({ children }: { children: ReactNode }) {
  return <div className="story-waiting"><CircleDashed size={26}/><p>{children}</p></div>;
}

interface StoryData {
  world: WorldView | null; record: InsertionRecord | null; archive: SolveArchive | null; solve: SolveView | null;
  flight: FlightView | null; encounter: Encounter | null; chosen: PathView | null; live: boolean; history: InsertionRecord[];
}

export function StudyLoop({ director, onExit }: { director: Director; onExit: (target: 'intro' | 'explore') => void }) {
  const state = useDemo();
  const world = state.world;
  const scene = director.scene;
  const story = chapters[scene];
  const id: SceneId = story.id;
  const running = director.status === 'running';
  const clock = useSceneClock(scene, running);
  const [tech, setTech] = useState(readTech);
  const toggleTech = () => setTech(on => { writeTech(!on); return !on; });

  // Keep the first scripted insertion's explanation intact while later requests run live.
  // This does not enter history inspection or pause the backend.
  const record = state.history.find(r => r.flight_id === STORY_FLIGHT) ?? null;
  const live = !record && state.solve?.flight_id === STORY_FLIGHT;
  const archive: SolveArchive | null = record ? state.archives[record.id] ?? null : live ? state : null;
  const solve = archive?.solve ?? null;
  const flight = world?.flights.find(f => f.id === STORY_FLIGHT) ?? null;
  const chosen = record?.verified ? record.trajectory : null;
  const encounter = useMemo(() => {
    if (!solve || !world) return null;
    const others = solve.conflicts_with.flatMap(other => { const f = world.flights.find(x => x.id === other); return f?.trajectory ? [{ id: other, path: f.trajectory }] : []; });
    return predictedEncounter(solve.nominal, others);
    // Committed trajectories do not change while the story flight is explained.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solve, world?.scenario, world?.seed, !!world]);
  const data: StoryData = { world, record, archive, solve, flight, encounter, chosen, live, history: state.history };

  const playing = running || director.status === 'paused';
  useEffect(() => {
    const cue = SCENE_CUE[id];
    const at = cue && replay.cue(cue);
    if (playing && at != null) replay.seekTo(at);
  }, [id, playing, director.cycle]);

  const ref = useRef({ director, toggleTech, onExit });
  ref.current = { director, toggleTech, onExit };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('input,select,textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      const { director: d, toggleTech: t, onExit: exit } = ref.current;
      if (['ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); d.next(); }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); d.previous(); }
      else if (e.code === 'Space' && !target.matches('button,a')) { e.preventDefault(); if (d.mode === 'auto') void d.togglePause(); else d.next(); }
      else if (e.key === 't' || e.key === 'T') t();
      else if (/^[1-7]$/.test(e.key)) d.goTo(Number(e.key) - 1);
      else if (e.key === 'Escape' && !document.fullscreenElement) exit('intro');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* The presentation remains usable when fullscreen is unavailable. */ }
  }

  const paused = director.status === 'paused';
  const transitioning = director.busy || director.status === 'starting' || director.status === 'restarting';
  const progress = director.mode === 'auto' ? director.elapsedMs / STUDY_DURATION_MS : scene / (chapters.length - 1);
  const last = scene === chapters.length - 1;
  // The clearance summary moves into the cockpit card, so the visual takes the full width.
  const wide = id === 'clearance' && !tech && !!(data.record?.verified && data.record.trajectory && data.world);
  const tag = story.tag === 'sim' ? ['SIMULATION', 'Synthetic traffic and wind'] : story.tag === 'study' ? ['STUDY', 'ORBIT hardware · ERA5 winds'] : ['ROADMAP', 'Shown today and next steps'];

  return <section className={`story ${tech ? 'story-tech' : ''}`} aria-label="Guided deconfliction walkthrough">
    <div className="story-bar">
      <ol className="story-steps" aria-label="Walkthrough scenes">{chapters.map((item, i) => <li key={item.id}>
        <button onClick={() => director.goTo(i)} aria-current={i === scene ? 'step' : undefined} className={i < scene ? 'done' : ''}><span>{i + 1}</span>{item.label}</button>
      </li>)}</ol>
      <div className="story-controls">
        <div className="story-mode" role="group" aria-label="Presentation mode">
          <button aria-pressed={director.mode === 'present'} onClick={() => director.setMode('present')} title="Step through with arrow keys or a clicker"><Presentation size={14}/>Present</button>
          <button aria-pressed={director.mode === 'auto'} onClick={() => director.setMode('auto')} title="Timed scenes that loop every 2½ minutes"><Repeat2 size={14}/>Autoplay{director.mode === 'auto' && <small>{clockLabel(director.elapsedMs)}</small>}</button>
        </div>
        <button className={`story-tech-toggle ${tech ? 'on' : ''}`} aria-pressed={tech} onClick={toggleTech} title="Technical detail (T)"><Binary size={14}/>Technical</button>
        <button className="story-icon" onClick={() => void director.togglePause()} disabled={transitioning || director.status === 'error'} aria-label={paused ? 'Resume simulation' : 'Pause simulation'} title={paused ? 'Resume' : 'Pause'}>{paused ? <Play size={15}/> : <Pause size={15}/>}</button>
        <button className="story-icon" onClick={() => void director.start()} disabled={transitioning} aria-label="Restart walkthrough" title="Restart from the beginning"><RotateCcw size={15}/></button>
        <button className="story-icon" onClick={() => void fullscreen()} aria-label="Toggle fullscreen" title="Fullscreen"><Expand size={15}/></button>
        <button className="story-icon" onClick={() => onExit('intro')} disabled={director.busy} aria-label="Exit walkthrough" title="Exit (Esc)"><X size={16}/></button>
      </div>
    </div>
    <div className="story-progress" role="progressbar" aria-label="Walkthrough progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><i style={{ width: `${progress * 100}%` }}/></div>

    <header className="story-heading" key={scene}>
      <span className="story-kicker">{String(scene + 1).padStart(2, '0')} · {story.label}</span>
      <h1>{story.title}</h1>
      <p>{story.line}</p>
    </header>
    {(director.status !== 'running' && director.status !== 'idle') && <div className="story-status" role="status">{
      director.status === 'starting' ? 'Preparing the fleet…' : director.status === 'restarting' ? 'Starting again…'
        : director.status === 'error' ? 'The simulation data could not be loaded. Reload the page.' : 'Paused. The sky is frozen.'}</div>}

    <div className={`story-stage ${wide ? 'story-stage-wide' : ''}`}>
      <section className={`story-visual scene-${id}`} key={`visual-${scene}`}>
        <div className="story-visual-tag"><b className={`tag-${story.tag}`}>{tag[0]}</b><span>{tag[1]}</span></div>
        <Visual id={id} data={data} clock={clock} running={running} onSelect={state.selectFlight}/>
      </section>
      {!wide && <aside className="story-side" key={`side-${scene}-${tech}`}>
        {tech ? <Technical id={id} data={data} warmupMs={state.warmupMs}/> : <Summary id={id} data={data} onExit={onExit} onReplay={() => void director.start()}/>}
      </aside>}
    </div>

    <nav className="story-nav" aria-label="Scene navigation">
      <button onClick={director.previous} disabled={scene === 0}><ArrowLeft size={16}/><span>{scene > 0 ? chapters[scene - 1].label : 'Back'}</span></button>
      <div className="story-dots">{chapters.map((item, i) => <i key={item.id} className={i === scene ? 'on' : i < scene ? 'done' : ''}/>)}</div>
      {last ? <button className="primary" onClick={() => onExit(liveEnabled ? 'explore' : 'intro')}><span>{liveEnabled ? 'Explore the live system' : 'Back to overview'}</span><ArrowRight size={16}/></button>
        : <button className="primary" onClick={director.next}><span>{chapters[scene + 1].label}</span><ArrowRight size={16}/></button>}
    </nav>
  </section>;
}

/** The filed request only: its cleared route is revealed later, in the cockpit. */
/** Lowest complexity among candidates that pass the independent checks. */
function bestScore(solve: SolveView) {
  return Math.min(...solve.candidates.filter((_, i) => solve.candidate_feasible[i]).map(c => complexity(c.theta, c.chi)));
}
function isBest(solve: SolveView, index: number, best: number | null) {
  const c = solve.candidates[index];
  return !!c && solve.candidate_feasible[index] && best != null && Math.abs(complexity(c.theta, c.chi) - best) < 1e-9;
}
function allBest(solve: SolveView, replicas: number[][]) {
  const best = bestScore(solve), routes = [...new Set(replicas.flat())];
  return routes.length > 0 && routes.every(i => isBest(solve, i, best));
}

function StoryMap({ data, zoom, conflict, onSelect, children }: { data: StoryData; zoom: MapZoom | null; conflict: boolean; onSelect: (id: string) => void; children?: ReactNode }) {
  const { world, solve, flight } = data;
  if (!world) return <Waiting>Waiting for the local simulation…</Waiting>;
  // Without a record the Airspace shows the solve as unsettled: filed route plus highlighted conflicts.
  return <div className="story-map">
    <Airspace world={world} solve={conflict ? solve : null} record={null} selected={flight ? { ...flight, trajectory: null } : null} onSelect={onSelect} zoom={zoom} initialLabels={false}>
      {!conflict && flight && <path className="nominal-route" d={pathD(solve?.nominal.points ?? flight.route)}/>}
      {children}
    </Airspace>
    <div className="story-map-key"><span><i/>Cleared traffic</span><span className="filed"><i/>New flight’s filed route</span>{conflict && <span className="conflict"><i/>Traffic in the way</span>}</div>
  </div>;
}

function Visual({ id, data, clock, running, onSelect }: { id: SceneId; data: StoryData; clock: number; running: boolean; onSelect: (id: string) => void }) {
  const { world, solve, record, archive, encounter, chosen, flight } = data;
  const fleetFrame = useMemo(() => world ? frame([...world.tracks.flatMap(t => t.points), ...(flight?.route ?? [])], 520, 0.05) : null, [world?.scenario, world?.seed, !!world, !!flight]); // eslint-disable-line react-hooks/exhaustive-deps
  if (id === 'ask') return <StoryMap data={data} zoom={fleetFrame} conflict={false} onSelect={onSelect}/>;

  if (id === 'conflict') {
    if (!solve) return <StoryMap data={data} zoom={fleetFrame} conflict onSelect={onSelect}/>;
    const route = frame([...solve.nominal.points, ...solve.conflicts_with.flatMap(c => world?.flights.find(f => f.id === c)?.trajectory?.points ?? [])], 420, 0.06);
    const close = encounter ? frame([[encounter.lon - 6, encounter.lat - 2], [encounter.lon + 6, encounter.lat + 2]], 440, 0) : null;
    const zoom = clock > 2600 && close ? close : route;
    const k = zoom ? 1000 / zoom.w : 1;
    const [x, y] = encounter ? project(encounter.lon, encounter.lat) : [0, 0];
    const other = encounter && world?.flights.find(f => f.id === encounter.otherId);
    return <StoryMap data={data} zoom={zoom} conflict onSelect={onSelect}>
      {encounter && world && <g transform={`translate(${x} ${y}) scale(${1.25 / k})`}><g className="encounter-marker">
        <circle className="encounter-zone" r="26"/><circle className="encounter-pulse" r="26"/>
        <path className="encounter-cross" d="M-7 -7 L7 7 M7 -7 L-7 7"/>
        <g className="encounter-label" transform="translate(34 -30)"><rect width="250" height="62" rx="5"/>
          <text x="13" y="24" className="encounter-title">Separation lost with {other?.callsign ?? encounter.otherId}</text>
          <text x="13" y="47">{encounter.distanceNm < 2 ? 'Same track' : `${number(encounter.distanceNm)} NM`} · FL{encounter.levelFl} · {utc(world.start_utc, encounter.timeS)}Z</text>
        </g>
      </g></g>}
    </StoryMap>;
  }

  if (id === 'options') {
    if (!solve) return <Waiting>Waiting for the new flight to file.</Waiting>;
    return <div className="story-skeleton">
      <SkeletonView solve={solve} chosen={null}/>
      <div className="skeleton-key"><span className="filed"><i/>Filed route</span><span className="feasible"><i/>Passes every check</span><span className="rejected"><i/>Rejected</span><b>{plural(solve.candidates.length, 'candidate route')} · each a single binary choice</b></div>
    </div>;
  }

  if (id === 'orbit') {
    if (!solve) return <Waiting>Waiting for the new flight to file.</Waiting>;
    const captures = archive?.captures ?? [];
    const trace = archive?.trace ?? [];
    const stage = Math.min(2, Math.floor(clock / 3200));
    if (!captures.length) return <div className="story-skeleton">
      <SkeletonView solve={solve} active={trace.at(-1)?.active_candidates.flat()} showFeasibility={false}/>
      <p className="story-caption">{data.live ? 'Sampling…' : 'Sampler captures unavailable.'}</p>
    </div>;
    return <div className="story-sampling">
      <div className="sampling-stages">{CAPTURE_BETAS.map((beta, i) => {
        const capture = captures.find(c => c.capture_beta === beta);
        const routes = capture ? new Set(capture.active_candidates.flat()).size : null;
        return <div key={beta} className={`sampling-stage ${i <= stage ? 'shown' : ''} ${i === stage ? 'current' : ''}`}>
          <span>{['Explore', 'Concentrate', 'Settle'][i]}</span>
          {capture ? <SkeletonView solve={solve} active={capture.active_candidates.flat()} chosen={i === 2 ? chosen : null} compact showFeasibility={false}/> : <p>Not captured</p>}
          <strong>{routes == null ? '—' : plural(routes, 'route')}</strong><small>{i === 2 && capture && allBest(solve, capture.active_candidates) ? 'all tied for the best safe score' : `in play · β ${number(capture?.beta, 1)}`}</small>
        </div>;
      })}</div>
      <div className="sampling-energy"><span>Energy falls as the search concentrates · measured during the solve</span><EnergyChart trace={trace}/></div>
    </div>;
  }

  if (id === 'clearance') {
    if (!record) return <Waiting>{data.live ? 'ORBIT is still searching. The verified clearance appears here.' : 'Waiting for the new flight to file.'}</Waiting>;
    if (!record.verified || !record.trajectory || !world) return <Waiting>No verified route, so no clearance. The flight is held for a controller.</Waiting>;
    return <div className="story-cockpit"><Cockpit key={record.id} world={world} record={record} solve={solve} flight={flight} compact enabled={running} durationMs={24_000} summary={<ClearanceSummary data={data}/>}/></div>;
  }

  if (id === 'study') return <div className="story-study">
    <ResolutionFigure/><ArrivalFigure/><TimingFigure/>
    <p className="story-source">Best solution per scenario, read from the study figures. Not measured by this demonstrator.</p>
  </div>;

  return <Roadmap/>;
}

/** The verified clearance at a glance; shown inside the cockpit card on the clearance scene. */
function ClearanceSummary({ data }: { data: StoryData }) {
  const { record, solve } = data;
  if (!record) return null;
  const metrics = record.metrics ?? solve?.metrics;
  return <>
    <div className="verified-badge"><ShieldCheck size={22}/><span>Verified<small>separation and schedule, independently</small></span></div>
    <Figure value={resolutionDescription(record)} label="then back on the filed route before exit"/>
    <Figure value={minutes(metrics?.arrival_dev_min)} label="arrival change, inside the ±10 min envelope" tone="good"/>
    <div className="datalink"><span>DATALINK · {record.callsign}</span>{record.message.map((line, i) => <p key={i}>{line}</p>)}</div>
  </>;
}

function Summary({ id, data, onExit, onReplay }: { id: SceneId; data: StoryData; onExit: (t: 'intro' | 'explore') => void; onReplay: () => void }) {
  const { world, solve, record, archive, encounter, history } = data;

  if (id === 'ask') {
    const airborne = world?.flights.filter(f => f.status === 'active').length;
    return <>
      <Figure value={number(airborne)} label="aircraft already cleared and flying. None of them move."/>
      <ul className="stakeholders">
        <li><Users size={18}/><span>Passengers<small>Safe separation</small></span><b className="must">Must</b></li>
        <li><Building2 size={18}/><span>Airports<small>Arrive within ±10 min</small></span><b className="must">Must</b></li>
        <li><Plane size={18}/><span>Pilots<small>Simple instructions</small></span><b>Minimise change</b></li>
        <li><Plane size={18} className="airline"/><span>Airlines<small>Preferred route</small></span><b>Minimise change</b></li>
      </ul>
      <p className="story-note">Optimal means: don’t rock the boat.</p>
    </>;
  }
  if (id === 'conflict') {
    if (!solve) return <><Figure value={data.flight ? 'Predicting…' : 'Filing…'} label={data.flight ? `${data.flight.callsign} has filed. Its route is being checked against every cleared trajectory.` : 'The new flight files about 15 seconds into the run.'}/></>;
    const names = solve.conflicts_with.map(c => world?.flights.find(f => f.id === c)?.callsign ?? c);
    return <>
      <Figure value={number(solve.conflicts_with.length)} label={<>cleared aircraft in the way: <b>{names.join(', ')}</b></>} tone="warn"/>
      {encounter && (encounter.distanceNm < 2
        ? <Figure value="Same track" label={`same path and level (FL${encounter.levelFl}), under 3 minutes apart`}/>
        : <Figure value={`${number(encounter.distanceNm)} NM`} label={`closest approach at FL${encounter.levelFl}, against a 30 NM minimum`}/>)}
      <p className="story-note">Any change shifts the flight’s timing in the wind, so every fix must be re-checked against everyone.</p>
    </>;
  }
  if (id === 'options') {
    const feasible = solve?.candidate_feasible.filter(Boolean).length;
    return <>
      <div className="figure-pair"><Figure value={number(solve?.candidates.length)} label="possible routes"/><Figure value={number(feasible)} label="pass every safety and schedule check" tone="good"/></div>
      <p className="story-label">How routes are scored</p>
      <ScoringSketch/>
      <p className="story-note">Lowest score wins: the fewest, smallest, steadiest changes for the pilot and airline.</p>
    </>;
  }
  if (id === 'orbit') {
    const captures = archive?.captures ?? [];
    const first = captures.find(c => c.capture_beta === CAPTURE_BETAS[0]), final = captures.find(c => c.capture_beta === CAPTURE_BETAS[2]);
    const best = solve ? bestScore(solve) : null;
    const good = final && solve ? final.active_candidates.filter(a => a.length === 1 && isBest(solve, a[0], best)).length : null;
    const spread = (c?: typeof first) => c ? new Set(c.active_candidates.flat()).size : null;
    return <>
      <Figure value={first && final ? <>{spread(first)} <ArrowRight size={30}/> {spread(final)}</> : '—'} label="routes still in play, from first look to final answer"/>
      <Figure value={good == null ? '—' : `${good} of ${final!.active_candidates.length}`} label="parallel searches end on a safe, best-scoring route" tone="good"/>
      <p className="story-note">Several routes can tie for the best score; the verifier confirms the one issued. Here ORBIT is emulated on a laptop CPU.</p>
    </>;
  }
  if (id === 'clearance') {
    if (!record) return <Figure value="—" label="Waiting for the verification decision."/>;
    if (!record.verified) return <Figure value="Held" label="No verified route in the bounded search. A controller takes over." tone="warn"/>;
    return <ClearanceSummary data={data}/>;
  }
  if (id === 'study') return <>
    <p className="story-label">The experiment</p>
    <ul className="setup-list">
      <li><strong>{STUDY.scenarios}</strong>busy test scenarios</li>
      <li><strong>{STUDY.flightsPerScenario}</strong>eastbound flights in each</li>
      <li><strong>ERA5</strong>real reanalysis winds, 1 March 2025</li>
      <li><strong>ORBIT</strong>Quantum Dice probabilistic computer</li>
    </ul>
    <p className="story-note">Same objective and constraints as the simulation you just watched, at the study’s full formulation.</p>
  </>;
  const verified = history.filter(r => r.verified), held = history.filter(r => !r.verified);
  return <>
    <p className="story-label">This simulation</p>
    <div className="figure-pair"><Figure value={number(verified.length)} label={`${verified.length === 1 ? 'flight' : 'flights'} inserted and verified`} tone="good"/><Figure value={number(world?.separation_losses)} label="separation losses observed"/></div>
    <div className="run-list">{history.map(r => <div key={r.id}>{r.verified ? <CheckCircle2 size={15}/> : <ShieldCheck size={15}/>}<strong>{r.callsign}</strong><span>{r.verified ? resolutionDescription(r) : 'Held for controller'}</span></div>)}{!history.length && <p>Insertions appear as they complete.</p>}{held.length > 0 && <small>{held.length} held for a controller</small>}</div>
    <div className="story-actions"><button className="primary" onClick={() => onExit(liveEnabled ? 'explore' : 'intro')}>{liveEnabled ? 'Explore the live system' : 'Back to overview'}<ArrowRight size={15}/></button><button onClick={onReplay}><RotateCcw size={14}/>Replay</button></div>
  </>;
}


function Technical({ id, data, warmupMs }: { id: SceneId; data: StoryData; warmupMs: number | null }) {
  const { world, solve, record, archive, encounter } = data;
  const metrics = record?.metrics ?? solve?.metrics;
  const trace = archive?.trace ?? [];
  const final = trace.at(-1);
  const head = (title: string) => <span className="tech-kicker">{title}</span>;

  if (id === 'ask') return <>
    {head('Sequential insertion')}
    <p>Committed traffic stays frozen. Only the incoming flight may deviate, with fixed Mach, nominal oceanic entry and exit, and wind-dependent traversal times.</p>
    <Rows rows={[['Committed trajectories', number(world?.flights.filter(f => f.trajectory).length)], ['Lateral separation', '30 NM'], ['Vertical separation', '1,000 ft'], ['Time buffer Δ', '3 min'], ['Arrival envelope 𝒯', '±10 min'], ['Legal levels (eastbound)', 'FL310–FL410']]}/>
    {head('Where this sits')}
    <ol className="placement"><li>Reactive sequential<small>Local, no full-trajectory guarantee</small></li><li className="this">Slot-in-global<small>This work: guarantees for the full trajectory</small></li><li>Fleet-global<small>Combinatorial explosion, operationally unsuitable</small></li></ol>
  </>;
  if (id === 'conflict') return <>
    {head('Conflict prediction')}
    <p>Spherical sub-arcs of the filed route are checked against every committed trajectory: lateral proximity, conservative climb envelopes and occupation times with the Δ buffer.</p>
    <Rows rows={[['Conflict participants', number(solve?.conflicts_with.length)], ['Conflicting sub-arc pairs', number(metrics?.n_conflict_pairs)], ['Frozen trajectories checked', number(metrics?.n_frozen)], ['Marker distance / time gap', encounter ? `${number(encounter.distanceNm, 1)} NM / ${number(encounter.gapS / 60, 1)} min` : '—']]}/>
    <p className="tech-caveat">The map marker is a sampled display estimate. The backend verifier is authoritative.</p>
  </>;
  if (id === 'options') return <>
    {head('Primary objective')}
    <div className="tech-equation">C<sub>N</sub> = Σ<sub>τ</sub> 2|θ<sub>τ</sub> − θ<sub>τ−1</sub>|² + |χ<sub>τ</sub> − χ<sub>τ−1</sub>|²</div>
    <p>Squared changes price oscillation heavily. Prolonged deviations are weeded out implicitly by the arrival envelope. Lateral steps are weighted twice level changes.</p>
    {head('Reduced QUBO in this demo')}
    <div className="tech-equation small">E(x) = c·x + A(Σx − 1)² + 2A Σ<sub>i∈rejected</sub> x<sub>i</sub></div>
    <Rows rows={[['Binary variables', number(metrics?.n_vars)], ['Non-zero Q entries', number(metrics?.nnz_q)], ['Feasible candidates', number(metrics?.n_candidates_feasible)], ['One-hot penalty A', typeof solve?.terms.one_hot_penalty === 'number' ? number(solve.terms.one_hot_penalty, 1) : '—'], ['Build + check', ms(metrics?.t_build_ms)]]}/>
    <p className="tech-caveat">One bit per contiguous skeleton deviation. The study’s full edge, slack and ordering encoding is not yet in the demonstrator pipeline.</p>
  </>;
  if (id === 'orbit') {
    const replicas = final?.active_candidates ?? [];
    return <>
      {head('p-bit Gibbs sampling')}
      <div className="tech-equation small">P(x<sub>i</sub> = 1) = σ(−β · ΔE<sub>i</sub>)</div>
      <p>Independent replicas update stochastic bits against the QUBO. β ramps linearly so probability concentrates on low-energy states.</p>
      <Rows rows={[['β schedule', '10⁻⁴ → 32, linear'], ['Sweeps run / requested', `${number(metrics?.sweeps)} / ${number(final?.requested_sweeps)}`], ['Stop reason', metrics?.stop_reason ? readable(metrics.stop_reason) : '—'], ['Replicas', number(replicas.length)], ['Final energy', number(final?.energy, 4)], ['Final replicas: single / multi / empty', `${replicas.filter(r => r.length === 1).length} / ${replicas.filter(r => r.length > 1).length} / ${replicas.filter(r => !r.length).length}`], ['CPU sampler wall time', ms(metrics?.t_solve_ms)], ['JIT warm-up (once)', ms(warmupMs)]]}/>
      {head('ORBIT hardware (study)')}
      <p>Photonic QRNG with real-time certified entropy driving electronic p-bits. Up to 32,000 logical p-bits with arbitrary connectivity; about 1.6 pJ per p-bit update.</p>
      <p className="tech-caveat">This demo runs a CPU emulator. No hardware is connected and no hardware timing is claimed here.</p>
    </>;
  }
  if (id === 'clearance') return <>
    {head('Independent verification')}
    <p>The decoded route is re-checked on continuous spherical arcs with exact occupation times. Low QUBO energy never issues a clearance by itself.</p>
    <Rows rows={[['Outcome', record ? readable(record.outcome) : '—'], ['Complexity C_N', number(metrics?.c_n, 1)], ['Lateral / vertical part', `${number(metrics?.c_n_lateral, 1)} / ${number(metrics?.c_n_vertical, 1)}`], ['Arrival deviation', minutes(metrics?.arrival_dev_min)], ['Build / sample / verify', `${seconds(metrics?.t_build_ms)} / ${seconds(metrics?.t_solve_ms)} / ${seconds(metrics?.t_verify_ms)}`], ['Attempts', record?.attempts.map(a => `${a.number}: ${readable(a.outcome)}`).join(' · ') ?? '—']]}/>
    <p className="tech-caveat">Simulated datalink. No external transmission.</p>
  </>;
  if (id === 'study') return <>
    {head('Study setup')}
    <Rows rows={[['Instances', '60 presented (SESAR paper: 63)'], ['Flights per instance', '30 eastbound'], ['Skeleton', 'K = J = 1 (minimal)'], ['Weights', 'w_θ = 2, w_χ = 1, p = 2'], ['Sampler', '200,000 sweeps, β 10⁻⁴ → 32'], ['Runs per instance', '10; lowest-energy feasible reported']]}/>
    <StudyTable/>
    <p>The 4 unsolved SESAR instances had a conflict on the fixed final edge. Temporal separation was provably impossible there: the formulation was too tight, not the optimiser.</p>
    <p className="tech-caveat">The deck also reports the first eastbound conflict solving in under 3 s on ORBIT versus over 1 hour on the author’s laptop. That is not a tuned classical baseline.</p>
  </>;
  const insertion = (r: InsertionRecord) => (r.metrics.t_build_ms ?? 0) + (r.metrics.t_solve_ms ?? 0) + (r.metrics.t_verify_ms ?? 0);
  const runs = data.history;
  return <>
    {head('This demo vs the study')}
    <table className="tech-table compare"><thead><tr><th/><th>Demonstrator</th><th>Study</th></tr></thead><tbody>
      <tr><th>Solver</th><td>CPU p-bit emulator</td><td>ORBIT hardware</td></tr>
      <tr><th>Encoding</th><td>Candidate-path QUBO</td><td>Full edge / slack</td></tr>
      <tr><th>Weather</th><td>Synthetic</td><td>ERA5</td></tr>
      <tr><th>Per insertion</th><td>{runs.length ? seconds(runs.reduce((s, r) => s + insertion(r), 0) / runs.length) : '—'} measured</td><td>≈1.3 s to best</td></tr>
    </tbody></table>
    <p className="tech-caveat">Exhausting the bounded candidate library is not proof of infeasibility. All traffic is synthetic; this is not an operational ATC system.</p>
  </>;
}
