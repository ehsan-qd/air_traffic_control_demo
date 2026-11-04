import { Activity, ArrowUpRight, Check, CheckCircle2, Circle, Cpu, ShieldCheck } from 'lucide-react';
import type { InsertionRecord, Metrics, ProgressView, SolveView, StepView } from '../api/types.gen';
import { ms, number, readable } from './format';
export function Metric({ label, value, note, good = false }: { label: string; value: string | number; note?: string; good?: boolean }) {
  return <div className={`metric ${good ? 'good' : ''}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
export function EnergyChart({ trace }: { trace: ProgressView[] }) {
  const energies = trace.map(p => p.energy), min = Math.min(...energies), max = Math.max(...energies);
  const first = trace[0]?.sweep ?? 0, last = trace.at(-1)?.sweep ?? 1;
  const x = (p: ProgressView) => 5 + (p.sweep - first) / Math.max(1, last - first) * 288;
  const energyY = (p: ProgressView) => 75 - (p.energy - min) / Math.max(0.001,max-min) * 62;
  const maxBeta = Math.max(1, ...trace.map(p => p.beta));
  const energy = trace.map((p,i) => `${i?'L':'M'}${x(p)},${energyY(p)}`).join(' ');
  const beta = trace.map((p,i) => `${i?'L':'M'}${x(p)},${75 - p.beta/maxBeta*62}`).join(' ');
  return <div className="energy-chart"><svg viewBox="0 0 300 90" role="img" aria-label={trace.length ? 'Measured sampler energy and beta over sweeps' : 'Waiting for measured sampler energy'}>
    {[15,45,75].map(y => <line key={y} x1="0" x2="300" y1={y} y2={y} className="chart-grid"/>)}
    {trace.length > 0 ? <><path d={beta} className="beta-trace"/><path d={energy} className="energy-trace"/><circle cx={x(trace.at(-1)!)} cy={energyY(trace.at(-1)!)} r="3" fill="var(--cyan-bright)"/></> : <text x="150" y="49" textAnchor="middle">Awaiting sampler telemetry</text>}
  </svg><div className="chart-legend"><span>— ENERGY</span><span>┄ β RAMP</span><span>SWEEPS →</span></div></div>;
}
export function SolverPanel({ solve, trace, steps, record, backend }: { backend: string; solve: SolveView | null; trace: ProgressView[]; steps: StepView[]; record: InsertionRecord | null }) {
  const progress = trace.at(-1);
  const metrics = record?.metrics ?? solve?.metrics;
  const completed = !!record;
  return <section className="panel solver-panel"><div className="panel-heading"><span><Cpu size={15}/> INSIDE ORBIT</span><span className="tiny-tag">{backend === 'pbit_emulator' ? 'CPU EMULATOR' : 'BACKEND UNAVAILABLE'}</span></div>
    <div className="solver-title"><h2>{completed ? record.verified ? 'Verified solution' : 'Controller attention' : solve ? 'Annealing a way through.' : 'Ready for the next flight.'}</h2><p>{solve ? `${solve.callsign} · Attempt ${solve.attempt} · ${solve.reason}` : 'File a crossing flight to watch the real p-bit sampler resolve its route.'}</p></div>
    <div className="anneal-values"><div><span>β</span><strong>{number(progress?.beta, 2)}</strong></div><div><span>ENERGY</span><strong>{number(progress?.energy, 4)}</strong></div><div><span>CPU SOLVE</span><strong>{ms(completed ? metrics?.t_solve_ms : progress?.elapsed_ms)}</strong></div></div>
    <EnergyChart trace={trace}/>
    <div className="sweep-progress"><div style={{ width: `${progress ? Math.min(100,progress.sweep / progress.requested_sweeps * 100) : 0}%` }}/></div>
    <div className="sweep-caption"><span>{progress ? `Sample at ${number(progress.sweep)} / ${number(progress.requested_sweeps)} sweeps` : 'No solve started'}</span><span>{completed ? readable(metrics?.stop_reason ?? record.outcome) : progress ? `${progress.active_candidates.length} replicas` : 'STREAMED STATE'}</span></div>
    <div className="pipeline">{steps.length ? steps.map(step => <div key={step.name} className={step.status}><span>{step.status === 'done' ? <Check size={13}/> : step.status === 'running' ? <Activity size={13}/> : <Circle size={13}/>}</span><div>{step.name}<small>{step.detail}</small></div><em>{step.duration_ms == null ? 'LIVE' : ms(step.duration_ms)}</em></div>) : <div className="pipeline-ready"><Circle size={12}/> Predict → encode → anneal → verify</div>}</div>
    <div className="basis-note"><span className="status-dot"/>Candidate-path QUBO · reduced bounded basis</div>
  </section>;
}
export function Clearance({ record, compact = false }: { record: InsertionRecord | null; compact?: boolean }) {
  if (!record) return <section className="panel clearance waiting"><div className="panel-heading"><span><ShieldCheck size={15}/> OCEANIC CLEARANCE</span><span className="tiny-tag">AWAITING VERIFICATION</span></div><p>A clearance appears here only after the independent verifier passes.</p></section>;
  return <section className={`panel clearance ${record.verified ? 'verified' : 'held'} ${compact ? 'compact' : ''}`}><div className="panel-heading"><span>{record.verified ? <CheckCircle2 size={15}/> : <Activity size={15}/>} {record.verified ? 'VERIFIED CLEARANCE' : 'NO CLEARANCE ISSUED'}</span><span className="tiny-tag">{readable(record.outcome).toUpperCase()}</span></div>
    <div className="clearance-recipient"><strong>{record.callsign}</strong><span>{record.verified ? 'Independent separation check passed' : 'Held for controller attention'}</span></div>
    {record.verified ? <div className="clearance-text">{record.message.map((line,i) => <p key={i}>{line}</p>)}</div> : <p className="held-message">{record.message.join(' ') || 'No verified candidate was found in the bounded basis.'}</p>}
    <div className="clearance-footer"><span><ShieldCheck size={12}/> {record.verified ? 'ENERGY ≠ SAFETY · VERIFIED INDEPENDENTLY' : 'BOUNDED SEARCH DOES NOT PROVE GLOBAL INFEASIBILITY'}</span><ArrowUpRight size={14}/></div>
  </section>;
}
export function SolveMetrics({ metrics }: { metrics?: Metrics }) {
  return <div className="solve-metrics"><Metric label="BINARY VARIABLES" value={number(metrics?.n_vars)} note="Candidate trajectory bits"/><Metric label="BUILD / VERIFY" value={`${ms(metrics?.t_build_ms)} / ${ms(metrics?.t_verify_ms)}`} note="Measured on this machine"/><Metric label="COMPLEXITY Cₙ" value={number(metrics?.c_n, 1)} note={`Lateral ${number(metrics?.c_n_lateral,1)} · vertical ${number(metrics?.c_n_vertical,1)}`}/><Metric label="ARRIVAL DEVIATION" value={metrics?.arrival_dev_min == null ? '—' : `${number(metrics.arrival_dev_min,2)} min`} note="Against filed schedule"/></div>;
}
