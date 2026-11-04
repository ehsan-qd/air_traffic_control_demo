import type { PathView } from '../api/types.gen';
import { bearing, distanceNm, routePosition, type RoutePosition } from './cockpitModel';

const RAD = Math.PI / 180;
export const signedAngle = (from:number, to:number) => ((to - from + 540) % 360) - 180;
const clamp = (n:number, lo:number, hi:number) => Math.max(lo,Math.min(hi,n));

/** Camera cues are inferred from route geometry, not measured aircraft attitude. */
export function routeCamera(path:PathView, time:number, own:RoutePosition) {
  const look = 180;
  const before = routePosition(path,time-look), after = routePosition(path,time+look);
  if (!before || !after) return {heading:own.heading,bank:0,pitch:0};
  const distance = distanceNm([before.lon,before.lat],[after.lon,after.lat]);
  const heading = distance > .001 ? bearing([before.lon,before.lat],[after.lon,after.lat]) : own.heading;
  // The route has sharp waypoint joins. Look either side to ease the camera
  // through them, with deliberately exaggerated, bounded pitch and bank cues.
  const bank = clamp(signedAngle(before.heading,after.heading) * 1.8,-22,22);
  const pitch = distance > .001 ? clamp(Math.atan2((after.level-before.level)*100,distance*6076.12) / RAD * 12,-12,12) : 0;
  return {heading,bank,pitch};
}

export interface SeaCloud { id:string; x:number; y:number; size:number; opacity:number; high:boolean }
/** A geographic lattice: motion comes only from aircraft position/heading/height. */
export function outsideScenery(own:RoutePosition) {
  const east = own.lon * 60 * Math.cos(52*RAD), north = own.lat*60;
  const heading = own.heading * RAD, sin = Math.sin(heading), cos = Math.cos(heading);
  const tile = 24, col = Math.floor(east/tile), row = Math.floor(north/tile);
  const heightNm = own.level*100/6076.12;
  const project = (e:number,n:number,altitudeFt=0) => {
    const dx=e-east,dz=n-north;
    const right=dx*cos-dz*sin,ahead=dx*sin+dz*cos;
    if (ahead < 12 || ahead > 330) return null;
    const x=500+right*850/ahead, y=245+(heightNm-altitudeFt/6076.12)*850/ahead;
    return x < -450 || x > 1450 || y < -500 || y > 850 ? null : {x,y,ahead};
  };
  const draw = (points:({x:number;y:number}|null)[]) => {
    let active=false;
    return points.map(p=>{if(!p){active=false;return '';}const command=active?'L':'M';active=true;return `${command}${p.x.toFixed(2)},${p.y.toFixed(2)}`;}).join(' ');
  };
  const ocean:string[]=[];
  for(let i=-15;i<=15;i++) {
    ocean.push(draw(Array.from({length:31},(_,j)=>project((col+i)*tile,(row+j-15)*tile))));
    ocean.push(draw(Array.from({length:31},(_,j)=>project((col+j-15)*tile,(row+i)*tile))));
  }
  const clouds:SeaCloud[]=[];
  for(let i=-10;i<=10;i++) for(let j=-10;j<=10;j++) {
    const a=col+i,b=row+j;
    // Stable world-space cloud placement makes pause, rewind and replay exact.
    const hash=Math.abs(Math.sin(a*127.1+b*311.7)*43758.5453)%1;
    if(hash>.32)continue;
    const high=hash<.075;
    const p=project((a+hash)*tile,(b+.3+hash*.5)*tile,high?44000:24000);
    if(!p)continue;
    clouds.push({id:`${a}:${b}`,x:p.x,y:p.y,size:clamp(2500/p.ahead,8,115),opacity:clamp(.55-p.ahead/800,.12,.5),high});
  }
  return {ocean:ocean.join(' '),clouds:clouds.sort((a,b)=>a.size-b.size)};
}
