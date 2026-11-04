import { useMemo } from 'react';
import type { ProgressView, SolveView } from '../api/types.gen';
import { number } from './format';
export function peakSigned(values:number[]):number { return values.reduce((peak,value)=>Math.abs(value)>Math.abs(peak)?value:peak,0); }
export function choiceBins(solve:SolveView,progress?:ProgressView) {
  const active=new Set(progress?.active_candidates.flat()??[]);
  const bins=new Map<string,{theta:number;chi:number;total:number;feasible:number;sampled:number}>();
  for(let i=0;i<solve.candidates.length;i++) {
    const path=solve.candidates[i],theta=peakSigned(path.theta),chi=peakSigned(path.chi),key=`${theta},${chi}`;
    const bin=bins.get(key)??{theta,chi,total:0,feasible:0,sampled:0};
    bin.total++;if(solve.candidate_feasible[i])bin.feasible++;if(active.has(i))bin.sampled++;
    bins.set(key,bin);
  }
  return [...bins.values()];
}
export function ChoiceLattice({solve,progress,compact=false}:{solve:SolveView;progress?:ProgressView;compact?:boolean}) {
  const bins=useMemo(()=>choiceBins(solve,progress),[solve,progress]);
  const theta=[...new Set(bins.map(b=>b.theta))].sort((a,b)=>a-b),chi=[...new Set(bins.map(b=>b.chi))].sort((a,b)=>b-a);
  if(!bins.length)return null;
  const sign=(n:number)=>n>0?`+${n}`:String(n);
  return <div className={`choice-lattice ${compact?'compact':''}`}>
    <div className="lattice-heading"><span>VERTICAL × LATERAL CHOICES</span><small>feasible / total paths</small></div>
    <div className="lattice-grid" style={{gridTemplateColumns:`${compact?17:25}px repeat(${theta.length},minmax(0,1fr))`}}><span className="lattice-axis">χ / θ</span>{theta.map(t=><span className="lattice-column" key={t}>{sign(t)}</span>)}
      {chi.map(c=><div className="lattice-row" key={c}><span className="lattice-row-label">{sign(c)}</span>{theta.map(t=>{
        const bin=bins.find(b=>b.theta===t&&b.chi===c);
        return <div key={t} className={`lattice-cell ${bin?.feasible?'feasible':'infeasible'} ${bin?.sampled?'sampled':''}`} title={`Peak signed offsets: lateral ${t}, vertical ${c}. ${bin?.feasible??0} feasible of ${bin?.total??0} candidates; ${bin?.sampled??0} active candidate bits.`}>
          {bin?<><strong>{number(bin.feasible)}<em>/{number(bin.total)}</em></strong>{!compact&&<small>{bin.sampled?`${bin.sampled} sampled`:'candidate paths'}</small>}{bin.sampled>0&&<i/>}</>:<strong>—</strong>}
        </div>;
      })}</div>)}
    </div><p>Peak signed skeleton steps · amber = sampled alternatives</p>
  </div>;
}
