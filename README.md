# NATS en-route deconfliction demonstrator

The workspace contains the main North Atlantic demonstrator (`web/` and `backend/`)
and a companion Next.js presentation with a browser-based reference lab (`src/`).
The main demonstrator includes a recorded walkthrough, an unattended TV loop and a
local live simulation. One Vercel deployment serves both browser interfaces.

Traffic and weather in the demonstrator are synthetic. CPU-emulator recordings,
published study evidence and illustrative roadmap material are labelled separately.
See [the local demonstration guide](docs/LOCAL_DEMO.md) for presentation controls
and [the formatting handoff](docs/CHANGI_FORMAT_HANDOFF.md) for the companion lab's scope.

## Hosted demonstration on Vercel

Import this repository into Vercel with **Root Directory `.`** and the **Next.js** preset.
`vercel.json` installs both Node packages and builds both interfaces. Use **Node.js 22.x**;
no environment variables, Python installation, database or API key are needed for the recorded demo.

| URL | Experience |
| --- | --- |
| `/` | Redirects to the recorded demonstrator on Vercel |
| `/demonstrator` | Overview and guided walkthrough, with autoplay and technical detail |
| `/loop_demo` | Unattended recorded TV loop |
| `/presentation` | Original presentation slides |
| `/demo` | Interactive browser-based reference lab |

The hosted walkthrough and TV loop play the included synthetic CPU-emulator recordings.
They do not run the live Python simulation or submit hardware jobs. Live controls are hidden
in this build so visitors can complete the demonstration without a backend.
The reference lab calculates its own scenarios in a browser worker.

Build and check the combined production site locally:

```sh
npm ci
npm ci --prefix web
npm run build
npm start
```

Open `http://localhost:3001/demonstrator` or `http://localhost:3001/loop_demo`.
The Vercel-only homepage redirect does not change the local presentation homepage.
Generated `public/nats/` files are built on deployment and excluded from Git.

### Optional hosted live simulator

The Python simulator maintains an in-memory world, a continuous simulation task and
WebSocket clients. Run it as one persistent Python 3.12 service, separately from this
Next.js deployment. From the repository root:

```sh
cd backend
uv sync --python 3.12
NAT_ALLOWED_ORIGINS=https://YOUR-SITE.vercel.app uv run uvicorn nat_demo.api.app:create_app --factory --host 0.0.0.0 --port 8765
```

Give that service an HTTPS endpoint with WebSocket support, then set the Vercel **build**
environment variable `VITE_NAT_BACKEND_URL=https://YOUR-BACKEND` and redeploy.
`NAT_ALLOWED_ORIGINS` is a comma-separated list of exact allowed frontend origins;
wildcards are rejected. This is an origin allowlist, not authentication. The simulator
shares one world between viewers; use a private service or add access control before
using live controls with an untrusted audience. No separate backend is provisioned by this repository.

### Local live application

```sh
make setup  # once: Python backend and Vite frontend dependencies
make dev    # frontend :5173 and backend :8765; Ctrl+C stops both
```

Open `http://localhost:5173/#explore` and choose **Start fleet demo**.
The complete guide is [docs/LOCAL_DEMO.md](docs/LOCAL_DEMO.md).

## Run locally

Requires Node.js 22.18+ (Node 24+ recommended for the TypeScript test runner).

```sh
npm ci
npm run dev
```

- Presentation: http://localhost:3001
- Full-screen lab: http://localhost:3001/demo
- Direct presentation slide: http://localhost:3001/#slide-10
- Production: `npm run build`, then `npm start`
- Verification: `npm test` and `npx tsc --noEmit`

No Python service, API key, database, or external solver is required. Scenario processing and reference search run locally in a Web Worker. Uploaded scenarios are read in the browser. The two reference PDF links are served from the existing `docs/` directory through an allowlisted route.

## Research context

The content follows the supplied documents:

