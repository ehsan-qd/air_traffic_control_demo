import { ArrowDown, ArrowUp, CheckCircle2, Clock3, GitBranch, Radio, ShieldCheck } from 'lucide-react';
import type { InsertionRecord, SolveView, WorldView } from '../api/types.gen';
import { number, utc, ms } from './format';
import { peakSigned } from './ChoiceLattice';
export function resolutionDescription(record:InsertionRecord):string {
  if(!record.verified)return 'Held · no clearance issued';
  const lateral=record.metrics.c_n_lateral??0,vertical=record.metrics.c_n_vertical??0;
  const initial=record.trajectory?.points[0]?.[2];
  const levels=record.trajectory?.points.map(p=>p[2])??[];
  const peak=initial==null?null:levels.reduce((best,level)=>Math.abs(level-initial)>Math.abs(best-initial)?level:best,initial);
  const movement=initial!=null&&peak!=null&&peak!==initial?`${peak>initial?'Climb':'Descend'} to FL${Math.round(peak)}`:'Flight-level change';
  // The datalink wording carries the offset in NM; the skeleton spacing is not sent to the browser.
  const datalink=record.message.join(' ').match(/OFFSET (\d+) NM (LEFT|RIGHT)/);
  const offset=datalink?`${datalink[1]} NM ${datalink[2].toLowerCase()}`:`offset ${peakSigned(record.trajectory?.theta??[])>0?'right':'left'}`;
  if(lateral>0&&vertical>0)return `${movement}, ${offset}`;
  if(lateral>0)return `${offset.charAt(0).toUpperCase()+offset.slice(1)}${datalink?' offset':''}`;
  if(vertical>0)return movement;
  return record.outcome==='cleared_after_fallback'?'Entry-delay fallback verified':'Nominal route verified';
}
export function ResolutionFeed({history,world,solve,record,onSelect,hint=true}:{history:InsertionRecord[];world:WorldView;solve:SolveView|null;record:InsertionRecord|null;onSelect:(id:string)=>void;hint?:boolean}) {
  const recent=[...history].reverse().slice(0,5);
  const changed=history.filter(r=>r.verified&&(r.metrics.n_conflict_pairs??0)>0).length;
  const working=world.flights.find(f=>f.status==='solving');
  return <section className="panel resolution-feed"><div className="panel-heading"><span><Radio size={15}/> LIVE RESOLUTION FEED</span><span className="tiny-tag">{history.length} COMPLETED</span></div>
    <div className="feed-summary"><ShieldCheck size={20}/><div><strong>{number(changed)}</strong><span>conflicting insertions resolved</span></div><span className="live-pill"><i/>{world.running?'LIVE':'PAUSED'}</span></div>
    {working&&<div className="feed-working"><span className="working-orbit"/><div><strong>{working.callsign}</strong><small>{solve?.flight_id===working.id&&!record?`${number(solve.candidates.length)} candidate paths · attempt ${solve.attempt}`:'Constructing the insertion problem…'}</small></div><span>SOLVING</span></div>}
    <div className="feed-list">{recent.length?recent.map((r,i)=>{
      const chi=r.trajectory?.chi??[],climb=chi.some(c=>c>0),descent=chi.some(c=>c<0);
      const Icon=(r.metrics.c_n_lateral??0)>0?GitBranch:climb?ArrowUp:descent?ArrowDown:CheckCircle2;
      return <button className={`resolution-row ${r.verified?'passed':'not-passed'} ${i===0?'latest':''}`} key={r.id} onClick={()=>onSelect(r.flight_id)} title={`Select ${r.callsign}. ${r.message.join(' ')}`}><span className="resolution-icon"><Icon size={17}/></span><span className="resolution-content"><span><strong>{r.callsign}</strong><time>{utc(world.start_utc,r.cleared_at_s)}Z</time></span><b>{resolutionDescription(r)}</b><small>{r.metrics.n_vars===0?'Nominal route checked · sampler not required':`${number(r.metrics.n_candidates_feasible)} feasible / ${number(r.metrics.n_vars)} candidates · ${ms(r.metrics.t_solve_ms)}`}</small></span><span className="resolution-dot"/></button>;
    }):<div className="feed-empty"><Clock3 size={23}/><p>Each verified insertion lands here.{hint&&<><br/>Start the fleet demo to watch the sequence build.</>}</p></div>}</div>
    <div className="feed-footer"><span>{world.queue_size} queued</span><span>{world.insertions_cleared} insertions cleared</span><span>Independent verifier</span></div>
  </section>;
}
