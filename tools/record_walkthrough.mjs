#!/usr/bin/env node
/**
 * Record a backend run into a compact replay file the web app plays.
 *
 *   node tools/record_walkthrough.mjs [--preset=walkthrough|fleet|loop] [--backend=127.0.0.1:8765] [--minutes=N]
 *
 * This resets the backend to the preset's scenario.
 * - walkthrough: `study_loop` -> public/replay/walkthrough.json. The three scripted
 *   requests run at 10x; once settled, the sky is recorded at 60x for three simulated
 *   hours so a presenter can linger on any scene.
 * - fleet: `fleet_showcase` -> public/replay/fleet.json. At 10x, until a minute after
 *   the eight scripted encounters clear, with seeded filings in between. Candidate geometry is kept only for
 *   routes the sampler visited, since only those are ever drawn.
 * Nothing is written unless every request verified (or, for `loop`, was safely held) with no separation loss.
 * The map's wind fields for the recorded period are stored too, so playback needs no
 * backend. `--wind-only` adds them to an existing recording without re-running it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const backend = args.backend ?? '127.0.0.1:8765';
const PRESETS = {
  walkthrough: { scenario: 'study_loop', file: 'walkthrough.json', minutes: 180, records: 3, story: 'XAT417', fastForward: true, slim: false },
  // Stop shortly after the scripted encounters so the loop ends on a settled sky.
  fleet: { scenario: 'fleet_showcase', file: 'fleet.json', minutes: 40, records: 8, story: null, fastForward: false, slim: true, tailSeconds: 60 },
  // Two simulated hours at 10x for /loop_demo, so every solve keeps its real duration.
  // Background filings may be held for a controller; the loop only features verified clearances.
  loop: { scenario: 'tv_loop', file: 'loop.json', minutes: 125, records: 10, story: null, fastForward: false, slim: true, allowHeld: true },
};
const preset = PRESETS[args.preset ?? 'walkthrough'];
if (!preset) throw new Error(`Unknown preset ${args.preset}`);
const minutes = Number(args.minutes ?? preset.minutes);
const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'replay', preset.file);
const { scenario: SCENARIO, story: STORY, records: SCRIPTED } = preset, FRAME_S = 20;

const sleep = ms => new Promise(done => setTimeout(done, ms));
async function control(body) {
  const response = await fetch(`http://${backend}/api/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${body.action} failed: ${response.status} ${await response.text()}`);
}
const state = async () => (await fetch(`http://${backend}/api/state`)).json();
const round = (value, digits = 4) => typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 10 ** digits) / 10 ** digits : value;
const compact = value => Array.isArray(value) ? value.map(compact)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compact(v)])) : round(value);

/** Wind is analytic per scenario; the map requests one grid per 15 simulated minutes. */
async function windGrids(from, to) {
  const grids = {};
  for (let t = Math.floor(from / 900) * 900; t <= to; t += 900) {
    const grid = await (await fetch(`http://${backend}/api/wind/grid?t=${t}`)).json();
    grids[t] = { ...grid, u_ms: grid.u_ms.map(v => round(v, 1)), v_ms: grid.v_ms.map(v => round(v, 1)) };
  }
  return grids;
}

await control({ action: 'pause' });
for (;;) {
  const world = await state();
  if (!world.queue_size && !world.flights.some(f => f.status === 'solving')) break;
  console.log('Waiting for the backend to finish its current insertion…');
  await sleep(1000);
}

if (args['wind-only'] != null) {
  const recording = JSON.parse(readFileSync(out, 'utf8'));
  await control({ action: 'reset', scenario: SCENARIO });
  recording.wind = await windGrids(recording.meta.startSim, recording.meta.endSim);
  writeFileSync(out, JSON.stringify(recording));
  console.log(`Added ${Object.keys(recording.wind).length} wind grids to ${out}.`);
  process.exit(0);
}

const flights = [], index = new Map(), last = [], frames = [], entries = [], records = [];
let stopAt = null, base = null, meta = null, sim = 0, lastFrame = -Infinity, lastScalars = '', armed = false, fast = false, done;
const finished = new Promise(resolve => { done = resolve; });

