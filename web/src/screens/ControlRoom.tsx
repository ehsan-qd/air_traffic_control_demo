import { Activity, ArrowUpRight, Radio, Route, ShieldCheck } from 'lucide-react';
import { Airspace } from '../components/Airspace';
import { Profile } from '../components/Profile';
import { Clearance, SolverPanel } from '../components/Telemetry';
import { DecisionSpace } from '../components/DecisionSpace';
import { ResolutionFeed } from '../components/ResolutionFeed';
import { number } from '../components/format';
import { levelColour } from '../components/fleetGeometry';
import { getView, useDemo } from '../store/useDemo';

export function ControlRoom() {
  const state=useDemo();
  const {world,flight,solve,trace,record,steps,inspected}=getView(state);
  if(!world)return null;
  const progress=trace.at(-1),active=world.flights.filter(f=>f.status==='active').length;
  const history=inspected?state.history.filter(r=>r.cleared_at_s<=inspected.cleared_at_s):state.history;
  const sorting=[...world.flights].sort((a,b)=>Number(b.id===flight?.id)-Number(a.id===flight?.id)||Number(b.status==='solving')-Number(a.status==='solving'));
  return <div className="fleet-control-room"><div className="fleet-stats"><div className="fleet-status"><Radio size={17}/><span>ATLANTIC FLEET<strong>{world.running?'OPERATIONS LIVE':'READY TO RUN'}</strong></span></div><div><strong>{number(active)}</strong><span>AIRBORNE</span></div><div><strong>{number(world.flights.filter(f=>f.status==='cleared').length)}</strong><span>CLEARED AHEAD</span></div><div><strong>{number(world.insertions_cleared)}</strong><span>VERIFIED INSERTIONS</span></div><div><strong>{number(world.queue_size)}</strong><span>IN THE QUEUE</span></div><div className={world.separation_losses?'warning-text':'safe-stat'}><strong><ShieldCheck size={20}/>{world.separation_losses}</strong><span>SEPARATION LOSSES</span></div></div>
    <section className="panel fleet-sky"><div className="panel-heading sky-heading"><span><Route size={15}/> THE NORTH ATLANTIC NETWORK</span><div className="map-legend"><span className="legend-cleared">Cleared routes</span><span className="legend-conflict">Conflict participant</span><span className="legend-sampled">Sampler alternatives</span></div></div>
      <Airspace world={world} solve={solve} progress={progress} record={record} selected={flight} onSelect={state.selectFlight} history={history}/>
      <Profile solve={solve?.flight_id===flight?.id?solve:null} flight={flight} record={record?.flight_id===flight?.id?record:null} progress={solve?.flight_id===flight?.id?progress:undefined}/>
    </section>
    <div className="fleet-intelligence"><DecisionSpace solve={solve} progress={progress} record={record} onInspect={()=>state.setScreen('inside')}/><ResolutionFeed history={history} world={world} solve={solve} record={record} onSelect={state.selectFlight}/></div>
    <div className="fleet-detail-grid"><SolverPanel backend={world.backend} solve={solve} trace={trace} steps={steps} record={record}/><div className="fleet-clearance-stack"><Clearance record={record}/><button className="inside-link" onClick={()=>state.setScreen('deck')}><span>From computation to cockpit<small>Read the verified pilot instruction</small></span><ArrowUpRight size={19}/></button><div className="fleet-method-note"><Activity size={16}/><p>All traffic and weather are synthetic. Candidate paths, replica states and timings come from the live local backend. Every clearance must pass the independent verifier.</p></div></div></div>
    <section className="panel flight-strips"><div className="panel-heading"><span>FLEET REGISTER</span><span className="tiny-tag">{world.flights.length} FLIGHTS · SELECT TO TRACK</span></div><div className="flight-scroll">{sorting.map(f=><button key={f.id} className={`flight-strip ${flight?.id===f.id?'selected':''} ${f.status==='held'?'held':''}`} onClick={()=>state.selectFlight(f.id)} aria-pressed={flight?.id===f.id} style={{borderTopColor:levelColour(f.position.altitude_m/30.48)}}><div><strong>{f.callsign}</strong><span>{f.aircraft_type}</span></div><div><b style={{color:levelColour(f.position.altitude_m/30.48)}}>FL{number(f.position.altitude_m/30.48)}</b><span>M{f.mach.toFixed(2)} · {f.track_id?`TRACK ${f.track_id}`:'RANDOM'}</span></div><small><i/>{f.status.toUpperCase()}</small></button>)}</div></section>
  </div>;
}
