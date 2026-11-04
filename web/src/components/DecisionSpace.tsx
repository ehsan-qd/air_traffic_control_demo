import { memo, useMemo } from 'react';
import { ArrowUpRight, Binary, GitBranch } from 'lucide-react';
import type { InsertionRecord, ProgressView, SolveView } from '../api/types.gen';
import { ms, number } from './format';
import { ChoiceLattice } from './ChoiceLattice';

export function candidateCounts(solve:SolveView|null) {
  if (!solve) return {total:0,feasible:0,rejected:0};
  const total=solve.candidates.length,feasible=solve.candidate_feasible.filter(Boolean).length;
  return {total,feasible,rejected:total-feasible};
}
export const DecisionSpace=memo(function DecisionSpace({solve,progress,record,onInspect}:{solve:SolveView|null;progress?:ProgressView;record:InsertionRecord|null;onInspect:()=>void}) {
  const {total,feasible,rejected}=candidateCounts(solve);
  const active=useMemo(()=>new Set(progress?.active_candidates.flat()??[]),[progress]);
  const replicas=progress?.active_candidates??[];
  const single=replicas.filter(r=>r.length===1).length,multi=replicas.filter(r=>r.length>1).length,empty=replicas.filter(r=>r.length===0).length;
  const columns=66,rows=Math.max(5,Math.ceil(total/columns));
  const metrics=record?.metrics??solve?.metrics;
  return <section className="panel decision-space"><div className="panel-heading"><span><Binary size={16}/> THE DECISION SPACE</span><span className="tiny-tag">{solve?`${solve.callsign} / ATTEMPT ${solve.attempt}`:'WAITING FOR A FILING'}</span></div>
    <div className="decision-intro"><div><span>COMPLETE TRAJECTORY CANDIDATES</span><strong>{solve?number(total):'—'}</strong></div><p>One flight. Many possible ways through.<br/><b>Every dot is a real candidate path.</b></p></div>
    <div className="candidate-counts"><div className="feasible"><i/><strong>{solve?number(feasible):'—'}</strong><span>verified feasible</span></div><div className="rejected"><i/><strong>{solve?number(rejected):'—'}</strong><span>rejected by checks</span></div><div className="sampled"><i/><strong>{progress?number(active.size):'—'}</strong><span>active in last sample</span></div></div>
    {solve&&total>0&&<ChoiceLattice solve={solve} progress={progress}/>}
    <div className="candidate-matrix" aria-label={solve?`${total} candidates: ${feasible} feasible and ${rejected} rejected`:'Candidate matrix awaiting a solve'}>{total>0?<svg viewBox={`0 0 660 ${rows*8+4}`} role="img" aria-label="Actual candidate feasibility and sampled active bits"><defs><filter id="bitGlow"><feGaussianBlur stdDeviation="1.6"/></filter></defs>{solve!.candidate_feasible.map((ok,i)=><g key={i}><rect x={i%columns*10+2} y={Math.floor(i/columns)*8+2} width="5" height="4" rx=".7" className={active.has(i)?'bit-active':ok?'bit-feasible':'bit-rejected'}/><title>Candidate {i+1}: {ok?'independently feasible':'rejected'}{active.has(i)?'; active in a sampled replica':''}</title></g>)}</svg>:<div className="matrix-awaiting"><GitBranch size={25}/><span>{solve?'Nominal path verified without assembling a candidate matrix.':'Start the fleet demo to build and sample the real choice space.'}</span></div>}</div>
    <div className="replica-summary"><span>REPLICA STATE</span><div><b>{progress?single:'—'}</b> single-path <b>{progress?multi:'—'}</b> multi-hot <b>{progress?empty:'—'}</b> empty</div></div>
    <div className="decision-footer"><div><span>FROZEN TRAJECTORIES</span><strong>{number(metrics?.n_frozen)}</strong></div><div><span>CONFLICTING SUB-ARCS</span><strong>{number(metrics?.n_conflict_pairs)}</strong></div><div><span>CPU SOLVE</span><strong>{ms(record?metrics?.t_solve_ms:progress?.elapsed_ms)}</strong></div></div>
    <button className="decision-explain" onClick={onInspect}><span>Reduced bounded candidate basis <small>Inspect the actual matrix and anneal</small></span><ArrowUpRight size={18}/></button>
  </section>;
});
