import { describe, expect, it } from 'vitest';
import type { PathView } from '../api/types.gen';
import { outsideScenery, routeCamera, signedAngle } from './cockpitCamera';
import { routePosition } from './cockpitModel';

const level:PathView={points:[[0,0,370],[1,0,370],[2,0,370]],times_s:[0,600,1200],theta:[0,0,0],chi:[0,0,0]};

describe('pilot camera motion',()=>{
  it('keeps the horizon level in straight cruise and moves it correctly for climbs and descents',()=>{
    const cruise=routeCamera(level,300,routePosition(level,300)!);
    expect(cruise.pitch).toBeCloseTo(0);expect(cruise.bank).toBeCloseTo(0);expect(cruise.heading).toBeCloseTo(90);
    const climb={...level,points:[[0,0,370],[1,0,410],[2,0,370]]};
    expect(routeCamera(climb,300,routePosition(climb,300)!).pitch).toBeGreaterThan(0);
    expect(routeCamera(climb,900,routePosition(climb,900)!).pitch).toBeLessThan(0);
  });
  it('banks toward a waypoint turn and eases the view through its change in heading',()=>{
    const left={...level,points:[[0,0,370],[1,0,370],[1,1,370]]};
    const right={...level,points:[[0,0,370],[1,0,370],[1,-1,370]]};
    const camera=(path:PathView,time:number)=>routeCamera(path,time,routePosition(path,time)!);
    expect(camera(left,600).bank).toBeLessThan(0);
    expect(camera(right,600).bank).toBeGreaterThan(0);
    expect(Math.abs(camera(left,600).bank)).toBeLessThanOrEqual(22);
    expect(camera(left,480).heading).toBeGreaterThan(camera(left,600).heading);
    expect(camera(left,600).heading).toBeGreaterThan(camera(left,720).heading);
    expect(signedAngle(359,1)).toBe(2);expect(signedAngle(1,359)).toBe(-2);
  });
  it('anchors ocean and cloud motion to aircraft coordinates, including pause and rewind',()=>{
    const own={lon:-40,lat:50,level:370,heading:80,groundSpeedKt:500,time:0,segment:0};
    const original=outsideScenery(own);
    expect(outsideScenery({...own,time:999})).toEqual(original);
    expect(outsideScenery({...own,lon:-39.9}).ocean).not.toBe(original.ocean);
    expect(outsideScenery({...own,level:410}).ocean).not.toBe(original.ocean);
    expect(outsideScenery({...own,heading:95}).ocean).not.toBe(original.ocean);
    expect(outsideScenery(own)).toEqual(original);
    expect(original.ocean).not.toContain('NaN');
    expect(original.clouds.length).toBeGreaterThan(0);
  });
});
