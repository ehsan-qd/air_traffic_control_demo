import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PathView } from '../api/types.gen';
import { useDemo } from '../store/useDemo';
import { cuesOf, ReplayPlayer, type Recording } from './player';

const path: PathView = { points: [[-50, 50, 370], [-30, 50, 370]], times_s: [0, 3600], theta: [0, 0], chi: [0, 0] };
const fixed = (id: string) => ({ id, callsign: id, aircraft_type: 'B789', mach: 0.84, filed_level_fl: 370, track_id: null, entry_time_s: 0, scheduled_exit_s: 3600, route: [[-50, 50], [-30, 50]] });
const recording: Recording = {
  version: 1,
  meta: { scenario: 'study_loop', jitStartupMs: 190, startSim: 0, endSim: 100 },
  world: { scenario: 'study_loop', start_utc: '2025-03-01T10:00:00Z', speed: 10, tracks: [], backend: 'pbit_emulator', seed: 1 },
  flights: [fixed('XAT208'), fixed('XAT417')],
  frames: [
    { s: 0, p: [[0, -50, 50, 11278, 90, 250]] },
    { s: 20, p: [[0, -49, 50, 11278, 90, 250], [1, -50, 50, 11278, 90, 250]] },
    { s: 40, p: [[0, -48, 50, 11278, 90, 250], [1, -49.5, 50, 11278, 90, 250]] },
  ],
  entries: [
    [0, 'flight', { i: 0, status: 'active', trajectory: path }],
    [0, 'world', { q: 0, c: 0, l: 0, f: false }],
    [15, 'flight', { i: 1, status: 'filed', trajectory: null }],
    [25, 'event', { type: 'solve_started', data: { solve: { id: 's1', flight_id: 'XAT417', callsign: 'XAT417', attempt: 1, reason: 'filed', nominal: path, candidates: [path], candidate_feasible: [true], conflicts_with: ['XAT208'], metrics: {}, terms: {} } } }],
    [35, 'flight', { i: 1, status: 'cleared', trajectory: path }],
    [35, 'event', { type: 'clearance_issued', data: { record: { id: 'r1', flight_id: 'XAT417', callsign: 'XAT417', filed_at_s: 15, cleared_at_s: 35, outcome: 'cleared', verified: true, message: [], trajectory: path, metrics: {}, attempts: [], backend: 'pbit_emulator' } } }],
  ],
};

let player: ReplayPlayer;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  useDemo.getState().setSource('replay');
  player = new ReplayPlayer('/unused.json');
  player.use(recording);
});
afterEach(() => { player.stop(); vi.useRealTimers(); });

describe('recorded walkthrough player', () => {
  it('finds when the story flight files, solves and clears', () => {
    expect(cuesOf(recording, 'XAT417')).toEqual({ filed: 20, solve: 25, cleared: 35, complete: 35 });
  });
  it('resets to the first frame, then plays events into the store at the recorded speed', async () => {
    await player.control({ action: 'reset' });
    expect(useDemo.getState().world?.flights.map(f => f.id)).toEqual(['XAT208']);
    expect(useDemo.getState().world?.flights[0].status).toBe('active');
    await player.control({ action: 'play' });
    vi.advanceTimersByTime(2600);
    const state = useDemo.getState();
    expect(state.world?.sim_time_s).toBe(20);
    expect(state.solve?.flight_id).toBe('XAT417');
    expect(state.world?.flights.find(f => f.id === 'XAT417')?.status).toBe('filed');
    vi.advanceTimersByTime(1000);
    expect(useDemo.getState().history.map(r => r.flight_id)).toEqual(['XAT417']);
    expect(useDemo.getState().archives.r1.solve?.flight_id).toBe('XAT417');
  });
  it('seeks forward only and holds still at the end of the run', async () => {
    await player.control({ action: 'reset' });
    player.seekTo(35);
    expect(useDemo.getState().history).toHaveLength(1);
    player.seekTo(10);
    expect(useDemo.getState().world?.sim_time_s).toBe(20);
    await player.control({ action: 'play' });
    vi.advanceTimersByTime(10_000);
    expect(useDemo.getState().world?.running).toBe(false);
    expect(useDemo.getState().world?.sim_time_s).toBe(40);
  });
  it('lets only the most recently used recording write, and restores the story exactly', async () => {
    const fleet = new ReplayPlayer('/unused.json', null);
    fleet.use({ ...recording, flights: [fixed('XEW421')], frames: [{ s: 0, p: [[0, -40, 52, 11278, 90, 250]] }], entries: [[0, 'flight', { i: 0, status: 'active', trajectory: path }]] });
    await player.control({ action: 'reset' });
    player.seekTo(35);
    expect(useDemo.getState().history).toHaveLength(1);
    await fleet.ambient();
    expect(useDemo.getState().history).toHaveLength(0);
    expect(useDemo.getState().world?.flights.map(f => f.id)).toEqual(['XEW421']);
    player.seekTo(40);
    expect(useDemo.getState().world?.flights.map(f => f.id)).toEqual(['XEW421']);
    await player.restore(false);
    expect(useDemo.getState().history.map(r => r.flight_id)).toEqual(['XAT417']);
    expect(useDemo.getState().archives.r1.solve?.flight_id).toBe('XAT417');
    expect(useDemo.getState().world?.sim_time_s).toBe(40);
    fleet.stop();
  });
  it('loops the overview and never writes into the live source', async () => {
    await player.ambient();
    vi.advanceTimersByTime(10_500);
    expect(useDemo.getState().history).toHaveLength(0);
    expect(useDemo.getState().world?.running).toBe(true);
    useDemo.getState().setSource('live');
    vi.advanceTimersByTime(5000);
    expect(useDemo.getState().world).toBeNull();
  });
});
