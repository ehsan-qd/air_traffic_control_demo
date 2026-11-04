import { beforeEach, describe, expect, it } from 'vitest';
import type { InsertionRecord, ProgressView, SolveView, WorldView } from '../api/types.gen';
import { getView, useDemo } from './useDemo';
const world: WorldView = { scenario:'hero_crossing', start_utc:'2025-03-01T10:00:00Z', sim_time_s:0, speed:60, running:false, frozen_for_solve:false, flights:[], tracks:[], queue_size:0, separation_losses:0, insertions_cleared:0, backend:'pbit_emulator', seed:1 };
const solve: SolveView = { id:'a:1',flight_id:'a',callsign:'XAT417',attempt:1,reason:'initial',nominal:{points:[],times_s:[],theta:[],chi:[]},candidates:[],candidate_feasible:[],conflicts_with:[],metrics:{},terms:{} };
const progress: ProgressView = {sweep:2000,requested_sweeps:200000,beta:.7,energy:1,elapsed_ms:10,feasible_index:null,active_candidates:[[],[1,2]],capture_beta:.6};
const record: InsertionRecord = {id:'r1',flight_id:'a',callsign:'XAT417',filed_at_s:0,cleared_at_s:0,outcome:'cleared',verified:true,message:['test'],trajectory:null,metrics:{},attempts:[],backend:'pbit_emulator',snapshot:world};
const receive = (type: Parameters<ReturnType<typeof useDemo.getState>['receive']>[0]['type'],data: Parameters<ReturnType<typeof useDemo.getState>['receive']>[0]['data']) => useDemo.getState().receive({type,sequence:1,data});
beforeEach(()=>receive('hello',{world,history:[]}));
describe('live backend state',()=>{
  it('retains prediction/build events that precede solve_started',()=>{
    receive('pipeline_step',{step:{name:'Predict conflicts',status:'done'}});
    receive('pipeline_step',{step:{name:'Build candidate QUBO',status:'done'}});
    receive('solve_started',{solve});
    expect(useDemo.getState().steps.map(s=>s.name)).toEqual(['Predict conflicts','Build candidate QUBO']);
  });
  it('does not convert empty or multi-hot replicas to fabricated selections',()=>{
    receive('solve_started',{solve});receive('solve_progress',{progress});
    expect(useDemo.getState().trace[0].active_candidates).toEqual([[],[1,2]]);
    expect(useDemo.getState().captures[0].beta).toBe(.7);
  });
  it('bounds live trace while retaining actual threshold captures',()=>{
    for(let i=0;i<300;i++) receive('solve_progress',{progress:{...progress,sweep:i,capture_beta:i===0?.6:null}});
    expect(useDemo.getState().trace).toHaveLength(256);
    expect(useDemo.getState().trace[0].sweep).toBe(44);
    expect(useDemo.getState().captures[0].sweep).toBe(0);
  });
  it('resets trace and captures when fallback changes the solve id',()=>{
    receive('solve_started',{solve});receive('solve_progress',{progress});
    receive('solve_started',{solve:{...solve,id:'a:2',attempt:2}});
    expect(useDemo.getState().trace).toEqual([]);expect(useDemo.getState().captures).toEqual([]);
  });
  it('inspects the captured world without rewinding or mutating live state',()=>{
    receive('solve_started',{solve});receive('solve_progress',{progress});receive('clearance_issued',{record});
    receive('world_tick',{world:{...world,sim_time_s:900}});
    useDemo.getState().inspect('r1');
    expect(getView(useDemo.getState()).world?.sim_time_s).toBe(0);
    expect(useDemo.getState().world?.sim_time_s).toBe(900);
    expect(getView(useDemo.getState()).trace[0].beta).toBe(.7);
  });
  it('clears stale solver data after scenario reset',()=>{
    receive('solve_started',{solve});receive('solve_progress',{progress});receive('clearance_issued',{record});
    receive('hello',{world,history:[]});
    expect(useDemo.getState().record).toBeNull();expect(useDemo.getState().solve).toBeNull();
    expect(useDemo.getState().history).toEqual([]);expect(useDemo.getState().archives).toEqual({});
  });
  it('rehydrates the latest real history and sample on reconnect',()=>{
    receive('hello',{world,history:[record],solve,progress});
    expect(useDemo.getState().record).toEqual(record);expect(useDemo.getState().trace).toEqual([progress]);
  });
});
