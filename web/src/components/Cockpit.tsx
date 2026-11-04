import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Eye, Globe2, Navigation, Pause, Play, Repeat2, RotateCcw } from 'lucide-react';
import type { FlightView, InsertionRecord, PathView, SolveView, WorldView } from '../api/types.gen';
import { greatCircle, pathD, project } from '../geo/projection';
import { coastPaths } from './Airspace';
import { RouteProfiles } from './RouteProfiles';
import { number, utc } from './format';
import { committedTraffic, relativePoint, routePhase, routePosition, type RoutePosition } from './cockpitModel';
import { outsideScenery, routeCamera } from './cockpitCamera';
import { useAircraftPositions } from './useAircraftPositions';
import './cockpit.css';

function densePoints(path: PathView) {
  return path.points.flatMap((point,i) => i === 0 ? [point] : Array.from({ length:8 }, (_,j) => {
    const fraction = (j + 1) / 8;
    return [...greatCircle(path.points[i-1], point, fraction), path.points[i-1][2] + (point[2] - path.points[i-1][2]) * fraction];
  }));
}

function forwardPath(path: PathView, own: RoutePosition) {
  let started = false;
  return densePoints(path).map(point => {
    const local = relativePoint(own, point);
    if (local.ahead < 4 || local.distance > 480) { started = false; return ''; }
    const x = 500 + local.right * 850 / (local.ahead + 25);
    // Vertical exaggeration makes the small cruise-level changes visible.
    const y = 245 - local.aboveFt / 6076.12 * 850 * 8 / (local.ahead + 25);
    const command = started ? 'L' : 'M'; started = true;
    return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function NavigationDisplay({ own, path, nominal, traffic }: { own:RoutePosition; path:PathView; nominal:PathView|null; traffic:ReturnType<typeof committedTraffic> }) {
  const clip = useId().replaceAll(':','');
  const project = (point:number[]) => { const p = relativePoint(own, point); return [200 + p.right / 400 * 170, 275 - p.ahead / 400 * 230]; };
  const line = (route:PathView) => densePoints(route).map((point,i) => `${i?'L':'M'}${project(point).map(n=>n.toFixed(2)).join(',')}`).join(' ');
  return <section className="cockpit-navigation" aria-label="Cockpit navigation display"><div className="cockpit-display-title"><Navigation size={15}/><span>TRACK UP / 400 NM</span><b>ROUTE PLAN</b></div><svg viewBox="0 0 400 320" role="img" aria-label="Navigation display comparing filed and cleared routes ahead">
    <defs><clipPath id={clip}><rect x="15" y="15" width="370" height="290" rx="8"/></clipPath></defs>
    <g clipPath={`url(#${clip})`}>
      {[100,200,300,400].map(range => <g key={range}><circle cx="200" cy="275" r={range / 400 * 230} className="cockpit-range"/><text x="207" y={275 - range / 400 * 230 + 17}>{range}</text></g>)}
      <path d="M200 10V295 M20 275H380" className="cockpit-range"/>
      {nominal && <path className="cockpit-filed" d={line(nominal)}/>}
      <path className="cockpit-cleared" d={line(path)}/>
      {path.points.map((point,i) => { const [x,y] = project(point); return <g key={i} transform={`translate(${x} ${y})`}><path d="M0 -4L4 0L0 4L-4 0Z" className="cockpit-waypoint"/><text x="8" y="-5">W{i.toString().padStart(2,'0')}</text></g>; })}
      {traffic.map(flight => { const [x,y] = project([flight.position.lon,flight.position.lat,flight.position.level]); const delta = Math.round((flight.position.level - own.level)); return <g key={flight.id} transform={`translate(${x} ${y})`} className="cockpit-traffic"><path d="M0 -4L4 0L0 4L-4 0Z"/><text x="8" y="-5">{delta >= 0 ? '+' : ''}{delta}</text></g>; })}
    </g>
    <path d="M200 260L207 285L200 280L193 285Z" className="cockpit-ownship"/>
    <text x="20" y="310">HDG {number(own.heading).padStart(3,'0')}°</text><text x="272" y="310">GS {number(own.groundSpeedKt)} KT</text>
  </svg><div className="cockpit-route-key"><span><i/> Cleared</span><span className="filed"><i/> Filed</span><span>Traffic Δ in 100 ft</span></div></section>;
}

const ARROW = 'M0 -11L8 9L0 4L-8 9Z';
/** Places an arrow on the map, turned to the heading as it appears in the projection. */
function arrowAt(p: { lon:number; lat:number; heading:number }, scale = 1) {
  const h = p.heading * Math.PI / 180;
  const [x, y] = project(p.lon, p.lat);
  const [ax, ay] = project(p.lon + Math.sin(h) * .5 / Math.cos(p.lat * Math.PI / 180), p.lat + Math.cos(h) * .5);
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(Math.atan2(ax - x, y - ay) * 180 / Math.PI).toFixed(1)}) scale(${scale})`;
}

function FleetMap({ own, callsign, path, nominal, traffic }: { own:RoutePosition; callsign:string; path:PathView; nominal:PathView|null; traffic:ReturnType<typeof committedTraffic> }) {
  const [x, y] = project(own.lon, own.lat);
  const view = useMemo(() => {
    const xy = path.points.map(p => project(p[0], p[1]));
    const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
    const w = Math.max(520, (Math.max(...xs) - Math.min(...xs)) * 1.4), h = w / 1.6;
    return `${((Math.min(...xs) + Math.max(...xs) - w) / 2).toFixed(0)} ${((Math.min(...ys) + Math.max(...ys) - h) / 2).toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`;
  }, [path]);
  return <section className="cockpit-fleet-map" aria-label="Fleet position map"><div className="cockpit-display-title"><Globe2 size={15}/><span>NORTH ATLANTIC FLEET</span><b>{traffic.length} OTHER AIRCRAFT</b></div><svg viewBox={view} role="img" aria-label={`${callsign} among ${traffic.length} other cleared aircraft`}>
    <g className="cockpit-map-land">{coastPaths.map((d,i) => <path key={i} d={d}/>)}</g>
    {nominal && <path className="cockpit-filed" d={pathD(nominal.points)}/>}
    <path className="cockpit-cleared" d={pathD(path.points)}/>
    {traffic.map(flight => <path key={flight.id} d={ARROW} transform={arrowAt(flight.position)} className="cockpit-map-traffic"/>)}
    <g className="cockpit-map-ownship"><circle cx={x} cy={y} r="22"/><path d={ARROW} transform={arrowAt(own, 1.6)}/><text x={x} y={y - 32} textAnchor="middle">{callsign}</text></g>
  </svg><div className="cockpit-route-key"><span><i/> Cleared</span><span className="filed"><i/> Filed</span><span className="traffic"><i/> Other cleared traffic</span></div></section>;
}

export function Cockpit({ world, record, solve, flight, compact=false, enabled=true, durationMs=30_000, liveAvailable=true, summary }: {
  world:WorldView; record:InsertionRecord; solve:SolveView|null; flight:FlightView|null; compact?:boolean; enabled?:boolean; durationMs?:number; liveAvailable?:boolean; summary?:ReactNode;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<'preview'|'live'>(()=>!compact && liveAvailable && flight?.status==='active' ? 'live' : 'preview');
  const [repeat, setRepeat] = useState(!compact);
  const elapsed = useRef(0);
  const viewportId = useId().replaceAll(':','');
  const path = record.verified ? record.trajectory : null;
  const selectedWorld = useMemo(()=>({...world,flights:flight?[flight]:[]}),[world,flight]);
  const liveFlight = useAircraftPositions(selectedWorld)[0] ?? flight;

  useEffect(() => {
    if (!playing || !enabled || mode !== 'preview' || !path) return;
    let last = performance.now();
    let frame:number;
    const cycleMs = durationMs + (repeat ? Math.min(1000,durationMs*.04) : 0);
    const animate = (now:number) => {
      const next = elapsed.current + now - last;
      elapsed.current = repeat ? next % cycleMs : Math.min(durationMs,next);
      last = now;
      setElapsedMs(Math.min(durationMs,elapsed.current));
      if (!repeat && elapsed.current >= durationMs) setPlaying(false);
      else frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing, enabled, mode, durationMs, path, repeat]);

  if (!path) return <div className="cockpit-empty"><Eye size={28}/><h3>Awaiting a verified route.</h3><p>A held or unverified request cannot drive the cockpit preview.</p></div>;
  const nominal = solve?.flight_id === record.flight_id ? solve.nominal : flight ? { points:flight.route.map(point => [point[0],point[1],flight.filed_level_fl]), times_s:[], theta:[], chi:[] } : null;
  const start = path.times_s[0], end = path.times_s.at(-1)!;
  const previewTime = start + (end - start) * elapsedMs / durationMs;
  const time = mode === 'live' ? world.sim_time_s : previewTime;
  const sampled = routePosition(path, time);
  if (!sampled) return <div className="cockpit-empty"><h3>Route geometry unavailable.</h3><p>The waypoint coordinates and times must form a valid trajectory.</p></div>;
  const own = mode === 'live' && liveFlight ? { ...sampled, lon:liveFlight.position.lon, lat:liveFlight.position.lat, level:liveFlight.position.altitude_m / 30.48, heading:liveFlight.position.heading_deg, groundSpeedKt:liveFlight.position.ground_speed_ms / .514444 } : sampled;
  const attitude = routeCamera(path,time,own);
  const camera = {...own,heading:mode==='preview'?attitude.heading:own.heading};
  const scenery = outsideScenery(camera);
  const worldTransform = `translate(500 245) rotate(${(-attitude.bank).toFixed(3)}) translate(0 ${(attitude.pitch*9).toFixed(3)}) translate(-500 -245)`;
  const fleet = committedTraffic(world, record.flight_id, time);
  const traffic = fleet.filter(f => relativePoint(own,[f.position.lon,f.position.lat,f.position.level]).distance < 400);
  const phase = routePhase(path, time);
  const nextIndex = Math.min(path.points.length - 1, own.segment + 1);
  const next = relativePoint(own, path.points[nextIndex]);
  const filedLevel = flight?.filed_level_fl ?? path.points[0][2];
  const peakLevel = path.points.reduce((peak,p) => Math.abs(p[2]-filedLevel) > Math.abs(peak-filedLevel) ? p[2] : peak, filedLevel);

  function seek(value:number) { elapsed.current = value; setElapsedMs(value); }
  function toggle() { if (!playing && elapsed.current >= durationMs) seek(0); setPlaying(!playing); }
  function replay() { seek(0); setMode('preview'); setPlaying(true); }

  return <section className={`cockpit ${compact ? 'cockpit-compact' : ''}`} aria-label={`Cockpit view for ${record.callsign}`}>
    <div className="cockpit-strip"><span><i/>{record.callsign} / {flight?.aircraft_type ?? 'AIRCRAFT'}</span><strong>{mode === 'preview' ? 'CLEARED ROUTE PREVIEW' : world.running ? 'LIVE AIRCRAFT' : 'LIVE AIRCRAFT · SKY PAUSED'}</strong><time>{utc(world.start_utc, Math.max(0,time))}Z</time></div>
    <div className="cockpit-instruments"><div className="cockpit-windscreen"><div className="cockpit-glass">
      <svg viewBox="0 0 1000 540" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Forward cockpit view of the verified deviation and filed route">
        <defs>
          <linearGradient id={`${viewportId}Sky`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="245"><stop stopColor="#0d263d"/><stop offset=".75" stopColor="#60899b"/><stop offset="1" stopColor="#b0c9cf"/></linearGradient>
          <linearGradient id={`${viewportId}Ocean`} gradientUnits="userSpaceOnUse" x1="0" y1="245" x2="0" y2="540"><stop stopColor="#426574"/><stop offset=".3" stopColor="#193b51"/><stop offset="1" stopColor="#061825"/></linearGradient>
          <linearGradient id={`${viewportId}Glare`} x2="0" y2="1"><stop stopColor="#364650"/><stop offset=".18" stopColor="#101b23"/><stop offset="1" stopColor="#03090e"/></linearGradient>
          <clipPath id={`${viewportId}Glass`}><path d="M85 35Q500 -5 915 35L968 421Q500 340 32 421Z"/></clipPath>
        </defs>
        <rect width="1000" height="540" fill="#050b10"/>
        <g clipPath={`url(#${viewportId}Glass)`}>
          <g className="cockpit-outside-world" transform={worldTransform} data-bank={attitude.bank.toFixed(3)} data-pitch={attitude.pitch.toFixed(3)}>
          <rect x="-1500" y="-1500" width="4000" height="1745" fill={`url(#${viewportId}Sky)`}/><rect x="-1500" y="245" width="4000" height="1600" fill={`url(#${viewportId}Ocean)`}/>
          <path d="M-1500 245H2500" className="cockpit-moving-horizon"/>
          <path d={scenery.ocean} className="cockpit-sea-flow"/>
          {scenery.clouds.map(cloud=><g key={cloud.id} transform={`translate(${cloud.x.toFixed(2)} ${cloud.y.toFixed(2)}) scale(${(cloud.size/60).toFixed(3)})`} opacity={cloud.opacity} className={`cockpit-world-cloud ${cloud.high?'high':''}`}><path d="M-80 5Q-91 -12 -65 -17Q-57 -40 -30 -28Q-10 -58 18 -31Q50 -46 64 -21Q93 -25 91 -1Q104 18 61 21H-55Q-88 22 -80 5Z"/><path d="M-73 8Q-20 -3 35 8T91 8" className="cloud-shade"/></g>)}
          {nominal && <path d={forwardPath(nominal, camera)} className="cockpit-filed forward"/>}
          <path d={forwardPath(path, camera)} className="cockpit-corridor-glow"/>
          <path d={forwardPath(path, camera)} className="cockpit-cleared forward"/>
          {path.points.map((point,i) => {
            const local = relativePoint(camera, point);
            if (local.ahead < 8 || local.distance > 450) return null;
            const x = 500 + local.right * 850 / (local.ahead + 25), y = 245 - local.aboveFt / 6076.12 * 850 * 8 / (local.ahead + 25);
            const size = Math.max(6, Math.min(26, 650 / (local.ahead + 15)));
            return <g key={i} transform={`translate(${x} ${y})`} className="cockpit-gate"><path d={`M${-size} ${-size/2}H${size}V${size/2}H${-size}Z`}/>{i === nextIndex && <text x={size + 8} y="5">WPT {String(i).padStart(2,'0')}</text>}</g>;
          })}
          </g>
          <g className="cockpit-flight-symbol"><path d="M460 275H484L500 285L516 275H540 M500 285V298"/><circle cx="500" cy="275" r="5"/></g>
          <path d="M480 235H520 M500 223V247" className="cockpit-horizon-cue"/>
          <g className="cockpit-heading-scale">{[-30,-20,-10,0,10,20,30].map(degree => <g key={degree} transform={`translate(${500+degree*7} 65)`}><path d="M0 0V8"/><text y="-10" textAnchor="middle">{number((own.heading + degree + 360) % 360).padStart(3,'0')}</text></g>)}</g>
          <path d="M493 82L500 74L507 82" fill="#b8ffe4"/>
          <text x="118" y="315" className="cockpit-glass-label">FILED FL{number(filedLevel)}</text><text x="118" y="340" className="cockpit-glass-label">{peakLevel === filedLevel ? 'LATERAL / TIMING CHANGE' : `${peakLevel > filedLevel ? 'CLIMB' : 'DESCEND'} FL${number(peakLevel)}`}</text>
        </g>
        <path d="M85 35Q500 -5 915 35L968 421Q500 340 32 421Z" fill="none" stroke="#263b49" strokeWidth="14"/>
        <path d="M704 17L717 371H737L750 17Z" fill="#111f2a" stroke="#41606d" strokeWidth="3"/>
        <path d="M0 429Q500 335 1000 429V540H0Z" fill={`url(#${viewportId}Glare)`} stroke="#3b5360" strokeWidth="3"/>
        <path d="M340 438Q500 405 660 438L686 540H314Z" fill="#080e14" stroke="#354b58" strokeWidth="2"/>
        <text x="500" y="458" textAnchor="middle" className="cockpit-console-label">ORBIT / OCEANIC ROUTE GUIDANCE</text>
        <text x="500" y="493" textAnchor="middle" className="cockpit-console-phase">{phase.toUpperCase()}</text>
        <text x="942" y="524" textAnchor="end" className="cockpit-scene-note">ROUTE-DERIVED CAMERA · ILLUSTRATIVE MOTION</text>
      </svg>
      <div className="cockpit-hud cockpit-hud-speed"><span>{mode === 'preview' ? 'PLAN GS' : 'GS'}</span><strong>{number(own.groundSpeedKt)}</strong><small>KT</small></div>
      <div className="cockpit-hud cockpit-hud-altitude"><span>FLIGHT LEVEL</span><strong>FL{number(own.level)}</strong><small>{number(own.level * 100)} FT</small></div>
    </div></div>
      {compact ? <><FleetMap own={own} callsign={record.callsign} path={path} nominal={nominal} traffic={fleet}/><div className="cockpit-profiles"><RouteProfiles path={path} nominal={nominal} own={own} filedLevel={filedLevel}/></div></> : <NavigationDisplay own={own} path={path} nominal={nominal} traffic={traffic}/>}
    </div>
    {compact && summary && <div className="cockpit-summary">{summary}</div>}
    <div className={compact ? 'cockpit-bar' : 'cockpit-readouts'}><div className="cockpit-live-data"><span><Navigation size={14}/> HDG <b>{number(own.heading).padStart(3,'0')}°</b></span><span>NEXT <b>WPT {String(nextIndex).padStart(2,'0')}</b></span><span><b>{number(next.distance,1)}</b> NM</span><span className="cockpit-phase">{phase}</span></div>
    <div className="cockpit-playback"><div className="cockpit-playback-buttons"><button onClick={toggle} disabled={mode === 'live' || !enabled} aria-label={playing ? 'Pause cockpit preview' : 'Play cockpit preview'}>{playing ? <Pause size={15}/> : <Play size={15}/>}<span>{playing ? 'Pause preview' : 'Play preview'}</span></button><button onClick={replay} disabled={!enabled} aria-label="Replay cockpit manoeuvre"><RotateCcw size={15}/> Replay</button>{!compact && <button onClick={() => setRepeat(!repeat)} aria-pressed={repeat} aria-label="Toggle cockpit preview loop"><Repeat2 size={15}/>{repeat ? 'Loop on' : 'Loop off'}</button>}{!compact && <button className={mode === 'live' ? 'active' : ''} disabled={mode !== 'live' && (!liveAvailable || flight?.status !== 'active')} onClick={() => setMode(mode === 'live' ? 'preview' : 'live')} title={flight?.status === 'active' ? 'Follow the simulation clock' : 'Available after this aircraft enters the oceanic sector'}><Eye size={15}/>{mode === 'live' ? 'Preview route' : 'Live aircraft'}</button>}</div><label><span>{mode === 'preview' ? `${number((end-start)/60)} min route in ${number(durationMs/1000)} seconds` : world.running ? 'Following the live simulation clock' : 'Live sky paused · choose Preview route or Play simulation'}</span><input type="range" min="0" max={durationMs} step="10" value={elapsedMs} disabled={mode === 'live'} onChange={e => seek(Number(e.target.value))} aria-label="Cockpit route preview position"/></label></div></div>
    <div className="cockpit-provenance"><span><i/> Verified route</span><span className="filed"><i/> Filed route</span><p>{mode === 'preview' ? 'Waypoint interpolation of this clearance. The preview does not move the live aircraft.' : 'Live aircraft position and speed from the simulation.'}{!solve && ' Filed geometry reconstructed from the filed route and level.'}</p></div>
  </section>;
}