function onWorld(world) {
  sim = world.sim_time_s;
  for (const flight of world.flights) {
    let i = index.get(flight.id);
    if (i == null) {
      i = flights.length;
      index.set(flight.id, i);
      const { position: _p, status: _s, trajectory: _t, ...fixed } = flight;
      flights.push(compact(fixed));
      last.push({ status: null, trajectory: 'null' });
    }
    const trajectory = JSON.stringify(flight.trajectory);
    if (last[i].status !== flight.status || last[i].trajectory !== trajectory) {
      last[i] = { status: flight.status, trajectory };
      entries.push([sim, 'flight', { i, status: flight.status, trajectory: compact(flight.trajectory) }]);
    }
  }
  const scalars = { q: world.queue_size, c: world.insertions_cleared, l: world.separation_losses, f: world.frozen_for_solve };
  if (JSON.stringify(scalars) !== lastScalars) { lastScalars = JSON.stringify(scalars); entries.push([sim, 'world', scalars]); }
  if (sim - lastFrame >= FRAME_S) {
    lastFrame = sim;
    frames.push({ s: sim, p: world.flights.map(f => [index.get(f.id), round(f.position.lon, 3), round(f.position.lat, 3), Math.round(f.position.altitude_m), round(f.position.heading_deg, 1), Math.round(f.position.ground_speed_ms)]) });
  }
}

const ws = new WebSocket(`ws://${backend}/ws`);
let greeted;
const greeting = new Promise(resolve => { greeted = resolve; });
let closing = false;
ws.onerror = () => { if (closing) return; console.error('WebSocket error'); process.exit(1); };
ws.onclose = () => { if (!meta?.endSim) { console.error('Backend closed the connection before the recording finished.'); process.exit(1); } };
ws.onmessage = message => {
  const event = JSON.parse(message.data);
  if (!armed) { greeted(); return; }
  if (event.type === 'hello') {
    if (base || event.data.world?.scenario !== SCENARIO) return;
    const { flights: _f, ...world } = event.data.world;
    base = { scenario: world.scenario, start_utc: world.start_utc, speed: world.speed, tracks: compact(world.tracks), backend: world.backend, seed: world.seed, formulation: world.formulation };
    meta = { scenario: SCENARIO, jitStartupMs: round(event.data.jit_startup_ms ?? null, 1), startSim: world.sim_time_s, endSim: null };
    onWorld(event.data.world);
    return;
  }
  if (!base) return;
  if (event.data.world) onWorld(event.data.world);
  if (event.type !== 'world_tick') {
    const { world: _w, history: _h, ...data } = event.data;
    if (data.record) { data.record = { ...data.record, snapshot: null }; records.push(data.record); console.log(`${data.record.callsign}: ${data.record.outcome}`); }
    entries.push([sim, 'event', { type: event.type, data: compact(data) }]);
  }
  const settled = records.length >= SCRIPTED && JSON.parse(lastScalars).q === 0 && !last.some(f => f.status === 'solving');
  if (settled && !fast && preset.fastForward) { fast = true; void control({ action: 'speed', speed: 60 }); console.log('Scripted requests settled. Recording the rest of the sky at 60×…'); }
  if (preset.tailSeconds && stopAt == null && records.length >= SCRIPTED) stopAt = sim + preset.tailSeconds;
  if (sim - meta.startSim >= minutes * 60 || (stopAt != null && sim >= stopAt)) { meta.endSim = sim; done(); }
};

await new Promise(resolve => { ws.onopen = resolve; });
await greeting;
armed = true;
await control({ action: 'reset', scenario: SCENARIO });
await control({ action: 'play' });
console.log(`Recording ${SCENARIO} from ${backend} for ${minutes} simulated minutes…`);
await finished;
await control({ action: 'pause' });
closing = true;
ws.close();

const losses = JSON.parse(lastScalars).l;
const story = !STORY || records.some(r => r.flight_id === STORY);
const verified = records.filter(r => r.verified).length;
if (records.length < SCRIPTED || (verified < records.length && !preset.allowHeld) || verified < SCRIPTED || losses || !story) {
  console.error(`Not saved: ${records.length} records, ${records.filter(r => r.verified).length} verified, ${losses} separation losses.`);
  process.exit(1);
}
if (preset.slim) {
  // Progress events follow their solve_started; keep geometry for every route they sampled.
  const sampled = new Map();
  let solve = null;
  for (const [, kind, payload] of entries) {
    if (kind !== 'event') continue;
    if (payload.type === 'solve_started' && payload.data.solve) { solve = payload.data.solve; sampled.set(solve, new Set()); }
    for (const ids of payload.data.progress?.active_candidates ?? []) for (const id of ids) sampled.get(solve)?.add(id);
  }
  for (const [solved, keep] of sampled) solved.candidates = solved.candidates.map((c, i) => keep.has(i) ? c : { ...c, points: [], times_s: [] });
}
mkdirSync(dirname(out), { recursive: true });
const recording = { version: 1, meta, world: base, flights, frames, entries, wind: await windGrids(meta.startSim, meta.endSim) };
writeFileSync(out, JSON.stringify(recording));
console.log(`Saved ${out}: ${frames.length} frames, ${entries.length} entries, ${(JSON.stringify(recording).length / 1e6).toFixed(1)} MB.`);
