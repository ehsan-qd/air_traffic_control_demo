import { useId } from 'react';
import type { PathView } from '../api/types.gen';
import { number } from './format';
import { bearing, distanceNm, type RoutePosition } from './cockpitModel';

const RAD = Math.PI / 180;
// Both views share one plot frame, so the time axes line up exactly.
const W = 480, H = 170, LEFT = 50, RIGHT = 468, TOP = 14, BOTTOM = 136;
const TOP_PLANE = 'M11 0L4 -1.5L-2 -9L-5 -9L-1 -1.5L-8 -1.5L-10 -4.5L-12 -4.5L-11 0L-12 4.5L-10 4.5L-8 1.5L-1 1.5L-5 9L-2 9L4 1.5Z';
const SIDE_PLANE = 'M15 1Q13 -2.5 9 -2.5L-9 -2.5L-13 -10L-16 -10L-15 -2L-16 2.5L9 2.5Q13 2.5 15 1Z M3 0.5L-4 6.5L-7.5 6.5L-4 0.5Z';

interface Sample { t:number; offset:number; level:number }

/** Per waypoint: minutes since entry, signed cross-track offset from the filed route (NM, + right) and level. */
function profile(path: PathView, nominal: PathView | null): Sample[] {
  const ref = nominal?.points ?? [];
  return path.points.map((point, i) => {
    const j = ref.length === path.points.length ? i : ref.reduce((best, p, k) => distanceNm(p, point) < distanceNm(ref[best], point) ? k : best, 0);
    const base = ref[j];
    let offset = 0;
    if (base && distanceNm(base, point) > .5) {
      const track = bearing(ref[Math.max(0, j - 1)], ref[Math.min(ref.length - 1, j + 1)]);
      offset = Math.sign(Math.sin((bearing(base, point) - track) * RAD)) * distanceNm(base, point);
    }
    return { t:(path.times_s[i] - path.times_s[0]) / 60, offset, level:point[2] };
  });
}

function timeTicks(total: number) {
  const step = [15, 30, 60, 90, 120].find(s => total / s <= 6) ?? 180;
  return Array.from({ length:Math.floor(total / step) + 1 }, (_, i) => i * step);
}

function Frame({ total, x, now, children }: { total:number; x:(t:number) => number; now:number; children:React.ReactNode }) {
  return <>
    {timeTicks(total).map(t => <g key={t} className="view-tick"><path d={`M${x(t)} ${TOP}V${BOTTOM}`}/><text x={x(t)} y={BOTTOM + 16} textAnchor="middle">{t === 0 ? 'entry' : `${t} min`}</text></g>)}
    {children}
    <path d={`M${x(now)} ${TOP}V${BOTTOM}`} className="view-cursor"/>
  </>;
}

function line(samples: Sample[], x:(t:number) => number, y:(s:Sample) => number) {
  return samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s).toFixed(1)}`).join(' ');
}

function Flown({ id, x, now, d }: { id:string; x:(t:number) => number; now:number; d:string }) {
  return <>
    <path d={d} className="view-cleared"/>
    <clipPath id={id}><rect x="0" y="0" width={x(now)} height={H}/></clipPath>
    <path d={d} className="view-cleared flown" clipPath={`url(#${id})`}/>
  </>;
}

