import type { ControlRequest, EventData, FlightView, PathView, ServerEvent, WindGrid, WorldView } from '../api/types.gen';
import { useDemo } from '../store/useDemo';

type StaticFlight = Omit<FlightView, 'position' | 'status' | 'trajectory'>;
export type Entry =
  | [number, 'flight', { i: number; status: FlightView['status']; trajectory: PathView | null }]
  | [number, 'world', { q: number; c: number; l: number; f: boolean }]
  | [number, 'event', { type: ServerEvent['type']; data: EventData }];

/** A backend run captured by tools/record_walkthrough.mjs. Times are simulation seconds. */
export interface Recording {
  version: 1;
  meta: { scenario: string; jitStartupMs: number | null; startSim: number; endSim: number };
  world: Pick<WorldView, 'scenario' | 'start_utc' | 'speed' | 'tracks' | 'backend' | 'seed' | 'formulation'>;
  flights: StaticFlight[];
  /** Positions per keyframe: [flight index, lon, lat, altitude m, heading °, ground speed m/s]. */
  frames: { s: number; p: number[][] }[];
  entries: Entry[];
  /** Map wind fields by 15-minute bucket, as the backend serves them. */
  wind?: Record<string, WindGrid>;
}

/** Points in the story flight's life that a scene may need before it can show anything. */
export type Cue = 'filed' | 'solve' | 'cleared' | 'complete';

export function cuesOf(recording: Recording, flightId: string | null): Partial<Record<Cue, number>> {
  const cues: Partial<Record<Cue, number>> = {};
  if (!flightId) return cues;
  const index = recording.flights.findIndex(f => f.id === flightId);
  const frame = recording.frames.find(f => f.p.some(p => p[0] === index));
  if (frame) cues.filed = frame.s;
  for (const [s, kind, payload] of recording.entries) {
    if (kind !== 'event') continue;
    if (payload.type === 'solve_started' && payload.data.solve?.flight_id === flightId) cues.solve ??= s;
    if (payload.data.record) {
      if (payload.data.record.flight_id === flightId) cues.cleared ??= s;
      cues.complete = s;
    }
  }
  return cues;
}

const players: ReplayPlayer[] = [];
let activeIndex = -1;

/**
 * Plays a recording into the same store the live backend feeds, at the recorded
 * simulation speed. The control surface mirrors the backend's reset / play / pause.
 * Only the most recently used player writes to the store.
 */
export class ReplayPlayer {
  private recording: Recording | null = null;
  private loading: Promise<Recording | null> | null = null;
  private cues: Partial<Record<Cue, number>> = {};
  private clock = 0;
  private frame = 0;
  private entry = 0;
  private sequence = 0;
  private running = false;
  private loop = false;
  private lastAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: FlightView['status'][] = [];
  private trajectory: (PathView | null)[] = [];
  private scalars = { q: 0, c: 0, l: 0, f: false };

  constructor(private readonly url: string, private readonly storyFlight: string | null = 'XAT417') { players.push(this); }

  private activate() {
    const index = players.indexOf(this);
    if (activeIndex === index) return;
    for (const player of players) if (player !== this) player.stop();
    activeIndex = index;
  }

  load(): Promise<Recording | null> {
    this.loading ??= fetch(this.url)
      .then(response => response.ok ? response.json() as Promise<Recording> : null)
      .then(recording => { if (recording) this.use(recording); else this.loading = null; return recording; })
      .catch(() => { this.loading = null; return null; });
    return this.loading;
  }

  use(recording: Recording) {
    this.recording = recording;
    this.loading = Promise.resolve(recording);
    this.cues = cuesOf(recording, this.storyFlight);
  }

  cue(name: Cue): number | null { return this.cues[name] ?? null; }

  wind(time: number): WindGrid | null { return this.recording?.wind?.[Math.floor(time / 900) * 900] ?? null; }

