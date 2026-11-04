import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Eye, Layers3, Navigation, Route, Wind } from 'lucide-react';
import type { FlightView, InsertionRecord, ProgressView, SolveView, WindGrid, WorldView } from '../api/types.gen';
import { loadWind } from '../api/client';
import { coasts, pathD, project } from '../geo/projection';
import { number } from './format';
import { useAircraftPositions } from './useAircraftPositions';
import { ChoiceLattice } from './ChoiceLattice';
import { fleetRoute, levelColour, routeBetween, visibleLabels } from './fleetGeometry';

export const coastPaths = coasts.map(points => `${pathD(points, false)} Z`);
const meridians = [-70,-60,-50,-40,-30,-20,-10,0,10].map(lon => pathD(Array.from({length:45},(_,i)=>[lon,30+i])));
const parallels = [35,40,45,50,55,60,65,70].map(lat => pathD(Array.from({length:90},(_,i)=>[-80+i,lat])));
const BaseMap = memo(function BaseMap() {
  const places = [[-63,55,'L A B R A D O R'],[-44,62,'G R E E N L A N D'],[-19,63,'ICELAND'],[-9,52,'IRELAND'],[-1,57,'UNITED KINGDOM'],[-59,45,'NEWFOUNDLAND']] as const;
  return <>
    <defs>
      <radialGradient id="oceanLight"><stop offset="0" stopColor="#153b4a" stopOpacity=".54"/><stop offset="1" stopColor="#061016" stopOpacity="0"/></radialGradient>
      <linearGradient id="landLight" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#18313b"/><stop offset="1" stopColor="#0c1b25"/></linearGradient>
      <pattern id="landTexture" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".4" fill="#5b8b9b" opacity=".19"/></pattern>
      <filter id="routeGlow"><feGaussianBlur stdDeviation="3"/></filter>
      <filter id="cyanGlow"><feGaussianBlur stdDeviation="2"/></filter>
    </defs>
    <rect width="1000" height="535" fill="url(#oceanLight)"/>
    <g className="graticule">{meridians.map((d,i)=><path d={d} key={`lon${i}`}/>)}{parallels.map((d,i)=><path d={d} key={`lat${i}`}/>)}</g>
    <g className="land">{coastPaths.map((d,i)=><g key={i}><path d={d}/><path d={d} className="land-dots"/></g>)}</g>
    <g className="map-labels">{places.map(([lon,lat,label])=><text key={label} x={project(lon,lat)[0]} y={project(lon,lat)[1]}>{label}</text>)}</g>
    <path className="fir-line" d={pathD([[-30,37],[-30,65]])}/>
    <text className="fir-region" x="403" y="140">GANDER OCEANIC</text><text className="fir-region" x="565" y="140">SHANWICK OCEANIC</text>
    <text className="ocean-name" x="500" y="465">N O R T H   A T L A N T I C</text>
    <g className="map-edge-labels"><text x="24" y="512">60°W</text><text x="480" y="512">30°W</text><text x="925" y="512">10°W</text><text x="22" y="120">60°N</text><text x="22" y="390">45°N</text></g>
    <g transform="translate(958 128)" className="compass"><circle r="20" fill="none" stroke="currentColor" strokeOpacity=".3"/><path d="M0 -13 L4 7 L0 3 L-4 7 Z"/><text y="-27">N</text></g>
  </>;
});
function WindLayer({ grid, style }: { grid: WindGrid | null; style?: React.CSSProperties }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !grid) return;
    let frame = 0;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const strokes: { x:number;y:number;xx:number;yy:number;speed:number }[]=[];
    const [lo,la,hi,lb]=grid.bounds;
    for(let row=0;row<grid.height;row++) for(let col=0;col<grid.width;col+=2) {
      const i=row*grid.width+col, lon=lo+(hi-lo)*col/(grid.width-1),lat=la+(lb-la)*row/(grid.height-1);
      const [x,y]=project(lon,lat), [xx,yy]=project(lon+grid.u_ms[i]*2000/(111320*Math.cos(lat*Math.PI/180)),lat+grid.v_ms[i]*2000/111320);
      strokes.push({x,y,xx,yy,speed:Math.hypot(grid.u_ms[i],grid.v_ms[i])});
    }
    const render=(time:number)=>{
      ctx.clearRect(0,0,1000,535);
      for (const {x,y,xx,yy,speed} of strokes) {
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);
        ctx.strokeStyle=`rgba(83,165,180,${Math.min(.3,.035+speed/470)})`;ctx.lineWidth=.7;
        ctx.setLineDash([8,16]);ctx.lineDashOffset=reduced?0:-time/150;ctx.stroke();
      }
      if(!reduced)frame=requestAnimationFrame(render);
    };
    frame=requestAnimationFrame(render);
    return ()=>cancelAnimationFrame(frame);
  },[grid]);
  return <canvas ref={canvas} width={1000} height={535} className="map-canvas wind-canvas" style={style} aria-hidden="true"/>;
}
export function Ghosts({solve,progress,compact=false}:{solve:SolveView|null;progress?:ProgressView;compact?:boolean}) {
  const paths=progress?.active_candidates.flatMap((indices,replica)=>indices.map(index=>({path:solve?.candidates[index],replica}))).filter(p=>p.path).slice(0,40)??[];
  return <g className="ghost-paths" opacity={compact?.8:.75}>{paths.map(({path,replica},i)=><path key={`${replica}-${i}`} d={pathD(path!.points)} fill="none" stroke={replica%3===0?'#d5b2ff':'#8fd8eb'} strokeWidth={compact?2:1.15} strokeOpacity={.4}/>)}</g>;
}
/** A map window in base viewBox units; height follows the 1000 × 535 aspect. */
export interface MapZoom { x:number; y:number; w:number }
export function Airspace({world,solve,progress,record,selected,onSelect,wind=true,deck=false,history=[],zoom,initialLabels=true,children}:{
  world:WorldView;solve:SolveView|null;progress?:ProgressView;record:InsertionRecord|null;selected:FlightView|null;
  onSelect:(id:string)=>void;wind?:boolean;deck?:boolean;history?:InsertionRecord[];zoom?:MapZoom|null;initialLabels?:boolean;children?:React.ReactNode;
}) {
  const interpolated=useAircraftPositions(world);
  const [grid,setGrid]=useState<WindGrid|null>(null),[windError,setWindError]=useState(false);
  const [showRoutes,setShowRoutes]=useState(true),[showWind,setShowWind]=useState(true),[showLabels,setShowLabels]=useState(initialLabels);
  const [showChoices,setShowChoices]=useState(true);
  const [levelFilter,setLevelFilter]=useState<number|null>(null);
  const bucket=Math.floor(world.sim_time_s/900)*900;
  useEffect(()=>{
    if(!wind)return;
    const abort=new AbortController();
    loadWind(bucket,abort.signal).then(g=>{setGrid(g);setWindError(false);}).catch(error=>{if(error.name!=='AbortError')setWindError(true);});
    return ()=>abort.abort();
  },[bucket,world.scenario,world.seed,wind]);
  const focusId=selected?.id??solve?.flight_id;
  const unsettled=!!solve&&!record;
  const encounters=new Set(unsettled?solve.conflicts_with:[]);
  const recentIds=new Set(history.filter(r=>r.verified).slice(-8).map(r=>r.flight_id));
  const active=interpolated.filter(f=>f.status==='active'||f.id===focusId||encounters.has(f.id));
  const visible=active.filter(f=>levelFilter===null||Math.abs(f.position.altitude_m/30.48-levelFilter)<10||f.id===focusId||encounters.has(f.id));
  const labels=visibleLabels(visible,new Set([...(focusId?[focusId]:[]),...encounters]),deck?8:19);
  const focusPath=record?.verified&&record.flight_id===selected?.id&&record.trajectory?record.trajectory:selected?.trajectory;
  const routes=useMemo(()=>world.flights.filter(f=>f.status==='active'||f.status==='cleared').map(f=>({id:f.id,level:f.filed_level_fl,status:f.status,d:fleetRoute(f),trail:f.trajectory?pathD(routeBetween(f.trajectory,world.sim_time_s-900,world.sim_time_s)):''})),[world.flights,world.sim_time_s]);
  const levelCounts=[310,330,350,370,390,410].map(level=>({level,count:world.flights.filter(f=>f.status==='active'&&Math.abs(f.position.altitude_m/30.48-level)<10).length}));
  // The same transform on the wind canvas and the SVG keeps both layers aligned while zooming.
  const scale=zoom?1000/zoom.w:1;
  const stage=zoom?{transform:`scale(${scale}) translate(${-zoom.x/10}%,${-zoom.y/5.35}%)`}:undefined;
  return <div className={`airspace fleet-map ${deck?'deck-map':''} ${zoom?'zoomed':''}`} style={{'--zoom':scale} as React.CSSProperties}>
    {wind&&showWind&&<WindLayer grid={grid} style={stage}/>}
    <svg viewBox="0 0 1000 535" style={stage} role="img" aria-label={`Spherical North Atlantic airspace. ${visible.length} displayed aircraft. Real geographic coastline. Flight colours indicate altitude.`}>
      <BaseMap/>
      <g className="tracks">{world.tracks.map(track=><g key={track.id}><path d={pathD(track.points)}/><text x={project(track.points.at(-1)![0],track.points.at(-1)![1])[0]+8} y={project(track.points.at(-1)![0],track.points.at(-1)![1])[1]}>{track.id}</text></g>)}</g>
      {showRoutes&&<g className="fleet-routes">{routes.filter(r=>levelFilter===null||r.level===levelFilter||r.id===focusId).map(r=><g key={r.id} style={{color:levelColour(r.level)}}><path d={r.d} className={`fleet-route ${r.status==='cleared'?'future':''} ${recentIds.has(r.id)?'recently-cleared':''}`}/>{r.trail&&<path d={r.trail} className="flown-trail"/>}</g>)}</g>}
      {unsettled&&solve.conflicts_with.map(id=>{const f=world.flights.find(f=>f.id===id);return f&&<path key={id} className="conflict-route" d={pathD(f.trajectory?.points??f.route)}/>;})}
      {solve&&<path className="nominal-route" d={pathD(solve.nominal.points)}/>}
      {unsettled&&<Ghosts solve={solve} progress={progress}/>}
      {focusPath&&<><path d={pathD(focusPath.points)} className="cleared-glow"/><path d={pathD(focusPath.points)} className="cleared-route"/>{focusPath.points.map((p,i)=><circle key={i} cx={project(p[0],p[1])[0]} cy={project(p[0],p[1])[1]} r="1.9" className="waypoint"/>)}</>}
      <g className="aircraft">{visible.map(f=>{
        const p=f.position,[x,y]=project(p.lon,p.lat),focus=f.id===focusId,conflict=encounters.has(f.id),recent=recentIds.has(f.id);
        const bearing=p.heading_deg*Math.PI/180,next=project(p.lon+.1*Math.sin(bearing)/Math.cos(p.lat*Math.PI/180),p.lat+.1*Math.cos(bearing));
        const angle=Math.atan2(next[0]-x,y-next[1])*180/Math.PI;
        return <g key={f.id} className={`plane ${focus?'focused':''} ${conflict?'conflicted':''} ${recent?'resolved':''}`} style={{color:conflict?'#f0ae6b':levelColour(p.altitude_m/30.48)}} transform={`translate(${x},${y})`} onClick={()=>onSelect(f.id)} role="button" tabIndex={0} aria-label={`Select ${f.callsign}, flight level ${Math.round(p.altitude_m/30.48)}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(f.id);}}}>
          <title>{`${f.callsign} · FL${number(p.altitude_m/30.48)} · ${f.status}${conflict?' · predicted conflict participant':''}`}</title><circle className="plane-hit" r="12"/>
          {conflict&&<><circle className="encounter-halo" r="20"/><circle className="encounter-ring" r="14"/></>}
          {focus&&<circle className="plane-ring" r="13"/>}{recent&&!focus&&<circle className="resolved-ring" r="8"/>}
          <path className="aircraft-symbol" d="M0 -7 L1.5 -1 L7 2 L7 3.5 L1 2 L1 6 L3 7.5 L-3 7.5 L-1 6 L-1 2 L-7 3.5 L-7 2 L-1.5 -1 Z" transform={`rotate(${angle}) scale(${focus?1:.65})`}/>
          {(focus||conflict||(showLabels&&labels.has(f.id)))&&<g className="plane-label"><text x="12" y="-8">{f.callsign}</text><text className="plane-level" x="12" y="3">{`FL${number(p.altitude_m/30.48)}${focus?` / ${f.status.toUpperCase()}`:''}`}</text></g>}
        </g>;
      })}</g>
      {children}
    </svg>
    {!deck&&<><div className="map-title-overlay"><span className="eyebrow"><i/> OCEANIC OPERATIONS / EASTBOUND</span><h2>The Atlantic. In motion.</h2><p>{world.flights.filter(f=>f.status==='active').length} airborne · {world.tracks.length} organised tracks · live spherical positions</p></div>
    <div className="map-layer-controls"><button className={showRoutes?'on':''} onClick={()=>setShowRoutes(!showRoutes)} aria-pressed={showRoutes} title="Show actual filed and cleared routes"><Route size={14}/><span>Routes</span></button><button className={showWind?'on':''} onClick={()=>setShowWind(!showWind)} aria-pressed={showWind}><Wind size={14}/><span>Wind</span></button><button className={showLabels?'on':''} onClick={()=>setShowLabels(!showLabels)} aria-pressed={showLabels}><Eye size={14}/><span>Labels</span></button><button className={showChoices?'on':''} onClick={()=>setShowChoices(!showChoices)} aria-pressed={showChoices}><Layers3 size={14}/><span>Choices</span></button></div>
    {showChoices&&solve&&solve.candidates.length>0&&<div className="map-choice-overlay"><div><span>{solve.callsign} / {record?'LAST SOLVE':'CHOICE SPACE'}</span><strong>{number(solve.candidates.length)} paths</strong></div><ChoiceLattice solve={solve} progress={progress} compact/></div>}
    {selected&&<div className="selected-flight-overlay"><div><Crosshair size={13}/><span>TRACKING</span><strong>{selected.callsign}</strong><span className={`flight-status-${selected.status}`}>{selected.status.toUpperCase()}</span></div><p><b>FL{number(selected.position.altitude_m/30.48)}</b><span>{selected.aircraft_type}</span><span>{number(selected.position.ground_speed_ms/.514444)} KT</span><span>M{selected.mach.toFixed(2)}</span></p></div>}
    <div className={`encounter-overlay ${unsettled&&solve.conflicts_with.length?'has-encounter':''}`}><span>{unsettled?'INSERTION IN PROGRESS':record?.verified?'LATEST INSERTION VERIFIED':'INDEPENDENT SEPARATION MONITOR'}</span><strong>{unsettled?`${solve.callsign} · ${solve.conflicts_with.length} conflict participant${solve.conflicts_with.length===1?'':'s'}`:record?.verified?`${record.callsign} · cleared`:`${world.separation_losses} separation losses`}</strong><small>{unsettled?`${number(solve.metrics.n_conflict_pairs)} conflicting sub-arc pairs · attempt ${solve.attempt}`:record?.verified?'Cleared path independently checked':'Actual flight positions checked every tick'}</small></div>
    <div className="altitude-legend"><span><Layers3 size={11}/> FLIGHT LEVEL</span>{levelCounts.map(({level,count})=><button key={level} className={levelFilter===level?'active':''} style={{'--level-colour':levelColour(level)} as React.CSSProperties} onClick={()=>setLevelFilter(levelFilter===level?null:level)} aria-pressed={levelFilter===level} aria-label={`Filter flight level ${level}`}><i/>{level}<b>{count}</b></button>)}{levelFilter!==null&&<button onClick={()=>setLevelFilter(null)}>All</button>}</div></>}
    <div className="map-caption"><span><Navigation size={9}/> ORTHOGRAPHIC · NATURAL EARTH COASTLINE</span>{wind&&<span title="Synthetic backend wind. Animated dashes show direction, not elapsed travel time. Planning wind is frozen at each flight’s entry time.">{windError?'WIND FIELD UNAVAILABLE':`SYNTHETIC WIND / FL${grid?.level_fl??'—'}`}</span>}<span>15 MIN FLOWN TRAILS · ALTITUDE COLOUR</span></div>
  </div>;
}