/** Bird's-eye and side views of the cleared route, driven by the same clock as the cockpit. */
export function RouteProfiles({ path, nominal, own, filedLevel }: { path:PathView; nominal:PathView | null; own:RoutePosition; filedLevel:number }) {
  const id = useId().replaceAll(':', '');
  const samples = profile(path, nominal);
  const total = samples.at(-1)!.t;
  const now = (own.time - path.times_s[0]) / 60;
  const x = (t: number) => LEFT + (RIGHT - LEFT) * t / total;
  const s = samples[own.segment], e = samples[own.segment + 1] ?? s;
  const offsetNow = s.offset + (e.offset - s.offset) * (e.t > s.t ? (now - s.t) / (e.t - s.t) : 0);

  const maxOffset = Math.max(...samples.map(p => Math.abs(p.offset)));
  const span = Math.max(30, Math.ceil(maxOffset / 30) * 30);
  const yOffset = (nm: number) => (TOP + BOTTOM) / 2 - nm / span * (BOTTOM - TOP) * .42;
  const offsets = Array.from({ length:span / 15 * 2 + 1 }, (_, i) => -span + i * 15).filter(nm => nm % 30 === 0);
  const lateralAngle = Math.atan2(yOffset(e.offset) - yOffset(s.offset), x(e.t) - x(s.t)) / RAD;

  const levels = samples.map(p => p.level);
  const lo = Math.min(filedLevel, ...levels) - 20, hi = Math.max(filedLevel, ...levels) + 20;
  const yLevel = (fl: number) => BOTTOM - (fl - lo) / (hi - lo) * (BOTTOM - TOP);
  const flightLevels = Array.from({ length:(hi - lo) / 10 + 1 }, (_, i) => lo + i * 10).filter(fl => (fl - filedLevel) % 20 === 0);
  const climbAngle = Math.max(-25, Math.min(25, Math.atan2(yLevel(e.level) - yLevel(s.level), x(e.t) - x(s.t)) / RAD));

  return <>
    <section className="cockpit-view" aria-label="Bird's-eye view of lateral deviation">
      <div className="cockpit-view-title"><span>BIRD’S-EYE · LATERAL</span><b>{Math.abs(offsetNow) < .5 ? 'ON FILED TRACK' : `${number(Math.abs(offsetNow))} NM ${offsetNow > 0 ? 'RIGHT' : 'LEFT'}`}</b></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={maxOffset < .5 ? 'No lateral change from the filed track' : `Lateral offset up to ${number(maxOffset)} NM from the filed track`}>
        <Frame total={total} x={x} now={now}>
          {offsets.map(nm => <g key={nm} className="view-grid"><path d={`M${LEFT} ${yOffset(nm)}H${RIGHT}`}/><text x={LEFT - 8} y={yOffset(nm) + 4} textAnchor="end">{nm === 0 ? 'filed' : `${Math.abs(nm)} ${nm > 0 ? 'R' : 'L'}`}</text></g>)}
          <path d={`M${LEFT} ${yOffset(0)}H${RIGHT}`} className="view-filed"/>
          <Flown id={`${id}lat`} x={x} now={now} d={line(samples, x, p => yOffset(p.offset))}/>
          {maxOffset < .5 && <text x={(LEFT + RIGHT) / 2} y={yOffset(0) - 14} textAnchor="middle" className="view-note">No lateral change. Stays on the filed track.</text>}
          <path d={TOP_PLANE} className="view-plane" transform={`translate(${x(now).toFixed(1)} ${yOffset(offsetNow).toFixed(1)}) rotate(${lateralAngle.toFixed(1)})`}/>
        </Frame>
      </svg>
    </section>
    <section className="cockpit-view" aria-label="Side view of flight level changes">
      <div className="cockpit-view-title"><span>SIDE VIEW · FLIGHT LEVEL</span><b>FL{number(own.level)}</b></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Flight level profile from FL${number(filedLevel)}, peaking at FL${number(Math.max(...levels))}`}>
        <Frame total={total} x={x} now={now}>
          {flightLevels.map(fl => <g key={fl} className="view-grid"><path d={`M${LEFT} ${yLevel(fl)}H${RIGHT}`}/><text x={LEFT - 8} y={yLevel(fl) + 4} textAnchor="end">FL{fl}</text></g>)}
          <path d={`M${LEFT} ${yLevel(filedLevel)}H${RIGHT}`} className="view-filed"/>
          <Flown id={`${id}lvl`} x={x} now={now} d={line(samples, x, p => yLevel(p.level))}/>
          <path d={SIDE_PLANE} className="view-plane" transform={`translate(${x(now).toFixed(1)} ${yLevel(own.level).toFixed(1)}) rotate(${climbAngle.toFixed(1)})`}/>
        </Frame>
      </svg>
    </section>
  </>;
}
