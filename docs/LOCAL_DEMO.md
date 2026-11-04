# Live North Atlantic demonstrator

This is the Python-backed live application in `backend/` and `web/`. The Changi
presentation and its browser-only reference lab live separately in the root
Next.js project. Their source files and run commands are preserved.

Typography follows the Quantum Dice website: Instrument Sans for headings,
controls, telemetry and chart labels, and Lora for narrative body text. Both
families are bundled under `public/fonts/` with their licenses, so presentations
need no external font service. Text sizes and secondary colours are increased
across the manual screens and guided loop for presentation readability.

## Run

Requires Python 3.12, `uv`, Node.js 20.19+ and npm. Python dependencies are locked
in `backend/uv.lock`; frontend dependencies are locked in `web/package-lock.json`.

```sh
make setup       # install dependencies, once
make dev         # backend 8765, live interface 5173
```

Open <http://127.0.0.1:5173>. The overview is the front door: the Atlantic fleet in motion, the
headline idea and three study results. From there:

- **Start the walkthrough**: seven presenter-paced scenes (below). Its
  **Autoplay** switch runs the same scenes on a timer that repeats.
- **Explore the live system**, bottom left of the overview (or
  <http://127.0.0.1:5173/#explore>): the full control room, Inside ORBIT and
  Flight deck screens, driven by the live backend. The default **Atlantic fleet**
  scenario starts with 90 verified aircraft: 76 airborne and 14 cleared ahead,
  across eight corridors and six flight levels. **Start fleet demo** resets that
  scenario and starts the moving sky at 10×.
- **TV loop** at <http://127.0.0.1:5173/loop_demo>: an unattended 2½-minute loop
  for a large screen (below). It is not linked from the overview.

### Guided walkthrough

Each scene has one headline, one large visual and two or three numbers.

**The overview and walkthrough play a recorded run, not live calculations**, so
a presentation cannot stall on a slow solve, a busy machine or a missing backend.
They work with the backend stopped. The recording is a real `study_loop` run of
this pipeline (three scripted requests, all independently verified, no separation
losses), played in the browser at the recorded 10× speed through the same store
the backend feeds. It covers three simulated hours, so a presenter can linger on
any scene. Entering a scene jumps the run forward to the point that scene needs
(for example, the conflict scene starts once XAT417's candidates exist), so
presenter mode never shows a waiting state. **Explore the live system** still
connects to the live backend.

The story flight is XAT417. In `study_loop` it is filed along XBQ527's route and
conflicts with XAT208; neither a one-level change nor a 30 NM offset alone is safe
there, so the verified clearance combines both (climb to FL390, 30 NM right, then
rejoin the filed route at FL370).

Recordings live in `public/replay/`: `walkthrough.json` (the walkthrough),
`loop.json` (the TV loop) and `fleet.json` (an older `fleet_showcase` run, now only
the TV loop's fallback). Each also stores the map's wind fields for its period. To
re-record after changing the backend or a scenario, start a backend (any port) and
run one of:

```sh
node tools/record_walkthrough.mjs --preset=walkthrough --backend=127.0.0.1:8765
node tools/record_walkthrough.mjs --preset=loop --backend=127.0.0.1:8765
node tools/record_walkthrough.mjs --preset=fleet --backend=127.0.0.1:8765
```

Each resets that backend. `walkthrough` runs `study_loop`: the three scripted
requests at 10×, then three simulated hours of sky at 60× (about 3.6 MB). `loop`
runs `tv_loop` at 10× for about two simulated hours (about 13 minutes to record,
16 MB). `fleet` runs `fleet_showcase` at 10× until a minute after its eight
scripted encounters clear. `loop` and `fleet` keep route geometry only for
candidates the sampler visited, since only those are drawn. Nothing is written
unless every request verified with no separation loss; `loop` alone also accepts
background requests that were safely held for a controller, which the TV loop never
features. Add `--wind-only` to refresh just the wind fields of an existing
recording. The backend's own full JSONL recording of each captured run stays in
`runs/` as evidence.

| # | Scene | Visual | Source |
|---|-------|--------|--------|
| 1 | The ask | Fleet with the new flight's filed route; who must be satisfied | Recorded run |
| 2 | The conflict | Map zooms to the predicted loss of separation | Recorded run |
| 3 | The options | Deviation skeleton drawn from all 1,321 real candidates, coloured by verifier outcome | Recorded run |
| 4 | ORBIT decides | Sampler captures at three β thresholds, distinct routes in play, energy trace | Recorded run (CPU emulator) |
| 5 | The clearance | Three panels: cockpit preview, fleet map, and a bird's-eye lateral view over a side-on flight-level view, all on one preview clock; below, the manoeuvre, arrival change and datalink | Recorded run |
| 6 | Proven at scale | Minimal-intervention mix, arrival envelope, time to solution | Study (ORBIT hardware) |
| 7 | What's next | Shown today; four illustrated research directions (multi-aircraft deviations, emergency response, a full day of operations, airport collaboration); the integration pipeline; plus this run's outcomes | Roadmap + recorded run |

Every visual carries a **SIMULATION**, **STUDY** or **ROADMAP** tag, so the
demonstrator's CPU results are never confused with the study's hardware results.

**Technical** (or `T`) swaps the side panel for the detail engineers ask for:
the objective and QUBO, measured sweeps, stop reason and timings, verifier
outcome, the study setup, and a demonstrator-versus-study comparison with caveats.
The setting is remembered in the browser.

Keys: `→`/`PageDown` next, `←`/`PageUp` back, `1`–`7` jump, `Space` next (or
pause in autoplay), `T` technical, `Esc` exit. Presentation clickers that send
page keys work. Switching to **Autoplay** seeks the clock to the current scene's
cue; autoplay restarts every 160 seconds. Pause freezes the sky.

The conflict marker is a sampled display estimate (same level, inside 30 NM,
within the 3-minute buffer); the backend verifier remains authoritative. Several
candidate routes can tie for the best complexity score, so the ORBIT scene
reports how many replicas end on a safe, best-scoring route rather than on the
single route issued.

Study figures in scene 6 and on the overview are read from the PAM-I study's
figures (best solution per scenario; dashed-line timings) and are defined in
`web/src/study/StudyFigures.tsx`. They are not measured by this demonstrator.
Confirm exact statistics with the study team before quoting them elsewhere.

### TV loop

<http://127.0.0.1:5173/loop_demo> is a full-screen loop for a large screen, played
from `loop.json`, so it needs no backend. Click anywhere to go full screen; the
pointer is hidden. Layout scales with the screen, from a laptop to 4K.

The Atlantic map takes most of the screen. Playback speed varies and is always
shown: 300× between conflicts, 100× on the way in and out, and 10× from the moment
a conflict is predicted until the clearance has been read. At 10× each solve plays
for as long as it took on this machine, and the on-screen timer shows that wall-clock
time. For each featured conflict the camera moves in, a callout marks the predicted
loss of separation, the candidate routes appear as they are checked, the sampled
alternatives flicker around the new flight, and the verified route draws in green.
The right-hand panel follows the pipeline: conflict predicted, routes built and
checked, sampling (temperature, 24 parallel replicas coloured by whether they hold
the best safe route, energy), verification and the datalink clearance. Between
conflicts it lists recent clearances.

The loop features five spaced-out conflicts, preferring resolutions that combine a
lateral and a level move; the others are resolved in the background and still
counted. A title card with the ORBIT logo opens the loop and covers each restart.
The footer states that traffic and wind are synthetic and that the solver is the CPU
p-bit emulator, not ORBIT hardware. The scenario is `config/scenarios/tv_loop.yaml`;
the playback logic is in `web/src/loop/`.

### Manual fleet mode

Three crossing requests arrive together, followed by five more scripted encounters
and continuing seeded traffic. The sky continues moving during computation.

Each conflicted filing considers up to 1,321 lateral/altitude/timing alternatives
in its initial bounded library. Some encounter targets have verified traffic both
above and below, so a one-level escape is insufficient. Every issued trajectory
passes the independent separation and schedule verifier. The live activity feed
distinguishes deconflictions from nominal clearances; neither is prerecorded.

The original **Hero crossing** remains available for a simple guided explanation.
**File crossing flight** files a request immediately. Speeds are 1×, 10×, 60× and
300×. Resetting uses the same seed and restores the initial verified fleet.
At very high clock speeds, computation can consume the filing lead time; late
results are held and refiled rather than issued retroactively.

The backend is built to be left running. If the machine cannot keep up with the
selected speed, the sky runs slower than requested rather than letting the server
stop responding. Random background filings wait while three or more requests are
queued, aircraft are forgotten 30 simulated minutes after leaving the oceanic
sector, and reconnecting browsers receive the latest 100 insertion records. At 300×
each solve still takes about 10 real seconds (50 simulated minutes), so live
traffic thins out; for a busy sky at high speed, use the TV loop.

### Cockpit view

Open **Flight deck** to select a flight from **Deconflicted flights**. Each card
loads that aircraft's own verified trajectory, altitude profile and datalink
message, including older clearances while subsequent insertions are running.
Held requests never produce a cockpit clearance.

The forward windscreen shows the filed route in amber and the cleared route in
green, with waypoint gates, heading, flight level and planned ground speed. The
track-up navigation display shows the same geometry and committed traffic at
the selected preview time. The windscreen is schematic, with vertical angles
exaggerated eightfold to make cruise-level changes visible.

The default 30-second preview interpolates the backend's actual waypoint
coordinates and occupation times, runs on animation frames, and repeats until
paused (toggle **Loop on** to play once). The pilot camera banks into waypoint
turns and raises or lowers the horizon during level changes. Its ocean texture
and cloud layers are anchored to geographic position, so they flow past with the
aircraft and stop on pause. Pitch and bank are illustrative route-derived camera
cues, not measured aircraft attitude. **Pause preview**, **Replay** and the slider
control this preview independently of the live sky. **Live aircraft** becomes
available while the selected aircraft is active and uses smoothly interpolated
backend positions, headings and speeds; airborne flights open in live mode.
The walkthrough's clearance scene includes a 24-second cockpit preview;
pausing the presentation pauses that preview too.

For a presentation build served entirely by FastAPI:

```sh
make demo        # build, package, then serve at http://127.0.0.1:8765
```

Stop the development server before `make demo`, as both use backend port 8765.
All assets and fonts are local after installation. No account, API key, live
traffic feed or ORBIT device is needed. The ORBIT hardware adapter is not connected.

## Verify and inspect

```sh
make check       # Ruff, formatting, mypy, pytest, ESLint, TS, Vitest
make types       # regenerate web/src/api/types.gen.ts from Pydantic
make bench       # one measured, independently verified CPU insertion
cd backend
uv run python -m nat_demo.cli solve --scenario hero_crossing --verbose
uv run python -m nat_demo.cli synth --scenario busy --hours 3 --out ../runs/busy_synth.json
```

VS Code offers a **Demo: backend + frontend** compound launch, backend debugging,
headless solve debugging, and check/type-generation/benchmark tasks.

With the backend and frontend running, `cd web && npm run test:smoke` exercises
the original hero flow and the **Start fleet demo** button, waits for multiple
real verified deconflictions, checks the altitude filter and verifies the mobile
layout. Use `ORBIT_BASE_URL=http://127.0.0.1:8765 npm run test:smoke` for the
packaged application.

The REST contract is discoverable at <http://127.0.0.1:8765/docs>. World and solver
events use `/ws`. Configuration comes from `config/default.yaml` plus a scenario
override. Unknown configuration keys are rejected. Choose the startup scenario
with `NAT_DEMO_SCENARIO=busy make dev` or reset it from the interface.

Outbound messages are recorded under `runs/` as JSONL, with a resolved config,
SHA-256 and commit identifier when this folder has its own Git repository. Download
the current stream through `/api/recording`. Inspection of an insertion snapshot
pauses the live sky; full recording replay and CSV export remain future work.

## What is implemented

- Strict scenario configuration, SI geometry and self-contained synthetic wind.
- Spherical deviation skeleton and wind-aware edge times, fixed Mach, immediate
  start of level changes, and finite climb rates.
- A seeded, independently checked initial fleet and scripted/Poisson filings.
- A real candidate-path QUBO, normalised matrix and multireplica p-bit Gibbs CPU
  sampler, streaming actual samples, beta, energy, sweeps and measured timings.
- Independent conservative continuous-arc/altitude/occupation-time verification
  and schedule check before a clearance is issued.
- Visible expanded-skeleton and entry-delay attempts, then controller attention
  and timed refiling if no verified candidate is found.
- A fixed-tick clock, real-position separation monitor and insertion recording.

This is an initial working version, not completion of all build-spec milestones.
The current QUBO selects from a bounded library of contiguous deviations. It does
not implement the paper's full edge/slack/order-bit search. Exhausting the library
is not a proof that the full problem is infeasible. The supplied spec stops at
section 6.6; missing sections, acceptance tests and remaining work are tracked in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

Measured fleet encounters on the development machine took about 6 s for candidate
construction and verification, followed by 5 s of CPU annealing. In the first three
stacked encounters, 80–90 of 1,321 candidates passed the independent checks. These
are observations, not promised performance or hardware specifications. The
sub-second target remains open. JIT startup is measured separately.

All traffic, callsigns and weather are synthetic. This is a local research and
presentation demonstrator, not an operational ATC system or a real CPDLC service.

