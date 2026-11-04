Codex Build Spec: ORBIT NAT Deconfliction Demonstrator
22 Oct 2026 · @Ehsan
0. How to use this spec with Codex
This document is the single source of truth for building the demonstrator: a local GUI app, developed in VS Code, that runs a synthetic North Atlantic airspace forward in time and inserts each newly filed flight using the QUBO deconfliction method from the SESAR short paper and the long-form notes, solved by a p-bit Gibbs sampler (emulated by default, ORBIT hardware when available).
Recommended working loop:
1. Export this doc to Markdown and commit it at the repo root as SPEC.md. Commit the text in section 13 as AGENTS.md (Codex reads it automatically).
2. Give Codex one milestone at a time from section 12, e.g. "Implement milestone M3 from SPEC.md. Stop when its acceptance tests pass and report what you built."
3. Each milestone has acceptance criteria that are runnable tests. Codex must not mark a milestone done until make check passes.
4. When Codex hits something this spec does not settle, it must write the question into docs/OPEN_QUESTIONS.md and pick the simplest option that keeps the interfaces in this spec unchanged.
5. Review a milestone in VS Code before starting the next one. Later milestones assume earlier interfaces exactly as specified.
Conventions used throughout: SI units internally (metres, seconds, radians) with conversion only at the edges; aviation units (NM, FL, minutes, degrees) only in config files and the UI. "Flight N" is the flight being inserted; flights 1..N-1 are already deconflicted and frozen.
1. Goal and demo narrative
Build a live demonstrator in which synthetic eastbound NAT traffic flows over time, new flights file continuously, and each filing is resolved in well under a second by annealing a QUBO, with every stage of the solve visible on screen. The design is the three-screen mockup on the ORBIT Deconfliction Demonstrator canvas.
The story the app tells
1. The sky. About 30 eastbound flights cross the NAT on an organised track system under a moving jet stream. Time advances at a selectable rate (1×, 10×, 60×, 300×).
2. A flight files. A new flight requests oceanic entry. The app predicts its conflicts against the frozen traffic and shows them on the map and vertical profile.
3. The anneal. The insertion is encoded as a QUBO and handed to the solver. The UI streams the real sampler state: replica trajectories ("ghosts") spray across the deviation skeleton at low β and collapse onto one path as β rises. The energy trace and β ramp update live.
4. The clearance. The best feasible solution is decoded, independently verified, and issued as a two-line datalink clearance. The flight joins the frozen sky and the clock continues.
Screens (from the mockup)
Screen
Purpose
Key live elements
1. Control room
Hero view of the airspace and the current insertion
Map, vertical profile, ORBIT panel, KPI strip, flight strip, clearance card
2. Inside ORBIT
Explain the solver using the current solve's real data
Three anneal snapshots at captured β, QUBO term tiles from the real matrix, hardware panel
3. Flight deck
Show what the pilot receives
Navigation display, CPDLC message generated from the clearance, "behind those two lines" stats
Add a fourth, small panel not in the mockup: an insertion log (history of every filing with outcome) that can scrub a recorded run.
Honesty constraints (mandatory)
• Everything shown is synthetic unless a real data file is loaded. Show a persistent SYNTHETIC DATA badge in the top bar whenever the synthetic generator is active.
• Callsigns come from a fixed list of fictitious prefixes in config. Never generate real airline designators.
• Solver timings shown in the UI are the timings measured on the machine running the demo. Label the backend in use (p-bit emulator (CPU) or ORBIT). Never display the paper's hardware figures as if they were measured live; show them only on the static hardware panel, labelled as specifications.
• An insertion that is infeasible is shown as infeasible, with the fallback taken (section 5). Do not hide failures.
• No clearance is issued unless the independent verifier (section 8) passes. The QUBO energy is never trusted for safety.
Non-goals
• Not an operational ATC tool, no real surveillance feeds, no real CPDLC.
• No departure, approach or terminal-area modelling; flights exist only between oceanic entry and exit.
• No speed control as a manoeuvre (speed profiles are fixed, matching the paper).
• No multi-flight perturbation in v1. The outer loop from the long-form notes is a stretch goal (M10).
2. Architecture, stack and VS Code setup
Two processes on one machine: a Python backend that owns the simulation, the deconfliction maths and the solver, and a TypeScript web frontend that renders the three screens. They talk over one WebSocket plus a small REST API. Python is chosen for the backend because the maths (numpy/scipy/numba), ERA5 handling (xarray) and any ORBIT SDK are Python-native; a web frontend is chosen because the mockup's layered SVG/Canvas visuals map directly onto it.
Stack (pin these versions or newer minor releases)
Layer
Choice
Notes
Python
3.12
managed with uv (uv sync)
Numerics
numpy 2.x, scipy 1.14+, numba 0.60+
numba for the Gibbs sampler inner loop
Sparse matrices
scipy.sparse (CSR/COO)
Q is assembled as COO, solved as CSR
Web server
FastAPI 0.115+, uvicorn
WebSocket at /ws, REST under /api
Models
pydantic 2.x
every message and config object
Config
PyYAML + pydantic-settings
config/default.yaml, overridable per scenario
Weather (optional)
xarray + netCDF4
only if a real ERA5 file is supplied
Python tooling
ruff, mypy (strict on core/), pytest, hypothesis

