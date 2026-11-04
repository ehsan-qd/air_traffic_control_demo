import type { InsertionRecord, PathView, ProgressView, SolveView, WindGrid } from '../api/types.gen';
import type { Recording } from '../replay/player';
import { predictedEncounter, type Encounter } from '../study/encounter';

/** Simulation seconds around each encounter. 10x keeps a solve at its real wall-clock duration. */
export const HOLD_S = 70;
const APPROACH_S = 250, SETTLE_S = 300, CRUISE_S = 1500;
/** Featured encounters are at least this far apart, so the fleet visibly streams at 300x between them. */
const GAP_S = 300;
/** The loop stops after the last encounter that still fits this many real seconds. */
const TARGET_REAL_S = 165;
export const SPEEDS = [10, 100, 300] as const;

export interface LoopEncounter {
  id: string;
  /** Conflict predicted for the new filing. */
  detect: number;
  /** Candidate library built; sampling starts. */
  start: number;
  /** Verified clearance issued. */
  cleared: number;
  solve: SolveView;
  progress: { s: number; p: ProgressView }[];
  record: InsertionRecord;
  point: Encounter | null;
}

export interface Plane { i: number; id: string; callsign: string; lon: number; lat: number; level: number; heading: number }
interface FlightState { s: number; status: string; trajectory: PathView | null }
interface Segment { from: number; to: number; speed: number; real: number }

/** A recording replayed on a varying clock: slow through each solve, fast across the empty ocean. */
export class LoopTimeline {
  /** Every verified resolution in the recording, in time order. */
  readonly resolved: LoopEncounter[] = [];
  /** The resolutions the loop slows down for; the rest happen in the background. */
  readonly encounters: LoopEncounter[];
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  private readonly segments: Segment[];
  private readonly states: FlightState[][];
  private readonly losses: [number, number][] = [];

  constructor(readonly recording: Recording) {
    this.states = recording.flights.map(() => []);
    let predicted = recording.meta.startSim;
    let open: Omit<LoopEncounter, 'cleared' | 'record' | 'point' | 'id'> | null = null;
    for (const [s, kind, payload] of recording.entries) {
      if (kind === 'flight') { this.states[payload.i].push({ s, status: payload.status, trajectory: payload.trajectory }); continue; }
      if (kind === 'world') { this.losses.push([s, payload.l]); continue; }
      const { type, data } = payload;
      if (type === 'pipeline_step' && data.step?.name === 'Predict conflicts' && !open) predicted = s;
      if (type === 'solve_started' && data.solve?.candidates.length) {
        // A fallback attempt replaces the solve but keeps the original detection time.
        if (open && open.solve.flight_id === data.solve.flight_id) open = { detect: open.detect, start: s, solve: data.solve, progress: [] };
        else open = { detect: predicted, start: s, solve: data.solve, progress: [] };
      }
      if (type === 'solve_progress' && open && data.progress) open.progress.push({ s, p: data.progress });
      const current = open;
      if (data.record && current && data.record.flight_id === current.solve.flight_id) {
        open = null;
        // A request held for a controller is not shown as a clearance.
        if (!data.record.verified) continue;
        const others = current.solve.conflicts_with.flatMap(id => { const path = this.trajectory(id, current.start); return path ? [{ id, path }] : []; });
        this.resolved.push({ ...current, id: data.record.id, cleared: s, record: data.record, point: predictedEncounter(current.solve.nominal, others) });
      }
    }

    this.start = recording.meta.startSim;
    // Prefer resolutions that combine a lateral and a level move, then fill the gaps in time order.
    const window = (e: LoopEncounter) => [e.detect - APPROACH_S, e.cleared + HOLD_S + SETTLE_S + GAP_S];
    const featured: LoopEncounter[] = [];
    const lateral = (e: LoopEncounter) => (e.record.metrics.c_n_lateral ?? 0) > 0;
    for (const e of [...this.resolved].sort((a, b) => Number(lateral(b)) - Number(lateral(a)) || a.detect - b.detect)) {
      const [a, b] = window(e);
      if (featured.every(f => { const [c, d] = window(f); return b <= c || a >= d; })) featured.push(e);
    }
    featured.sort((a, b) => a.detect - b.detect);
    const rules: [number, number, number][] = featured.flatMap(e => [
      [e.detect - APPROACH_S, e.detect, 100], [e.detect, e.cleared + HOLD_S, 10], [e.cleared + HOLD_S, e.cleared + HOLD_S + SETTLE_S, 100],
    ] as [number, number, number][]);
    const build = (end: number) => {
      const marks = [...new Set([this.start, end, ...rules.flat().filter((_, i) => i % 3 !== 2)])].filter(m => m >= this.start && m <= end).sort((a, b) => a - b);
      const segments: Segment[] = [];
      let real = 0;
      for (let k = 1; k < marks.length; k++) {
        const [from, to] = [marks[k - 1], marks[k]], mid = (from + to) / 2;
        const speed = Math.min(300, ...rules.filter(([a, b]) => a <= mid && mid < b).map(r => r[2]));
        const last = segments.at(-1);
        if (last && last.speed === speed) last.to = to;
        else segments.push({ from, to, speed, real });
        real += (to - from) / speed;
      }
      return { segments, real };
    };
    // End after a featured encounter, cruising on but stopping short of the next one's approach.
    const endAfter = (k: number) => Math.min(recording.meta.endSim, featured[k].cleared + HOLD_S + SETTLE_S + CRUISE_S, (featured[k + 1]?.detect ?? Infinity) - APPROACH_S);
    let end = featured.length ? endAfter(0) : recording.meta.endSim;
    let chosen = build(end);
    for (let k = 1; k < featured.length; k++) {
      const next = build(endAfter(k));
      if (next.real > TARGET_REAL_S) break;
      chosen = next; end = endAfter(k);
    }
    this.end = end;
    this.segments = chosen.segments;
    this.duration = chosen.real;
    this.encounters = featured.filter(e => e.cleared + HOLD_S <= end);
  }

