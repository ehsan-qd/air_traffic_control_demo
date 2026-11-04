import { describe, expect, it } from 'vitest';
import { routeBetween, levelColour } from './fleetGeometry';
import { choiceBins, peakSigned } from './ChoiceLattice';
import { candidateCounts } from './DecisionSpace';
import { resolutionDescription } from './ResolutionFeed';
import type { InsertionRecord, PathView, ProgressView, SolveView } from '../api/types.gen';
const path:PathView={points:[[-52,50,370],[-32,52,410],[-12,50,370]],times_s:[0,100,200],theta:[0,1,0],chi:[0,2,0]};
const solve:SolveView={id:'s',flight_id:'f',callsign:'XAT417',attempt:1,reason:'test',nominal:path,candidates:[path,{...path,theta:[0,-2,0]}, {...path,theta:[0,0,0],chi:[0,0,0]}],candidate_feasible:[true,false,true],conflicts_with:['a'],metrics:{},terms:{}};
const progress:ProgressView={sweep:1,requested_sweeps:10,beta:.5,energy:2,elapsed_ms:3,feasible_index:null,active_candidates:[[],[0,1],[0]],capture_beta:null};
const record:InsertionRecord={id:'r',flight_id:'f',callsign:'XAT417',filed_at_s:0,cleared_at_s:1,outcome:'cleared',verified:true,message:[],trajectory:path,metrics:{c_n:8,c_n_lateral:0,c_n_vertical:8,n_conflict_pairs:42},attempts:[],backend:'pbit_emulator'};
describe('truthful fleet overlays',()=>{
  it('clips flown trails to actual trajectory occupation times',()=>{
    expect(routeBetween(path,-900,-1)).toEqual([]);
    const trail=routeBetween(path,50,150);
    expect(trail).toHaveLength(3);
    expect(trail[0][0]).toBeGreaterThan(-52);expect(trail.at(-1)![0]).toBeLessThan(-12);
    expect(trail[1][0]).toBeCloseTo(-32,10);expect(trail[1][1]).toBeCloseTo(52,10);expect(trail[1][2]).toBe(410);
    expect(routeBetween(path,201,220)).toEqual([]);
  });
  it('groups the real candidates by signed maximum skeleton excursion',()=>{
    expect(peakSigned([0,-2,-1,0])).toBe(-2);
    const bins=choiceBins(solve,progress);
    expect(bins.reduce((sum,b)=>sum+b.total,0)).toBe(3);
    expect(bins.find(b=>b.theta===1&&b.chi===2)).toMatchObject({total:1,feasible:1,sampled:1});
    expect(bins.find(b=>b.theta===-2)).toMatchObject({feasible:0,sampled:1});
    expect(bins.find(b=>b.theta===0)).toMatchObject({feasible:1,sampled:0});
  });
  it('derives feasible/rejected totals directly from the transmitted basis',()=>{
    expect(candidateCounts(solve)).toEqual({total:3,feasible:2,rejected:1});
    expect(candidateCounts(null)).toEqual({total:0,feasible:0,rejected:0});
  });
  it('describes the actual selected flight level and lateral excursion',()=>{
    expect(resolutionDescription(record)).toBe('Climb to FL410');
    expect(resolutionDescription({...record,metrics:{...record.metrics,c_n_lateral:2}})).toBe('Climb to FL410, offset right');
    expect(resolutionDescription({...record,message:['AFTER WPT 02 CLIMB TO FL410 / OFFSET 30 NM RIGHT'],metrics:{...record.metrics,c_n_lateral:2}})).toBe('Climb to FL410, 30 NM right');
    expect(resolutionDescription({...record,message:['AFTER WPT 02 OFFSET 60 NM LEFT'],metrics:{...record.metrics,c_n_lateral:8,c_n_vertical:0}})).toBe('60 NM left offset');
    expect(resolutionDescription({...record,verified:false,outcome:'held'})).toBe('Held · no clearance issued');
    expect(levelColour(310)).not.toBe(levelColour(410));
  });
});