Frontend
Node 20 LTS, Vite 5, React 18, TypeScript 5 (strict)

State
zustand
one store, slices per domain
Rendering
SVG for static/low-count layers, Canvas 2D for ghosts, aircraft, wind particles
60 fps interpolation between ticks
Fonts
@fontsource/ibm-plex-sans, @fontsource/ibm-plex-mono
self-hosted so the demo runs offline
Frontend tests
vitest, @testing-library/react, Playwright (smoke)

Type sharing
pydantic → JSON Schema → json-schema-to-typescript
generated into web/src/api/types.gen.ts, never hand-edited
Repository layout
orbit-nat-demo/
├── SPEC.md                     # this document
├── AGENTS.md                   # Codex working rules (section 13)
├── Makefile                    # dev, check, test, types, demo targets
├── config/
│   ├── default.yaml            # every parameter (section 3)
│   └── scenarios/              # calm.yaml, busy.yaml, hero_crossing.yaml, paper_worst_case.yaml, tight_skeleton.yaml
├── backend/
│   ├── pyproject.toml
│   ├── src/nat_demo/
│   │   ├── config.py           # pydantic config models + loader
│   │   ├── units.py            # NM/FL/min ↔ SI conversions
│   │   ├── geo/
│   │   │   ├── sphere.py       # unit vectors, great circles, Rodrigues rotation
│   │   │   └── segment_distance.py  # arc-to-arc minimum distance
│   │   ├── synth/
│   │   │   ├── wind.py         # analytic jet stream (+ optional ERA5 loader)
│   │   │   ├── tracks.py       # OTS-like track generator
│   │   │   ├── traffic.py      # flight filings, callsigns, levels, Mach
│   │   │   ├── director.py     # conflict injection / scripted beats
│   │   │   └── scenario.py     # scenario build from YAML, seeded
│   │   ├── core/               # pure deconfliction maths, no I/O
│   │   │   ├── skeleton.py     # deviation skeleton (lateral × vertical)
│   │   │   ├── edge_costs.py   # wind-aware traversal times per edge/subinterval
│   │   │   ├── conflicts.py    # spatial conflict sets, level compatibility
│   │   │   ├── envelopes.py    # forward/backward DP time envelopes
│   │   │   ├── classify.py     # Safe / ForceX / ForceY / Choice / Impossible + collapse
│   │   │   ├── qubo/
│   │   │   │   ├── encoding.py # variable index map (edges, slacks, order bits)
│   │   │   │   ├── terms.py    # Q_P, Q_O, Q_E, Q_H, Q_T, Q_M builders
│   │   │   │   ├── assemble.py # λ weighting, scaling, offset tracking
│   │   │   │   └── decode.py   # bits → (θ, χ) path, slack checks
│   │   │   └── verify.py       # independent continuous-time separation check
│   │   ├── solvers/
│   │   │   ├── base.py         # Solver protocol, SolveResult, ProgressEvent
│   │   │   ├── pbit_emulator.py
│   │   │   ├── brute_force.py  # tiny instances only, tests
│   │   │   └── orbit_adapter.py  # stub until the ORBIT API is confirmed
│   │   ├── sim/
│   │   │   ├── clock.py
│   │   │   ├── world.py        # flights, positions, cleared trajectories
│   │   │   ├── insertion.py    # filing → QUBO → solve → verify → clear
│   │   │   ├── monitor.py      # global separation monitor
│   │   │   └── recorder.py     # JSONL run recording + replay
│   │   └── api/
│   │       ├── app.py          # FastAPI app factory
│   │       ├── routes.py       # REST
│   │       ├── ws.py           # WebSocket hub, throttling
│   │       └── messages.py     # pydantic message models (source of TS types)
│   └── tests/                  # mirrors src/ (section 11)
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── api/                # ws client, rest client, types.gen.ts
│       ├── store/              # zustand slices: world, solve, ui, history
│       ├── theme/tokens.ts     # colours and type from section 10
│       ├── geo/projection.ts   # lon/lat → map px (same as mockup)
│       ├── screens/            # ControlRoom, InsideOrbit, FlightDeck
│       ├── components/         # map layers, profile, orbit panel, cards
│       └── presenter/          # keyboard shortcuts, director controls
├── tools/
│   ├── gen_types.py            # pydantic → JSON Schema → TS
│   └── bench_solver.py         # solver timing benchmark
├── runs/                       # recorded runs (gitignored)
└── .vscode/
    ├── launch.json
    ├── tasks.json
    ├── extensions.json
    └── settings.json
