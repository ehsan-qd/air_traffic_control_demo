import type { InsertionRecord, SolveView, FlightView, ProgressView } from '../api/types.gen';
import { number } from './format';
export function Profile({ solve, flight, record, progress }: { solve: SolveView | null; flight: FlightView | null; record: InsertionRecord | null; progress?: ProgressView }) {
  const trajectory = record?.verified ? record.trajectory : flight?.trajectory;
  const nominal = solve?.nominal;
  const path = trajectory ?? nominal;
  if (!path) return <div className="profile-empty">Select an aircraft to inspect its cleared waypoint levels.</div>;
  const start = path.times_s[0], duration = Math.max(1, path.times_s.at(-1)! - start);
  const x = (time: number) => 55 + (time - start) / duration * 850;
  const y = (level: number) => 114 - (level - 290) / 140 * 94;
  const draw = (p: typeof path) => p.points.map((point, i) => `${i ? 'L' : 'M'}${x(p.times_s[i])},${y(point[2])}`).join(' ');
  return <section className="profile"><div className="section-heading"><span>VERTICAL PROFILE</span><span>Waypoint levels · {flight?.callsign ?? solve?.callsign} · minutes from entry</span></div><svg viewBox="0 0 950 150" role="img" aria-label="Flight level at each trajectory waypoint">
    {[310,350,390,410].map(fl => <g key={fl}><line x1="55" x2="905" y1={y(fl)} y2={y(fl)}/><text x="5" y={y(fl)+4}>FL{fl}</text></g>)}
    {[0,.25,.5,.75,1].map(frac => <text key={frac} x={55 + frac * 850} y="141" textAnchor="middle">{number(frac * duration / 60)}</text>)}
    {nominal && <path className="profile-nominal" d={draw(nominal)}/>}
    {!record && progress?.active_candidates.flat().slice(0,40).map((index, i) => solve?.candidates[index] && <path key={i} className="profile-ghost" d={draw(solve.candidates[index])}/>)}
    {trajectory && <path className="profile-cleared" d={draw(trajectory)}/>}
    {path.points.map((p, i) => <circle key={i} cx={x(path.times_s[i])} cy={y(p[2])} r="2.5"/>)}
  </svg></section>;
}
