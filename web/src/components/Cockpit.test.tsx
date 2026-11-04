import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Cockpit } from './Cockpit';
import type { InsertionRecord, WorldView } from '../api/types.gen';
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('never previews an unverified trajectory, even if stale geometry is present', () => {
  const path = {points:[[-52,50,370],[-12,50,410]],times_s:[100,200],theta:[0,0],chi:[0,2]};
  const record: InsertionRecord = {id:'held',flight_id:'XAT417',callsign:'XAT417',filed_at_s:0,cleared_at_s:0,outcome:'held',verified:false,message:[],trajectory:path,metrics:{},attempts:[],backend:'pbit_emulator'};
  const world: WorldView = {scenario:'test',start_utc:'2025-03-01T10:00:00Z',sim_time_s:0,speed:10,running:false,frozen_for_solve:false,flights:[],tracks:[],queue_size:0,separation_losses:0,insertions_cleared:0,backend:'pbit_emulator',seed:1};
  render(<Cockpit world={world} record={record} solve={null} flight={null}/>);
  expect(screen.getByText('Awaiting a verified route.')).toBeInTheDocument();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

function clearedFlight() {
  const path = {points:[[-52,50,370],[-12,50,410]],times_s:[100,10100],theta:[0,0],chi:[0,2]};
  const record: InsertionRecord = {id:'clear',flight_id:'XAT417',callsign:'XAT417',filed_at_s:0,cleared_at_s:0,outcome:'cleared',verified:true,message:[],trajectory:path,metrics:{},attempts:[],backend:'pbit_emulator'};
  const flight = {id:'XAT417',callsign:'XAT417',aircraft_type:'B789',mach:.82,filed_level_fl:370,track_id:null,status:'active' as const,entry_time_s:100,scheduled_exit_s:10100,route:path.points,position:{lon:-30,lat:51,altitude_m:405*30.48,heading_deg:123,ground_speed_ms:240},trajectory:path};
  const world: WorldView = {scenario:'test',start_utc:'2025-03-01T10:00:00Z',sim_time_s:150,speed:10,running:false,frozen_for_solve:false,flights:[flight],tracks:[],queue_size:0,separation_losses:0,insertions_cleared:1,backend:'pbit_emulator',seed:1};
  return {world,record,flight,solve:null};
}

it('opens airborne flights in live mode with backend altitude, speed, heading and clock', () => {
  const {container} = render(<Cockpit {...clearedFlight()}/>);
  expect(screen.getByRole('button',{name:'Preview route'})).toBeInTheDocument();
  expect(container.querySelector('.cockpit-hud-altitude strong')).toHaveTextContent('FL405');
  expect(container.querySelector('.cockpit-hud-speed strong')).toHaveTextContent('467');
  expect(container.querySelector('.cockpit-live-data')).toHaveTextContent('HDG 123°');
  expect(container.querySelector('.cockpit-strip time')).toHaveTextContent('10:02:30Z');
});

it('keeps archived inspection in preview mode even if its snapshot flight was active', () => {
  render(<Cockpit {...clearedFlight()} liveAvailable={false}/>);
  expect(screen.getByRole('button',{name:'Live aircraft'})).toBeDisabled();
});

it('pauses with the study director and resumes without jumping the preview clock', async () => {
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','requestAnimationFrame','cancelAnimationFrame']});
  const props = clearedFlight();
  const {rerender} = render(<Cockpit {...props} liveAvailable={false}/>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  const slider = screen.getByRole('slider') as HTMLInputElement;
  const before = Number(slider.value);
  rerender(<Cockpit {...props} liveAvailable={false} enabled={false}/>);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(Number(slider.value)).toBe(before);
  rerender(<Cockpit {...props} liveAvailable={false} enabled/>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(Number(slider.value)-before).toBeGreaterThan(800);
  expect(Number(slider.value)-before).toBeLessThan(1100);
  expect(props.world.sim_time_s).toBe(150);
});

it('moves the outside scenery while flying, freezes it on pause and rewinds it on replay', async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','requestAnimationFrame','cancelAnimationFrame']});
  const {container}=render(<Cockpit {...clearedFlight()} liveAvailable={false}/>);
  const sea=container.querySelector('.cockpit-sea-flow')!;
  const initial=sea.getAttribute('d');
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
  expect(sea.getAttribute('d')).not.toBe(initial);
  fireEvent.click(screen.getByRole('button',{name:'Pause cockpit preview'}));
  const stopped=sea.getAttribute('d');
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000);});
  expect(sea.getAttribute('d')).toBe(stopped);
  fireEvent.click(screen.getByRole('button',{name:'Replay cockpit manoeuvre'}));
  expect(sea.getAttribute('d')).toBe(initial);
});

it('keeps the manual preview moving by repeating the route',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','requestAnimationFrame','cancelAnimationFrame']});
  render(<Cockpit {...clearedFlight()} liveAvailable={false} durationMs={1000}/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1400);});
  const progress=Number((screen.getByRole('slider') as HTMLInputElement).value);
  expect(progress).toBeGreaterThan(300);expect(progress).toBeLessThan(500);
  expect(screen.getByRole('button',{name:'Pause cockpit preview'})).toBeInTheDocument();
});

it('moves the pilot scenery smoothly with live aircraft updates and freezes when the live sky pauses',async()=>{
  vi.useFakeTimers({toFake:['requestAnimationFrame','cancelAnimationFrame','performance']});
  const original=clearedFlight();
  const props={...original,world:{...original.world,running:true}};
  const {container,rerender}=render(<Cockpit {...props}/>);
  const sea=container.querySelector('.cockpit-sea-flow')!;
  const first=sea.getAttribute('d');
  const flight={...props.flight,position:{...props.flight.position,lon:-29.9,altitude_m:406*30.48,heading_deg:124}};
  const world={...props.world,sim_time_s:155,flights:[flight]};
  rerender(<Cockpit {...props} flight={flight} world={world}/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(100);});
  const moving=sea.getAttribute('d');
  expect(moving).not.toBe(first);
  rerender(<Cockpit {...props} flight={{...flight}} world={{...world,flights:[{...flight}]}}/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(150);});
  expect(sea.getAttribute('d')).not.toBe(moving);
  rerender(<Cockpit {...props} flight={flight} world={{...world,running:false}}/>);
  const paused=sea.getAttribute('d');
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
  expect(sea.getAttribute('d')).toBe(paused);
  expect(container.querySelector('.cockpit-strip')).toHaveTextContent('SKY PAUSED');
});