  async control(request: ControlRequest): Promise<boolean> {
    if (!await this.load()) return false;
    this.activate();
    if (request.action === 'reset') { this.loop = false; this.running = false; this.reset(); }
    else if (request.action === 'play') this.setRunning(true);
    else if (request.action === 'pause') this.setRunning(false);
    return true;
  }

  /** Background motion for the overview: plays from the start and repeats. */
  async ambient() {
    if (!await this.load()) return;
    this.activate();
    this.loop = true;
    this.reset();
    this.setRunning(true);
  }

  /** Take over the store again, rebuilt exactly as it was at this player's clock. */
  async restore(running: boolean) {
    if (!await this.load()) return;
    this.activate();
    const at = this.clock;
    this.reset();
    this.seekTo(at);
    this.setRunning(running);
  }

  stop() {
    this.running = false;
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Jump forward only, so a scene never shows the run going backwards. */
  seekTo(simTime: number) {
    const recording = this.recording;
    if (!recording || simTime <= this.clock) return;
    this.clock = Math.min(simTime, recording.meta.endSim);
    this.advance(this.clock);
  }

  private emit(type: ServerEvent['type'], data: EventData) {
    const store = useDemo.getState();
    if (store.source === 'replay' && players[activeIndex] === this) store.receive({ type, sequence: ++this.sequence, data });
  }

  private world(): WorldView {
    const recording = this.recording!;
    const frame = recording.frames[this.frame];
    return {
      ...recording.world,
      sim_time_s: frame.s,
      running: this.running,
      frozen_for_solve: this.scalars.f,
      queue_size: this.scalars.q,
      insertions_cleared: this.scalars.c,
      separation_losses: this.scalars.l,
      flights: frame.p.map(([i, lon, lat, altitude_m, heading_deg, ground_speed_ms]) => ({
        ...recording.flights[i], status: this.status[i], trajectory: this.trajectory[i],
        position: { lon, lat, altitude_m, heading_deg, ground_speed_ms },
      })),
    };
  }

  private reset() {
    const recording = this.recording!;
    this.clock = recording.meta.startSim;
    this.frame = 0;
    this.entry = 0;
    this.status = recording.flights.map(() => 'filed');
    this.trajectory = recording.flights.map(() => null);
    this.scalars = { q: 0, c: 0, l: 0, f: false };
    this.advance(this.clock, false);
    this.emit('hello', { world: this.world(), history: [], jit_startup_ms: recording.meta.jitStartupMs });
  }

  private advance(to: number, announce = true) {
    const { frames, entries } = this.recording!;
    let changed = false;
    while (this.entry < entries.length && entries[this.entry][0] <= to) {
      const [, kind, payload] = entries[this.entry++];
      if (kind === 'flight') { this.status[payload.i] = payload.status; this.trajectory[payload.i] = payload.trajectory; changed = true; }
      else if (kind === 'world') { this.scalars = payload; changed = true; }
      else if (announce) this.emit(payload.type, payload.data);
    }
    while (this.frame + 1 < frames.length && frames[this.frame + 1].s <= to) { this.frame++; changed = true; }
    if (changed && announce) this.emit('world_tick', { world: this.world() });
  }

  private setRunning(running: boolean) {
    this.running = running;
    this.lastAt = performance.now();
    if (running && this.timer == null) this.timer = setInterval(() => this.tick(), 100);
    this.emit('world_tick', { world: this.world() });
  }

  private tick() {
    const recording = this.recording;
    const now = performance.now(), seconds = (now - this.lastAt) / 1000;
    this.lastAt = now;
    if (!recording || !this.running) return;
    this.clock = Math.min(recording.meta.endSim, this.clock + seconds * recording.world.speed);
    this.advance(this.clock);
    if (this.clock < recording.meta.endSim) return;
    if (this.loop) { this.reset(); this.setRunning(true); }
    else this.setRunning(false);
  }
}

export const replay = new ReplayPlayer('/replay/walkthrough.json');
export const activePlayer = () => players[activeIndex] ?? replay;
export function stopAll() { for (const player of players) player.stop(); }
