import { describe, expect, it } from 'vitest';
import type { FlightView, InsertionRecord, PathView, SolveView, WorldView } from '../api/types.gen';
import { useDemo } from '../store/useDemo';
import { bearing, cockpitContext, committedTraffic, distanceNm, isDeviating, relativePoint, routePhase, routePosition } from './cockpitModel';

const path: PathView = { points:[[-52,50,370],[-40,52,410],[-12,50,370]], times_s:[2700,6300,9900], theta:[0,0,0], chi:[0,2,0] };
const record: InsertionRecord = { id:'r1', flight_id:'XAT417', callsign:'XAT417', filed_at_s:0, cleared_at_s:0, outcome:'cleared', verified:true, message:['CLIMB TO FL410','REJOIN FL370'], trajectory:path, metrics:{c_n:8,c_n_vertical:8}, attempts:[], backend:'pbit_emulator' };
const nominal = { ...path, points:path.points.map(p => [p[0],p[1],370]), chi:[0,0,0] };
const solve: SolveView = { id:'s1', flight_id:'XAT417', callsign:'XAT417', attempt:1, reason:'test', nominal, candidates:[path], candidate_feasible:[true], conflicts_with:[], metrics:{}, terms:{} };
const flight: FlightView = { id:'XAT208', callsign:'XAT208', aircraft_type:'B789', mach:.82, filed_level_fl:370, track_id:'A', status:'cleared', entry_time_s:2700, scheduled_exit_s:9900, route:nominal.points, position:{lon:-52,lat:50,altitude_m:370*30.48,heading_deg:90,ground_speed_ms:200}, trajectory:nominal };
const world: WorldView = { scenario:'study_loop', start_utc:'2025-03-01T10:00:00Z', sim_time_s:0, speed:10, running:false, frozen_for_solve:false, flights:[flight], tracks:[], queue_size:0, separation_losses:0, insertions_cleared:0, backend:'pbit_emulator', seed:1 };

describe('cockpit route geometry', () => {
  it('uses the actual waypoint coordinates, levels and occupation times', () => {
    const snapshot = JSON.stringify(path);
    expect(routePosition(path, -100)).toMatchObject({lon:expect.closeTo(-52,10),lat:expect.closeTo(50,10),level:370,time:2700});
    expect(routePosition(path, 6300)).toMatchObject({lon:expect.closeTo(-40,10),lat:expect.closeTo(52,10),level:410});
    expect(routePosition(path, 4500)?.level).toBe(390);
    expect(routePosition(path, 20_000)).toMatchObject({lon:expect.closeTo(-12,10),lat:expect.closeTo(50,10),level:370,time:9900});
    expect(routePosition(path, 4500)!.groundSpeedKt).toBeCloseTo(distanceNm(path.points[0],path.points[1]), 6);
    expect(JSON.stringify(path)).toBe(snapshot);
  });
  it('rejects incomplete, nonfinite or nonmonotone trajectories', () => {
    expect(routePosition({...path,times_s:[]}, 0)).toBeNull();
    expect(routePosition({...path,times_s:[0,0,1]}, 0)).toBeNull();
    expect(routePosition({...path,points:[[NaN,50,370],...path.points.slice(1)]}, 0)).toBeNull();
    expect(routePosition(path, Infinity)).toBeNull();
  });
  it('reports rejoining only when the cleared route reaches its nominal exit', () => {
    expect(routePhase(path, 2600)).toBe('Approaching the manoeuvre');
    expect(routePhase(path, 6300)).toBe('Following cleared deviation');
    expect(routePhase(path, 9899)).toBe('Following cleared deviation');
    expect(routePhase(path, 9900)).toBe('Filed route rejoined');
  });
  it('projects ahead/right relative to the aircraft’s actual heading', () => {
    const own = {lon:0,lat:0,level:370,heading:90,groundSpeedKt:450,time:0,segment:0};
    expect(bearing([0,0],[1,0])).toBeCloseTo(90);
    expect(relativePoint(own,[1,0,390])).toMatchObject({aboveFt:2000});
    expect(relativePoint(own,[1,0,390]).ahead).toBeGreaterThan(59);
    expect(Math.abs(relativePoint(own,[1,0,390]).right)).toBeLessThan(.001);
    expect(relativePoint(own,[0,-1,370]).right).toBeGreaterThan(59);
  });
  it('projects committed traffic at preview time and excludes unverified filings', () => {
    const trafficWorld = {...world,flights:[flight,{...flight,id:'HELD',status:'held' as const},{...flight,id:'FILED',status:'filed' as const}]};
    expect(committedTraffic(trafficWorld,record.flight_id,100)).toEqual([]);
    const traffic = committedTraffic(trafficWorld,record.flight_id,6300);
    expect(traffic).toHaveLength(1);
    expect(traffic[0].position).toMatchObject({lon:expect.closeTo(-40,10),lat:expect.closeTo(52,10),level:370});
    expect(committedTraffic(trafficWorld,flight.id,6300)).toEqual([]);
  });
});

describe('cockpit selection and verification', () => {
  it('offers changed verified clearances, including entry-delay fallbacks', () => {
    expect(isDeviating(record)).toBe(true);
    expect(isDeviating({...record,trajectory:nominal,metrics:{}})).toBe(false);
    expect(isDeviating({...record,trajectory:nominal,metrics:{},outcome:'cleared_after_fallback'})).toBe(true);
    expect(isDeviating({...record,verified:false,outcome:'held'})).toBe(false);
    expect(isDeviating({...record,trajectory:null})).toBe(false);
  });
  it('keeps an older selected flight’s clearance and solve together', () => {
    const recent = {...record,id:'r2',flight_id:'XBQ418',callsign:'XBQ418'};
    const state = {...useDemo.getState(),world,history:[record,recent],record:recent,selectedFlight:record.flight_id,inspectionId:null,solve:{...solve,flight_id:recent.flight_id},archives:{r1:{solve,trace:[],captures:[],steps:[]}}};
    const context = cockpitContext(state);
    expect(context.record?.id).toBe('r1');
    expect(context.solve?.flight_id).toBe(record.flight_id);
    expect(cockpitContext({...state,archives:{}}).solve).toBeNull();
    expect(cockpitContext({...state,selectedFlight:recent.flight_id},record.flight_id).record?.id).toBe('r1');
  });
  it('honours a held inspection instead of substituting a different flight’s success', () => {
    const held = {...record,id:'held',verified:false,outcome:'held' as const,trajectory:null,snapshot:world};
    const state = {...useDemo.getState(),world,history:[record,held],record,selectedFlight:record.flight_id,inspectionId:held.id};
    expect(cockpitContext(state).record?.verified).toBe(false);
    expect(cockpitContext(state).record?.id).toBe(held.id);
  });
});