VS Code configuration
.vscode/extensions.json recommends: ms-python.python, ms-python.debugpy, charliermarsh.ruff, ms-python.mypy-type-checker, dbaeumer.vscode-eslint, esbenp.prettier-vscode, vitest.explorer, ms-playwright.playwright, redhat.vscode-yaml.
.vscode/launch.json must provide these configurations:
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend (uvicorn, reload)",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": ["nat_demo.api.app:create_app", "--factory", "--reload", "--port", "8765"],
      "cwd": "${workspaceFolder}/backend",
      "env": { "NAT_DEMO_SCENARIO": "hero_crossing" },
      "justMyCode": false
    },
    {
      "name": "Frontend (Vite)",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/web"
    },
    {
      "name": "Solve one scenario (headless)",
      "type": "debugpy",
      "request": "launch",
      "module": "nat_demo.cli",
      "args": ["solve", "--scenario", "hero_crossing", "--verbose"],
      "cwd": "${workspaceFolder}/backend"
    }
  ],
  "compounds": [
    { "name": "Demo: backend + frontend", "configurations": ["Backend (uvicorn, reload)", "Frontend (Vite)"], "stopAll": true }
  ]
}
.vscode/tasks.json exposes: check (ruff, mypy, pytest, eslint, tsc, vitest), gen-types, bench-solver, demo (production build served by the backend on one port for presentations). Vite proxies /api and /ws to localhost:8765.
Makefile targets: make dev, make check, make test, make types, make bench, make demo (builds the web bundle into backend/src/nat_demo/static and serves everything from uvicorn, so a presenter runs one command and opens one URL).
The diagram below shows how the parts connect at run time.
3. Configuration
Every tunable lives in config/default.yaml, loaded into pydantic models in config.py; scenario files override any subset. Defaults reproduce the paper's experimental setup where the paper states a value (marked # paper). Values without that mark are this spec's choices and are safe to tune.
seed: 20250301                    # global seed; every random draw derives from it

time:
  start_utc: "2025-03-01T10:00:00Z"
  tick_s: 5                       # simulation step
  speed_options: [1, 10, 60, 300] # sim seconds per wall second
  default_speed: 60
  freeze_sky_during_solve: true   # presentation mode: sim clock pauses while a solve streams
  ui_tick_hz: 10                  # max world_tick messages per second to the UI

airspace:
  lon_range_deg: [-62, -2]
  lat_range_deg: [38, 64]
  oceanic_entry_lon_deg: -52
  oceanic_exit_lon_deg: -12
  fir_boundary_lon_deg: -30       # Gander / Shanwick, display only
  legal_levels_eastbound: [310, 330, 350, 370, 390, 410]   # paper

separation:
  lateral_nm: 30                  # alpha, paper
  time_buffer_min: 3              # Delta, paper
  vertical_ft: 1000               # used by the verifier during level transitions

skeleton:
  K: 1                            # lateral deviation index range, paper
  J: 1                            # vertical deviation index range, paper
  lateral_spacing_nm: 30          # d; a +/-1 offset must be able to clear alpha
  waypoints_per_flight: 12        # T + 1 including entry and exit
  subintervals_per_edge: 4        # delta in the paper
  edge_cost_substeps: 20          # M in the long-form notes, for wind integration
  climb_rate_fpm: 1500            # verifier only: level change starts right after the waypoint

schedule:
  envelope_min: 10                # script T, paper

objective:
  w_theta: 2                      # paper
  w_chi: 1                        # paper
  p: 2                            # paper

qubo:
  time_quantum_s: 5               # all times rounded to this grid before slack encoding
  prune_unreachable: true         # drop skeleton nodes outside the DP time window (section 6.5)
  lambda_auto: true               # derive penalty weights (section 7.7)
  lambda_margin: 1.5
  lambda_override: {}             # e.g. {H: 40, T: 10, O: 40, E: 40, M: 20}
  normalise: max_abs              # scale Q so max |Q_ij| = 1 before solving

solver:
  backend: pbit_emulator          # pbit_emulator | orbit | brute_force
  sweeps: 200000                  # paper
  beta_start: 0.0001              # paper
  beta_end: 32                    # paper
  beta_schedule: linear           # paper
  replicas: 24                    # paper ran 10 attempts; extra chains feed the ghost display
  progress_every_sweeps: 2000
  snapshot_every_sweeps: 2000     # ghost trajectories sent to the UI
  snapshot_betas: [0.6, 8.0, 32.0]  # captured for the Inside ORBIT screen
  time_budget_s: 5.0              # hard wall-clock stop
  orbit:
    endpoint_env: ORBIT_ENDPOINT
    api_key_env: ORBIT_API_KEY

