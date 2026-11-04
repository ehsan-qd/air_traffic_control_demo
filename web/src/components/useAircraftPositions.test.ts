import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { FlightView, WorldView } from '../api/types.gen';
import { useAircraftPositions } from './useAircraftPositions';

afterEach(()=>{cleanup();vi.useRealTimers();});
it('smooths live heading through north and stops at the received position without extrapolation',async()=>{
  vi.useFakeTimers({toFake:['requestAnimationFrame','cancelAnimationFrame','performance']});
  const flight:FlightView={id:'a',callsign:'XAT417',aircraft_type:'B789',mach:.82,filed_level_fl:370,track_id:null,status:'active',entry_time_s:0,scheduled_exit_s:1000,route:[],position:{lon:-40,lat:50,altitude_m:10000,heading_deg:359,ground_speed_ms:200},trajectory:null};
  const world:WorldView={scenario:'test',start_utc:'2025-03-01T10:00:00Z',sim_time_s:0,speed:10,running:true,frozen_for_solve:false,flights:[flight],tracks:[],queue_size:0,separation_losses:0,insertions_cleared:1,backend:'pbit_emulator',seed:1};
  const {result,rerender}=renderHook(useAircraftPositions,{initialProps:world});
  const target={...flight,position:{...flight.position,lon:-39.9,heading_deg:1,altitude_m:11000,ground_speed_ms:240}};
  rerender({...world,sim_time_s:5,flights:[target]});
  await act(async()=>{await vi.advanceTimersByTimeAsync(50);});
  const halfway=result.current[0].position;
  expect(halfway.heading_deg>350||halfway.heading_deg<10).toBe(true);
  expect(halfway.altitude_m).toBeGreaterThan(10000);expect(halfway.altitude_m).toBeLessThan(11000);
  expect(halfway.ground_speed_ms).toBeGreaterThan(200);expect(halfway.ground_speed_ms).toBeLessThan(240);
  // An identical clock snapshot at 10 Hz must not jump straight to the goal.
  rerender({...world,sim_time_s:5,flights:[{...target}]});
  await act(async()=>{await vi.advanceTimersByTimeAsync(150);});
  const flowing=result.current[0].position;
  expect(flowing.altitude_m).toBeGreaterThan(halfway.altitude_m);
  expect(flowing.altitude_m).toBeLessThan(11000);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
  expect(result.current[0].position.lon).toBeCloseTo(-39.9,10);
  expect(result.current[0].position.heading_deg).toBe(1);
  expect(result.current[0].position.altitude_m).toBe(11000);
});