- `docs/SESAR_Short_paper-3 1.pdf`: _Probabilistic Computing for Real-Time, Operationally Cohesive En-route Deconfliction_, Boris Baros, Max Al-Hasso and Ben Carvell. Methodology and objective: §II; research experiment settings: §III; future extensions: §IV.
- `docs/Operationally_Cohesive_QUBO_Formulations_for_Real_Time_Air_Traffic_Deconfliction_Using_Probabilistic_Computing-3.pdf`: formulation notes by Boris Baros, dated 13 October 2026. Action space and timing: §2; optimisation and encoding details thereafter.

The demonstrator reflects sequential insertion: keep mutually deconflicted active flights fixed, preserve the incoming flight’s nominal entry/exit, minimise squared changes in lateral/vertical deviation indices, and constrain arrival deviation. Paper defaults used here are lateral/vertical weights 2/1, ±10-minute arrival allowance, 30 NM horizontal separation, and a 3-minute time buffer. These are research-model parameters, not a general statement of applicable operational separation rules.

## What the local solver does

`src/lib/deconfliction.ts` searches all available paths in a small finite corridor, using non-negative objective bounds to prune paths that cannot improve on the incumbent. Up to seven incoming waypoints, three lateral options and three vertical options are supported. Entry and exit remain nominal. Legal levels are FL310/330/350/370/390/410; vertical alternatives are ±20 FL (±2,000 ft).

Each edge is split into eight subintervals. Travel time uses a synthetic wind field and a nominal 450 kt speed. Spatial proximity is checked between complete subsegments rather than only at waypoints. Conservative altitude envelopes enforce 1,000 ft vertical separation in this local model. Buffered segment-occupancy intervals determine temporal conflicts. Active flights are checked for mutual conflicts before insertion. Selected routes are checked again through the direct route evaluator. Reported timings are actual browser measurements; no result, hardware speedup or progress duration is fabricated.

Four built-in scenarios cover simple vertical resolution, a layered crossing requiring more complex intervention, an infeasible fixed exit, and an already clear route. Changing any setting invalidates the prior result. Search runs independently of the presentation slide, so the results slide can display the completed run. Reloading the application starts a new in-memory session.

### Deliberate model limits

This is a local research demonstrator, not an operational ATC system or a reproduction of the paper’s experiment. Geometry is a local plane, winds and traffic are synthetic, and aircraft dynamics are simplified. It does not use ERA5, BADA, certified separation logic, the full QUBO slack-variable encoding, or an ORBIT hardware connection. The results slide separates measured local results from the paper’s reported experiment setup. Connecting the full QUBO/ORBIT pipeline remains future integration work.

## Scenario import and export

Use **Download scenario** to get a complete, valid example, edit it, then **Upload JSON**. Up to 30 fixed flights, 2–10 points per fixed flight, and 2–7 incoming points are accepted. Coordinates use nautical miles in the local plane. Each flight’s x coordinates must increase strictly. The file must be under 250 KB. This example shows the shape:

```json
{
  "id": "example",
  "name": "Example corridor",
  "description": "One incoming flight and no fixed traffic.",
  "incoming": {
    "id": "DEMO-101",
    "callsign": "DEMO-101",
    "entryMinute": 0,
    "points": [
      { "x": 0, "y": 0, "fl": 350 },
      { "x": 600, "y": 0, "fl": 350 },
      { "x": 1200, "y": 0, "fl": 350 }
    ]
  },
  "traffic": []
}
```

**Export result** includes the original scenario, settings, nominal route, selected route, conflict checks, timing, solver identity and export timestamp.

## Project structure

- `src/app/page.tsx`: 14-slide presentation and keyboard navigation.
- `src/components/slides/`: retained generic slides and paper-based NATS narrative.
- `src/components/DeconflictionDemo.tsx`: controls, playback, instructions, import/export and provenance.
- `src/components/AirspaceView.tsx`: schematic horizontal view and vertical profile.
- `src/lib/deconfliction.ts`: geometry, timing, validation and bounded reference search.
- `src/lib/deconfliction.worker.ts`: background execution.
- `src/lib/demoStore.ts`: shared in-memory run state.
- `tests/deconfliction.test.mjs`: solver, constraint, import and geometry checks.

Arrow keys and Space navigate slides when focus is outside interactive controls; Home/End jump to the first/last slide. Direct links use `#slide-N`.