  /** Simulation time reached after `real` seconds of playback. */
  simAt(real: number): number {
    const r = Math.max(0, Math.min(this.duration, real));
    let lo = 0, hi = this.segments.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.segments[mid].real <= r) lo = mid; else hi = mid - 1; }
    const seg = this.segments[lo];
    return Math.min(seg.to, seg.from + (r - seg.real) * seg.speed);
  }

  speedAt(sim: number): number { return this.segments.find(s => sim >= s.from && sim < s.to)?.speed ?? 300; }

  private state(i: number, t: number): FlightState | null {
    const list = this.states[i];
    let lo = 0, hi = list.length - 1, found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid].s <= t) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    return found < 0 ? null : list[found];
  }

  trajectory(id: string, t: number): PathView | null {
    const i = this.recording.flights.findIndex(f => f.id === id);
    return i < 0 ? null : this.state(i, t)?.trajectory ?? null;
  }

  activeTrajectories(t: number): { id: string; level: number; path: PathView }[] {
    return this.recording.flights.flatMap((f, i) => { const st = this.state(i, t); return st?.status === 'active' && st.trajectory ? [{ id: f.id, level: f.filed_level_fl, path: st.trajectory }] : []; });
  }

  /** Airborne aircraft, interpolated between the 20 s keyframes. */
  planes(t: number): Plane[] {
    const { frames, flights } = this.recording;
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].s <= t) lo = mid; else hi = mid - 1; }
    const a = frames[lo], b = frames[Math.min(frames.length - 1, lo + 1)];
    const f = b.s > a.s ? Math.max(0, Math.min(1, (t - a.s) / (b.s - a.s))) : 0;
    const next = new Map(b.p.map(row => [row[0], row]));
    return a.p.flatMap(([i, lon, lat, alt, heading]) => {
      if (this.state(i, t)?.status !== 'active') return [];
      const n = next.get(i);
      const mix = (x: number, y: number | undefined) => y == null ? x : x + (y - x) * f;
      const turn = n ? ((n[4] - heading + 540) % 360) - 180 : 0;
      return [{ i, id: flights[i].id, callsign: flights[i].callsign, lon: mix(lon, n?.[1]), lat: mix(lat, n?.[2]), level: mix(alt, n?.[3]) / 30.48, heading: (heading + turn * f + 360) % 360 }];
    });
  }

  lossesAt(t: number): number { let l = 0; for (const [s, v] of this.losses) { if (s > t) break; l = v; } return l; }

  wind(t: number): WindGrid | null { return this.recording.wind?.[Math.floor(t / 900) * 900] ?? null; }
}
