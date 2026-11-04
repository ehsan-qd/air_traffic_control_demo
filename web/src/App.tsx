import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CirclePause, FastForward, Globe2, History as HistoryIcon, Layers3, LoaderCircle, Maximize2, Minimize2, Pause, Plane, Play, Repeat2, RotateCcw, SkipForward, X } from 'lucide-react';
import { connect, control, resync } from './api/client';
import { liveEnabled } from './api/runtime';
import { replay, stopAll } from './replay/player';
import { getView, useDemo, type Screen } from './store/useDemo';
import { ControlRoom } from './screens/ControlRoom';
import { InsideOrbit } from './screens/InsideOrbit';
import { FlightDeck } from './screens/FlightDeck';
import { History } from './components/History';
import { utc } from './components/format';
import type { ControlRequest } from './api/types.gen';
import { useStudyLoop } from './study/useStudyLoop';
import { StudyLoop } from './study/StudyLoop';
import { Intro } from './study/Intro';
import './study/story.css';

const screens = [{ id: 'control', label: 'Control room', icon: Globe2 }, { id: 'inside', label: 'Inside ORBIT', icon: Layers3 }, { id: 'deck', label: 'Flight deck', icon: Plane }] as const;
const scenarios = [{id:'study_loop',name:'Study loop · scripted'},{id:'fleet_showcase',name:'Atlantic fleet'},{ id:'hero_crossing', name:'Hero crossing' },{ id:'calm',name:'Calm traffic' },{ id:'busy',name:'Busy traffic' },{ id:'paper_worst_case',name:'Same-track challenge' },{ id:'tight_skeleton',name:'Tight skeleton / fallback' },{ id:'stress',name:'Stress test' }];
export default function App() {
  const state = useDemo();
  const studyLoop = useStudyLoop();
  const { active: studyActive } = studyLoop;
  const world = state.world;
  const displayedWorld = getView(state).world;
  const [historyOpen,setHistoryOpen] = useState(false);
  const [scenario,setScenario] = useState('fleet_showcase');
  const [pending,setPending] = useState(false);
  const [fullscreen,setFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  // The overview is the front door; the full control room is one click (or #explore) away.
  const [explore,setExplore] = useState(() => liveEnabled && location.hash === '#explore');
  useEffect(() => { window.history.replaceState(null, '', explore ? '#explore' : location.pathname + location.search); }, [explore]);
  useEffect(() => connect(), []);
  // The overview and walkthrough play the recorded run; only the explorer talks to the backend.
  const studyRef = useRef(studyActive);
  studyRef.current = studyActive;
  useEffect(() => {
    const store = useDemo.getState();
    if (explore) { stopAll(); store.setSource('live'); resync(); return; }
    store.setSource('replay');
    if (!studyRef.current) void replay.ambient();
  }, [explore]);
  useEffect(() => { if (world?.scenario) setScenario(world.scenario); }, [world?.scenario]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,select,textarea,button,a') || e.ctrlKey || e.metaKey || e.altKey) return;
      const current = useDemo.getState();
      // The walkthrough owns its own keys; the overview has none.
      if (studyActive || !explore) return;
      if (['1','2','3'].includes(e.key)) current.setScreen(screens[Number(e.key)-1].id);
      if (e.code === 'Space' && current.world && !current.inspectionId && current.connection === 'online') { e.preventDefault(); void control({ action: current.world.running ? 'pause' : 'play' }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [studyActive, explore]);
  async function act(request: ControlRequest) { setPending(true); await control(request); setPending(false); }
  const inserting = world?.flights.some(f => f.status === 'solving') ?? false;
  async function startFleet() {
    setPending(true);
    if (await control({action:'reset',scenario:'fleet_showcase'})) { state.setScreen('control'); await control({action:'play'}); }
    setPending(false);
  }
  const disabled = state.connection !== 'online' || pending || !!state.inspectionId;
  async function exitStudy(target: 'intro' | 'explore') {
    await studyLoop.stop();
    if (target === 'explore') setExplore(true);
    else void replay.ambient();
  }
  function startStudy(mode: 'present' | 'auto') { setExplore(false); window.scrollTo(0, 0); void studyLoop.start(mode); }
  return <div className={`app-shell ${studyLoop.active ? 'study-shell' : !explore ? 'intro-shell' : state.screen === 'control' ? 'fleet-shell' : ''}`}><header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); if (studyLoop.active) void exitStudy('intro'); else setExplore(false); }} aria-label="Demonstrator overview"><img className="brand-logo" src="/images/QuantumDiceLogoRGB%20transparent__white%20gradient.png" alt="Quantum Dice"/><span className="brand-divider"/><span>NORTH ATLANTIC<br/><strong>DECONFLICTION DEMONSTRATOR</strong></span></a><div className="topbar-status">{explore && !studyLoop.active && <span className={`connection ${state.connection}`}><i/>{state.connection === 'online' ? 'LOCAL BACKEND' : state.connection === 'connecting' ? 'CONNECTING' : 'RECONNECTING'}</span>}<button className="fullscreen-toggle" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'} title={fullscreen ? 'Exit full screen' : 'Full screen'}>{fullscreen ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</button></div></header>
    <main>{studyLoop.active ? <><StudyLoop director={studyLoop} onExit={target => void exitStudy(target)}/>{state.error && <div role="alert" className="error-banner"><CirclePause size={17}/><span>{state.error}</span></div>}</> : !explore ? <Intro onStart={startStudy} disabled={!world || pending}/> : <><div className="workspace-heading"><div><span className="eyebrow">ORBIT / LIVE FLEET OPERATIONS</span><h1>An ocean of possibilities.</h1><p>A moving Atlantic fleet. Thousands of candidate paths. One verified clearance at a time.</p></div><div className="clock-block"><span>SIMULATION TIME / UTC</span><strong>{displayedWorld ? utc(displayedWorld.start_utc,displayedWorld.sim_time_s) : '--:--:--'}<small>Z</small></strong><span className={world?.frozen_for_solve ? 'warning-text' : ''}>{state.inspectionId ? 'INSPECTING A SNAPSHOT' : world?.frozen_for_solve ? 'SKY FROZEN · INSERTION IN PROGRESS' : world?.running ? `RUNNING AT ${world.speed}×${inserting ? ' · SOLVER ACTIVE' : ''}` : 'PAUSED · READY WHEN YOU ARE'}</span></div></div>
    <section className="study-launch"><div><strong>New to the demonstrator?</strong><p>A seven-scene walkthrough: the ask → the conflict → the options → ORBIT decides → the clearance → the study → what’s next.</p></div><button className="primary-button" disabled={state.connection !== 'online' || pending} onClick={() => startStudy('present')}><Repeat2 size={15}/> Guided walkthrough<ArrowRight size={15}/></button></section>
    <div className="workspace-toolbar"><nav aria-label="Demonstrator screens">{screens.map(({id,label,icon: Icon},i) => <button key={id} aria-current={state.screen === id ? 'page' : undefined} className={state.screen === id ? 'active' : ''} onClick={() => state.setScreen(id as Screen)}><Icon size={15}/>{label}<kbd>{i+1}</kbd></button>)}</nav><div className="simulation-controls"><button className="transport" disabled={disabled} onClick={() => void act({ action: world?.running ? 'pause' : 'play' })} aria-label={world?.running ? 'Pause simulation' : 'Play simulation'} title="Space"><span>{world?.running ? <Pause size={14}/> : <Play size={14}/>}</span>{world?.running ? 'Pause' : 'Play'}</button><button className="icon-button" title="Step one simulation tick" aria-label="Step simulation" disabled={disabled || world?.running || inserting} onClick={() => void act({action:'step'})}><SkipForward size={15}/></button><label className="speed-select"><FastForward size={13}/><select aria-label="Simulation speed" value={world?.speed ?? 60} disabled={disabled} onChange={e => void act({action:'speed',speed:Number(e.target.value)})}>{[1,10,60,300].map(speed => <option value={speed} key={speed}>{speed}×</option>)}</select></label></div></div>
    <div className="scenario-toolbar"><div className="scenario-choice"><span>SCENARIO</span><select aria-label="Scenario" value={scenario} disabled={disabled || inserting} onChange={e => setScenario(e.target.value)}>{scenarios.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select><button disabled={disabled || inserting} onClick={() => void act({action:'reset',scenario})} title="Reset simulation to the selected scenario"><RotateCcw size={13}/><span>{scenario === world?.scenario ? 'Reset' : 'Load scenario'}</span></button></div><div className="filing-actions"><button className="quiet-button" disabled={disabled} onClick={() => void act({action:'file_flight',conflict:true})}>File crossing flight<ArrowRight size={15}/></button><button className="primary-button fleet-start" disabled={disabled || inserting} onClick={() => void startFleet()}><Play size={13}/>{pending ? 'Preparing…' : 'Start fleet demo'}<ArrowRight size={15}/></button></div></div>
    {state.error && <div role="alert" className="error-banner"><CirclePause size={17}/><span>{state.error}</span><button aria-label="Dismiss alert" onClick={() => useDemo.setState({error:null})}><X size={15}/></button></div>}
    {state.connection === 'offline' && <div className="offline-banner" role="status">Connection lost. Displaying the last received state. Reconnecting to the local backend…</div>}
    {state.inspectionId && <div className="top-inspection"><HistoryIcon size={14}/><span>Snapshot inspection · live controls paused</span><button onClick={() => state.inspect(null)}>Return to live<ArrowRight size={13}/></button></div>}
    {!world ? <section className="loading-panel"><LoaderCircle size={30}/><h2>Connecting to the North Atlantic.</h2><p>Waiting for the local FastAPI simulation on port 8765.</p><code>make dev</code></section> : <>{state.screen === 'control' ? <ControlRoom/> : state.screen === 'inside' ? <InsideOrbit/> : <FlightDeck/>}<History open={historyOpen} setOpen={setHistoryOpen}/></>}
    </>}<footer><span>{liveEnabled && !explore && !studyLoop.active && <button className="footer-explore" onClick={() => setExplore(true)}>Explore the live system<ArrowRight size={14}/></button>}{!liveEnabled && <><a href="/presentation">Presentation</a> · <a href="/demo">Reference lab</a> · <a href="/loop_demo">TV loop</a></>}</span><span>{world?.backend === 'pbit_emulator' ? 'p-bit emulator (CPU)' : `Backend unavailable: ${world?.backend ?? 'connecting'}`} <b>/</b> Reduced candidate-path QUBO <b>/</b> Synthetic weather & traffic</span></footer></main></div>;
}