fallback:
  expanded_skeleton: {K: 2, J: 2} # retry once if the first solve is infeasible
  entry_delay_step_min: 5         # then delay oceanic entry in steps
  entry_delay_max_min: 30         # then flag for controller attention

traffic:
  initial_active_flights: 29
  filings_per_hour: 18
  filing_lead_time_min: [20, 60]  # filing happens this long before oceanic entry
  track_count: 6
  track_spacing_deg_lat: 1.0
  random_route_fraction: 0.25     # flights off the track system, these create crossings
  level_weights: {310: 0.08, 330: 0.15, 350: 0.25, 370: 0.25, 390: 0.17, 410: 0.10}
  mach_range: [0.80, 0.86]
  callsign_prefixes: [XAT, XBQ, XCV, XDL, XEW]   # fictitious, never real designators
  aircraft_types: [B789, A359, B77W, A333, B38M, A21N]

director:
  enabled: true
  conflict_injection_probability: 0.35
  conflict_kind_weights: {spatial_only: 0.4, spatiotemporal: 0.6}
  scripted_beats: []              # scenario files add timed beats (section 4.6)

wind:
  source: synthetic               # synthetic | era5
  era5_path: null                 # NetCDF on pressure levels; paper used 1 March 2025
  jet_core_kt: 140
  jet_width_deg: 4.0
  jet_lat_deg: 48.6
  meander_amp_deg: 2.4
  meander_wavenumber: 1.25        # half-waves across the domain
  drift_deg_per_hour: 1.5         # meander phase speed eastwards
  level_peak_fl: 340
  level_width_fl: 90
  background_westerly_kt: 25
  forecast_error_kt: 0            # >0: flown wind differs from the planning wind (robustness demo)

ui:
  show_synthetic_badge: true
  ghost_max_paths: 40
  default_screen: control_room
