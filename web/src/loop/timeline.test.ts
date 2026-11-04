import { describe, expect, it } from 'vitest';
import type { InsertionRecord, PathView, SolveView } from '../api/types.gen';
import type { Recording } from '../replay/player';
import { LoopTimeline } from './timeline';

const path: PathView = { points: [[-52, 50, 370], [-32, 52, 370], [-12, 50, 370]], times_s: [6000, 9000, 12000], theta: [0, 0, 0], chi: [0, 0, 0] };
const solve = (id: string): SolveView => ({ id: `${id}:1`, flight_id: id, callsign: id, attempt: 1, reason: 'filed', nominal: path, candidates: [path], candidate_feasible: [true], conflicts_with: [], metrics: {}, terms: {} });
const record = (id: string, verified = true): InsertionRecord => ({ id: `r-${id}`, flight_id: id, callsign: id, filed_at_s: 0, cleared_at_s: 0, outcome: verified ? 'cleared' : 'held', verified, message: ['AFTER WPT 01 CLIMB TO FL390'], trajectory: path, metrics: {}, attempts: [], backend: 'pbit_emulator' });

function recording(): Recording {
  const encounter = (id: string, at: number, verified = true) => [
    [at, 'event', { type: 'pipeline_step', data: { step: { name: 'Predict conflicts', status: 'done' } } }],
    [at + 90, 'event', { type: 'solve_started', data: { solve: solve(id) } }],
    [at + 100, 'event', { type: 'solve_progress', data: { progress: { sweep: 400, requested_sweeps: 1000, beta: 1, energy: .5, elapsed_ms: 300, feasible_index: 0, active_candidates: [[0]], capture_beta: .6 } } }],
    [at + 140, 'event', { type: 'clearance_issued', data: { record: record(id, verified) } }],
  ];
  return {
    version: 1, meta: { scenario: 'tv_loop', jitStartupMs: null, startSim: 0, endSim: 7000 },
    world: { scenario: 'tv_loop', start_utc: '2025-03-01T10:00:00Z', speed: 10, tracks: [], backend: 'pbit_emulator', seed: 1, formulation: 'candidate_path' },
    flights: [], frames: [{ s: 0, p: [] }],
    entries: [...encounter('XAT417', 600), ...encounter('XCV777', 2000, false), ...encounter('XBQ418', 3600)] as Recording['entries'],
  };
}

describe('TV loop timeline', () => {
  it('finds each verified solve, skips held requests, and slows to 10x from detection until the clearance has been read', () => {
    const timeline = new LoopTimeline(recording());
    expect(timeline.resolved.map(e => [e.solve.callsign, e.detect, e.start, e.cleared])).toEqual([['XAT417', 600, 690, 740], ['XBQ418', 3600, 3690, 3740]]);
    expect(timeline.encounters.map(e => e.solve.callsign)).toEqual(['XAT417', 'XBQ418']);
    expect(timeline.speedAt(100)).toBe(300);
    expect(timeline.speedAt(450)).toBe(100);
    expect(timeline.speedAt(700)).toBe(10);
    expect(timeline.speedAt(2000)).toBe(300);
  });

  it('maps playback time onto simulation time monotonically, ending inside the recording', () => {
    const timeline = new LoopTimeline(recording());
    const samples = Array.from({ length: 200 }, (_, i) => timeline.simAt(timeline.duration * i / 199));
    expect(samples.every((s, i) => i === 0 || s >= samples[i - 1])).toBe(true);
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBeCloseTo(timeline.end);
    expect(timeline.end).toBeLessThanOrEqual(7000);
    // Ten real seconds cover the 100 simulated seconds of one solve.
    const e = timeline.encounters[0];
    const realAt = (sim: number) => { let lo = 0, hi = timeline.duration; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (timeline.simAt(mid) < sim) lo = mid; else hi = mid; } return hi; };
    expect(realAt(e.cleared) - realAt(e.detect)).toBeCloseTo(14, 1);
  });
});