The config models must reject unknown keys (extra="forbid") and validate ranges, e.g. beta_end > beta_start > 0, K, J >= 0, every legal level a multiple of 10, every level_weights key in legal_levels_eastbound.
4. Synthetic data generator (backend/src/nat_demo/synth/)
The generator produces a reproducible airspace that evolves over time: a moving jet stream, an organised track system, an initial deconflicted fleet, and a stream of new filings, some deliberately placed into conflict so the demo always has something to resolve.
4.1 Determinism
• One numpy.random.SeedSequence(config.seed) is spawned into independent child generators: wind, tracks, traffic, director, solver. A subsystem never draws from another's generator.
• Same seed + same config + same scenario must give byte-identical recorded runs (test in section 11), except wall-clock timing fields.
4.2 Wind field (wind.py)
Expose one vectorised function wind_uv(lon_deg, lat_deg, fl, t_s) -> (u_ms, v_ms) (eastward, northward), plus flown_wind_uv which adds forecast error.
Jet centreline latitude, with λ the longitude, λ₀ and λ₁ the domain edges, κ the meander wavenumber, ω derived from drift_deg_per_hour:
\phi_c(\lambda,t) = \phi_{jet} + A\,\sin\!\Big(\kappa\pi\,\tfrac{\lambda-\lambda_0}{\lambda_1-\lambda_0} - \omega t - 0.5\Big) + 0.06\,(\lambda-\lambda_0)
Wind speed, with Gaussian cross-jet and vertical profiles:
U(\lambda,\phi,FL,t) = U_{bg} + U_{jet}\,\exp\!\Big(-\big(\tfrac{\phi-\phi_c}{w}\big)^2\Big)\,\exp\!\Big(-\big(\tfrac{FL-FL_{peak}}{FL_{width}}\big)^2\Big)
Direction follows the centreline: heading angle ψ with tan ψ = (∂φ_c/∂λ) / cos φ, giving u = U cos ψ, v = U sin ψ. Add three seeded Fourier modes of amplitude about 5 kt so the field is not perfectly smooth. Forecast error, when enabled, is a second independent set of modes scaled to forecast_error_kt, added only in flown_wind_uv.
Optional ERA5 path (source: era5): open the NetCDF with xarray, read u, v on pressure levels, map flight level to pressure with the ISA (FL310 ≈ 287 hPa, FL330 ≈ 262, FL350 ≈ 238, FL370 ≈ 217, FL390 ≈ 197, FL410 ≈ 179), interpolate linearly in lon, lat, log-pressure and time. The rest of the code must not know which source is active.
The frontend also needs the wind for animated streamlines: expose GET /api/wind/grid?t= returning a 61 × 27 grid (1° spacing) at FL350, refreshed every simulated 15 minutes.
4.3 Track system (tracks.py)
• Anchor longitudes: [-52, -45, -37, -29, -20, -12] (configurable).
• For track_count tracks named A, B, C…, track i's latitude at each anchor = jet centreline at that longitude at scenario start + (i − (n − 1)/2) × track_spacing_deg_lat, so the system rides the tailwind as a real OTS does. Smooth by averaging each anchor with its neighbours once, then round to 0.5°.
• Tracks are published once per scenario run (v1 simplification; real tracks change twice daily). Store them in the world state and send them to the UI on connect.
4.4 Flights (traffic.py)
Flight fields: id, callsign, aircraft_type, mach, filed_level_fl, route_lonlat (the T + 1 nominal waypoints), track_id | None, filing_time, entry_time (τ₀), scheduled_exit_time (τ₁), status (filed | solving | cleared | active | exited | held), cleared_trajectory | None.
• Callsigns: prefix from callsign_prefixes + three digits, unique within a run.
• Routes: track flights take the track's anchors; random-route flights draw an entry latitude in [46°, 56°] at the entry longitude and an exit latitude in [49°, 58°] at the exit longitude and follow the great circle between them. Either way, resample to exactly waypoints_per_flight points equally spaced in great-circle distance.
• Level from level_weights; Mach uniform in mach_range.
• True airspeed: TAS = M × a(FL) with ISA speed of sound (a = 295.07 m/s above 11 km; below, from T = 288.15 − 0.0065 h K).
• Scheduled exit τ₁ = τ₀ + nominal traversal time at the filed level with the planning wind (section 6.3), so the nominal trajectory is exactly on schedule and arrival deviation is measured from it, as in the paper.
• Filings: a Poisson process at filings_per_hour; entry time = filing time + uniform(filing_lead_time_min).
Initial fleet. Generate candidates as if filed over the previous 4 simulated hours and accept a candidate only if the independent verifier (section 8.6) finds no loss of separation between its nominal trajectory and every accepted flight. Stop at initial_active_flights. This guarantees the run starts deconflicted, which the paper's sequential-insertion framing assumes.
4.5 Conflict director (director.py)
With probability conflict_injection_probability, a new filing is tailored into a conflict rather than drawn freely:
1. Pick a target flight j among active and cleared flights whose remaining path lies inside the oceanic region for at least 40 minutes.
2. Choose geometry: a random route that crosses j's route (solve for the crossing point on the sphere), or j's own track (same-track catch-up, the paper's hardest case).
3. Choose the kind from conflict_kind_weights:
    ◦ spatiotemporal: same level as j at the crossing, and entry time set so that the predicted arrival at the crossing differs from j's by uniform(−2, +2) minutes, inside the Δ = 3 min buffer.
    ◦ spatial_only: same geometry, but a different level or a time offset of 6 to 15 minutes.
4. Reject and redraw if the resulting entry time is less than 20 minutes after the filing time.
The director also tags each filing with its conflict mix (fraction of the incoming flight's subintervals in no conflict, spatial only, spatiotemporal), which the UI shows in the conflict picture card.
4.6 Scripted beats
Scenario files can schedule exact events so a presenter knows what happens when. Each beat is {at_min, action, params} with actions:
Action
Params
Effect
file_flight
callsign, route (track:C or random), level, mach, conflict_with, kind, offset_min
Files a specific flight, placed by the director rules
set_speed
speed
Changes the sim rate
pause
—
Pauses the clock (presenter resumes)
wind_shift
drift_deg_per_hour, jet_core_kt
Alters the jet for subsequent filings
highlight
flight_id, screen
Switches the UI to a screen and focuses a flight
4.7 Scenario library (config/scenarios/)
Scenario
What it shows
Key settings
hero_crossing
The mockup moment: XAT 417 at FL370 crosses XAT 208 on track C near 20°W; resolved by one climb to FL390
Beat at 2 min: file_flight with conflict_with: XAT208, kind: spatiotemporal; speed 60×
calm
Steady flow, mostly spatial-only conflicts
12 filings/h, injection 0.2
busy
Continuous insertions for a long-running booth display
30 filings/h, injection 0.5
paper_worst_case
Same track, 7.25 min behind, same level; high complexity solution near the envelope edge
Beat with route track:C, offset_min: 7.25
tight_skeleton
An honest failure: conflict on the final edge, where only timing can separate and the endpoint is fixed; first solve infeasible, entry-delay fallback succeeds
Conflict placed on the last edge, K = J = 1
stress
Solver benchmarking
60 filings/h, UI optional
The tight_skeleton case mirrors the paper's four failures: expanding K and J does not help a final-edge conflict, so the fallback order in section 5.5 must try entry delay after the expanded skeleton.
4.8 Inspection tooling
python -m nat_demo.cli synth --scenario busy --hours 3 --out runs/busy_synth.json writes the tracks, every flight with its nominal trajectory, the director tags and a wind grid sample, so the data can be inspected without the UI.
5. Simulation engine (backend/src/nat_demo/sim/)
The engine advances a simulated clock, moves cleared flights along their 4D trajectories, releases new filings, runs one insertion at a time in first-filed, first-served order, and independently checks separation every tick.
5.1 Clock (clock.py)
• State: sim_time (UTC), speed (sim seconds per wall second), running, frozen_for_solve.
• An asyncio task advances the clock. Each wall frame (target 50 ms) adds speed × elapsed_wall sim seconds, processed as whole tick_s steps so results do not depend on frame rate.
• Controls: play(), pause(), set_speed(x), step(n_ticks), reset(scenario).
• When freeze_sky_during_solve is true, the clock pauses from solve_started to clearance_issued, so the audience watches the anneal against a still sky. When false, the sky keeps moving and solve latency is real.
5.2 World state (world.py)
• Holds tracks, the wind source, and all flights keyed by id.
• A cleared flight has a Trajectory4D: the chosen nodes (lon, lat, FL) per waypoint, the planned time at every waypoint and subinterval boundary (section 6.3), and level-change ramps starting immediately after the waypoint (climb rate from config).
• position(flight, t) returns lon, lat, altitude, heading, ground speed by interpolating along the great-circle edge using the subinterval times.
• When forecast_error_kt > 0, the flown times are recomputed with flown_wind_uv on the same path, so actual positions drift from the plan. The monitor uses flown positions; the solver only ever sees planned times. This is the robustness demo.
5.3 Per-tick order of operations
1. Advance sim_time by tick_s.
2. Release filings whose filing_time <= sim_time into the insertion queue (status filed), including scripted beats due now.
3. Status transitions: cleared → active at entry time; active → exited past the exit waypoint; held flights re-file after 15 simulated minutes.
4. If the insertion worker is idle and the queue is not empty, pop the earliest-filed flight and start the pipeline (section 5.4) on a worker thread. The numba kernels release the GIL (nogil=True), so the event loop keeps serving the UI.
5. Run the separation monitor (section 5.6).
6. Emit world_tick if at least 1 / ui_tick_hz seconds of wall time have passed since the last one.
5.4 Insertion pipeline (insertion.py)
Each step emits a pipeline_step event with its duration, so the UI and the log can show where time goes.
1. Frozen set. All cleared and active flights whose trajectories overlap the incoming flight's possible time window (entry time to scheduled exit + envelope). Flights still filed are excluded: first filed, first served.
2. Skeleton for flight N (section 6.2) and edge costs with the planning wind (section 6.3).
3. Spatial conflict set against the frozen flights' cleared trajectories, then level compatibility (section 6.4).
4. DP envelopes and conflict classification (sections 6.5, 6.6). If no pair needs a constraint, issue the nominal trajectory immediately with C_N = 0 (still verified) and skip the solver. The UI shows "No conflict · nominal clearance".
5. QUBO assembly (section 7).
6. Solve with streaming progress (section 8).
7. Decode and verify: decode the lowest-energy samples in order; the first that passes the independent verifier and the schedule check becomes the clearance.
8. Clear: store the Trajectory4D, set status cleared, emit clearance_issued with the CPDLC text (section 8.7).
9. Otherwise run the fallback chain.
5.5 Fallback chain
1. Retry with fallback.expanded_skeleton (K = J = 2).
2. Retry with the original skeleton and oceanic entry delayed by 5, 10 … up to 30 minutes (the scheduled exit stays fixed, so the envelope check still applies).
3. Mark the flight held, emit controller_attention, and re-file it after 15 minutes.
Every attempt is logged with its outcome. The UI shows the attempt number and reason on the status card; nothing is silent.
5.6 Separation monitor (monitor.py)
• Every tick, check all pairs of active flights using flown positions: a loss of separation is horizontal distance < 30 NM and vertical difference < 1000 ft.
• Use a 1° lat/lon bucket grid to avoid O(n²) work; at 30 to 60 flights, brute force is also acceptable.
• On a loss: emit separation_alert, show a red banner, record it. The KPI "Separation losses" must stay at 0 in every scenario except a deliberately configured forecast-error robustness demo, where any loss must be reported, not hidden.
5.7 Recording and replay (recorder.py)
• Every outbound WebSocket message is appended to runs/<timestamp>_<scenario>.jsonl, preceded by a header line with the resolved config, its SHA-256 and the git commit.
• Replay mode serves a recording through the same WebSocket at a chosen speed and supports seeking to any insertion, so a presenter can fall back to a recorded run if the laptop misbehaves.
• At shutdown, write runs/<...>_insertions.csv with one row per insertion (section 5.8 fields).
5.8 Per-insertion metrics
Field
Meaning
flight_id, callsign
Inserted flight
filed_at, cleared_at
Sim times
n_frozen, n_conflict_pairs
Frozen flights considered, conflicting subinterval pairs
class_counts
Pairs per class: safe, force_x, force_y, choice, impossible
n_vars, n_edge_bits, n_slack_bits, n_order_bits, nnz_q
QUBO size
t_build_ms, t_first_feasible_ms, t_99pct_ms, t_solve_ms, t_verify_ms
Wall-clock timings (99 % = first sample within 99 % of the final best energy, as in the paper)
c_n, c_n_lateral, c_n_vertical
Final complexity and its two parts
arrival_dev_min
Decoded exit time minus scheduled exit
attempts, fallback_used, outcome
cleared, cleared_after_fallback, held
backend
pbit_emulator or orbit
6. Deconfliction core (backend/src/nat_demo/core/)
This package is pure maths: numpy arrays in, numpy arrays out, no I/O, no global state, fully typed, mypy strict. It implements the formulation in the two papers for the single-insertion (PN) case: flight N is perturbable, every frozen flight j is fixed.
6.1 Geodesy (geo/sphere.py, geo/segment_distance.py)
• Earth radius R = 6 371 008.8 m; 1 NM = 1852 m.
• Unit vector x̂(φ, λ) = (cos φ cos λ, cos φ sin λ, sin φ).
• Angular distance δ(a, b) = atan2(‖a × b‖, a · b). Do not use arccos of the dot product (unstable for short arcs).
• Great-circle point at angle α from a towards b: x(α) = cos α · a + sin α · d̂, with d̂ = b / sin δ − a / tan δ.
• Arc-to-arc minimum distance d(u, v), as in the long-form notes:
    1. Plane normals n_u = normalise(u₀ × u₁), n_v likewise; candidate intersections ±p, p = normalise(n_u × n_v).
    2. A point q lies on arc (a, b) if δ(a, q) + δ(q, b) − δ(a, b) < 1e-9. If p or −p lies on both arcs, d = 0.
    3. Otherwise d = min of the four endpoint-to-arc distances. Point-to-arc: project x onto the arc's plane, q = normalise(x − (x · n)n); if q lies on the arc the distance is R · asin(|x · n|), else R · min(δ(x, a), δ(x, b)).
    4. Handle parallel planes (‖n_u × n_v‖ < 1e-12) and zero-length arcs explicitly.
• Vectorise: arc_distance_matrix(U0, U1, V0, V1) -> (len(U), len(V)) in metres, used with a prefilter (section 6.4).
6.2 Deviation skeleton (skeleton.py)
• Nominal waypoints x̂_τ, τ = 0 … T (T + 1 = waypoints_per_flight).
• At each interior waypoint compute both tangents at x̂_τ: the arriving tangent (from the arc τ − 1 → τ, evaluated at its end) and the departing tangent (towards τ + 1). The bisecting direction t̂_τ is their normalised sum; the lateral normal is n_τ = normalise(t̂_τ × x̂_τ). With this convention θ = +1 lies to the right of track (south for eastbound).
• Lateral nodes: W(τ, k) = cos(k d / R) · x̂_τ + sin(k d / R) · n_τ for k ∈ {−K … K}, d = lateral_spacing_nm.
• Vertical nodes: χ ∈ {−J … J} moves χ steps through the legal level list from the filed level (eastbound legal levels are 2000 ft apart, so χ = +1 from FL370 is FL390). A χ that steps outside the list is an illegal level, penalised by Q_H (section 7).
• Endpoints are fixed: θ₀ = θ_T = 0 and χ₀ = χ_T = 0.
• Node index per interior waypoint: node = (χ + J)(2K + 1) + (θ + K), so n_w = (2J + 1)(2K + 1) nodes (9 for K = J = 1); 1 node at each endpoint. This matches the lexicographic order in the long-form notes (level first, then lateral).
• Return a Skeleton dataclass: xyz[τ, node, 3], level_fl[τ, node] (NaN if illegal), theta[node], chi[node].
6.3 Edge costs (edge_costs.py)
• An edge (τ, a, b) joins node a at waypoint τ − 1 to node b at τ. Following the paper, the level change to b's level happens immediately after leaving τ − 1, so the edge is flown at b's level.
• Split each edge into edge_cost_substeps equal-angle pieces. For each piece, at its midpoint: tangent unit vector t̂, planning wind W, tailwind W_t = W · t̂, crosswind magnitude W_c = ‖W − W_t t̂‖, ground speed g = sqrt(TAS² − W_c²) + W_t, piece time = R Δα / g.
• Wind is evaluated at the insertion's entry time (v1: the field is frozen for the duration of one flight's planning; state this in the UI tooltip). An optional flag evaluates each piece at its estimated time.
• Subinterval boundaries: split each edge into δ = subintervals_per_edge equal-length sub-arcs; store cumulative times offset[τ, a, b, 0..δ] (offset[…, 0] = 0, offset[…, δ] = edge cost).
• Outputs: cost[τ, a, b] in seconds, offset[τ, a, b, s], nominal edge cost C̄_τ = cost[τ, nominal, nominal] and the delay array ΔC = cost − C̄_τ.
• Fully vectorised: all edges of a flight in one numpy pass. Target < 20 ms for K = J = 1, T = 11 on a laptop.
• Frozen flights keep the edge times stored at their own clearance; never recompute them.
6.4 Conflict sets (conflicts.py)
• Candidate sub-arcs for N: every (τ, a, b, s). Frozen sub-arcs: every (j, τ̃, s̃) of every frozen flight, each with a fixed occupation interval [v_in, v_out] and a fixed level.
• Prefilter in time first: drop a pair if v's interval, widened by Δ, does not intersect the widest possible occupation window of N's waypoint τ (from section 6.5). Then prefilter in space with a 1° grid hash of sub-arc bounding boxes buffered by α.
• Spatial conflict: d(u, v) ≤ α (equation (1) in the paper).
• Level compatibility: N's level on the edge equals v's level. Conservative transition rule (this spec's addition): if χ changes on edge (τ, a, b), its first sub-arc counts as occupying both the old and the new level.
• Output a ConflictTable with columns tau, a, b, s, j, v_in, v_out in seconds since N's entry time.
6.5 Time envelopes by dynamic programming (envelopes.py)
• Forward pass from the entry node: earliest and latest arrival at every node, t_min(τ, b) = min over a of t_min(τ − 1, a) + cost[τ, a, b], and t_max likewise with max. Illegal-level nodes are excluded.
• Backward pass from the exit node: least and greatest remaining time r_min(τ, a), r_max(τ, a).
• Schedule window for the total time: [L, U] = [τ₁ − τ₀ − T_env, τ₁ − τ₀ + T_env].
• Budget-aware window at each node: [max(t_min, L − r_max), min(t_max, U − r_min)]. Nodes with an empty window and edges into or out of them are pruned before encoding (config flag prune_unreachable: true, default on). Pruning shrinks the QUBO and never removes a schedule-feasible path.
• Sub-arc entry window for edge (τ, a, b), sub-arc s: node window of a shifted by offset[τ, a, b, s]; exit = entry + (offset[s + 1] − offset[s]).
6.6 Conflict classification (classify.py)
For each conflicting pair (u, v), with N's entry and exit windows from 6.5, define the two orderings: (X) N exits at least Δ before j enters, (Y) j exits at least Δ before N enters.
a_X = \min(\text{N exit}) + \Delta - v_{in},\quad b_X = \max(\text{N exit}) + \Delta - v_{in}
a_Y = v_{out} + \Delta - \max(\text{N entry}),\quad b_Y = v_{out} + \Delta - \min(\text{N entry})
Class
Condition
Encoding
Safe
b_X ≤ 0 or b_Y ≤ 0
nothing
Force X
a_X ≤ 0 < b_X and a_Y > 0
one big-M inequality
Force Y
a_Y ≤ 0 < b_Y and a_X > 0
one big-M inequality
Choice
a_X ≤ 0 < b_X and a_Y ≤ 0 < b_Y
two big-M inequalities + order bit z
Impossible
a_X > 0 and a_Y > 0
forbid the edge
Edge-level collapse (Table 2 of the notes): group pairs by (edge (τ, a, b), frozen flight j). If any pair is Impossible, or Force X and Force Y both occur, the edge is Impossible for that j. Otherwise keep Force X, Force Y or Choice for the group.
Aggregation (this spec's optimisation, exact): within one group, all X inequalities share the same variable part (N's arrival time at waypoint τ − 1) and differ only in constants, so keep only the binding one, with constant max over pairs of (offset[s + 1] + Δ − v_in). Likewise for Y with max over pairs of (v_out + Δ − offset[s]). A Choice group gets a single order bit z, which also enforces one consistent ordering per encounter (no overtaking within an edge). Record the number of pairs before and after aggregation in the metrics.
Time quantisation: all times entering the QUBO are integers in units of q = time_quantum_s, rounded to nearest. To stay conservative, add a margin of ceil(T / 2) quanta to Δ inside the QUBO only (worst-case accumulated rounding error is T · q / 2). The verifier always uses exact times with the true Δ.