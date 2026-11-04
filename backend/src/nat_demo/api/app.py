import asyncio
import contextlib
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from nat_demo.api.messages import ControlRequest, EventData, InsertionRecord, Metrics, ServerEvent
from nat_demo.config import SCENARIOS, load_config
from nat_demo.core.trajectory import position
from nat_demo.core.verify import monitor_positions
from nat_demo.geo.sphere import lonlat_to_xyz
from nat_demo.sim.insertion import insert
from nat_demo.sim.recorder import Recorder
from nat_demo.sim.world import World
from nat_demo.solvers.pbit_emulator import warmup
from nat_demo.units import FT_M, NM_M

# A long-running demo must stay responsive at any speed. When ticks cost more
# real time than they represent, the sky runs slower than requested instead of
# building a backlog that starves the server.
MAX_CATCH_UP_S = 0.25
# Random background filings wait while this many requests are queued; at high
# speeds they otherwise outpace the solver, miss their entry times and refile forever.
MAX_BACKGROUND_QUEUE = 3
# Aircraft are forgotten this long after leaving the oceanic sector.
FORGET_EXITED_S = 30 * 60
# Reconnecting viewers receive this many recent records, each with its snapshot.
HISTORY_LIMIT = 100


class Simulation:
    def __init__(self, scenario: str):
        self.world = World(load_config(scenario), scenario)
        self.history: list[InsertionRecord] = []
        self.clients: set[asyncio.Queue] = set()
        self.sequence = 0
        self.last_solve = None
        self.last_progress = None
        self.last_step = None
        self.solve_task: asyncio.Task | None = None
        self.recorder = Recorder(self.world.config, scenario)
        self.alerted: set[tuple[str, str]] = set()
        self.jit_ms = 0.0

    def emit(self, kind: str, data: dict):
        self.sequence += 1
        event = ServerEvent.model_validate(
            {"type": kind, "sequence": self.sequence, "data": data}
        ).model_dump(mode="json")
        if kind == "solve_started":
            self.last_solve = data["solve"]
            self.last_progress = None
        elif kind == "solve_progress":
            self.last_progress = data["progress"]
        elif kind == "pipeline_step":
            self.last_step = data["step"]
        self.recorder.write(event)
        for queue in list(self.clients):
            if queue.full():
                # A slow viewer reconnects to a full snapshot. Never silently
                # replace a clearance with another event.
                self.clients.remove(queue)
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait(None)
            else:
                queue.put_nowait(event)

    def tick(self):
        w, cfg = self.world, self.world.config
        w.time_s += cfg.time.tick_s
        for f in list(w.flights.values()):
            if f.status == "held" and f.refile_at is not None and f.refile_at <= w.time_s:
                f.status = "filed"
                f.filed_at = w.time_s
                f.entry = w.time_s + cfg.traffic.filing_lead_time_min[0] * 60
                f.nominal = w.trajectory(f.route, f.level, f.entry, f.mach)
                f.scheduled_exit = float(f.nominal.time_s[-1])
                f.refile_at = None
                w.queue.append(f.id)
            if f.cleared is not None:
                if w.time_s >= f.cleared.time_s[-1]:
                    f.status = "exited"
                elif w.time_s >= f.cleared.time_s[0]:
                    f.status = "active"
        if cfg.director.enabled:
            for i, beat in enumerate(cfg.director.scripted_beats):
                if i not in w.beats_fired and w.time_s >= beat.at_min * 60:
                    w.beats_fired.add(i)
                    if beat.action == "file_flight":
                        w.file_flight(True, beat.params)
                    elif beat.action == "pause":
                        w.running = False
                    elif beat.action == "set_speed":
                        if beat.params.get("speed") in cfg.time.speed_options:
                            w.speed = beat.params["speed"]
                    elif beat.action == "wind_shift":
                        for key in ("drift_deg_per_hour", "jet_core_kt"):
                            if key in beat.params:
                                updated = cfg.wind.model_copy(update={key: beat.params[key]})
                                cfg.wind = type(cfg.wind).model_validate(updated.model_dump())
                    elif beat.action == "highlight":
                        self.emit(
                            "focus",
                            {
                                "flight_ids": [beat.params.get("flight_id", "")],
                                "screen": beat.params.get("screen", "control_room"),
                            },
                        )
        if w.time_s >= w.next_filing:
            kind = (
                cfg.director.enabled
                and w.director_rng.random() < cfg.director.conflict_injection_probability
            )
            if len(w.queue) < MAX_BACKGROUND_QUEUE:
                w.file_flight(kind)
            w.next_filing += float(w.traffic_rng.exponential(3600 / cfg.traffic.filings_per_hour))
        if self.solve_task is None:
            # The insertion thread reads the fleet, so only forget aircraft while it is idle.
            for flight_id in [
                f.id
                for f in w.flights.values()
                if f.status == "exited"
                and f.cleared is not None
                and w.time_s - f.cleared.time_s[-1] > FORGET_EXITED_S
            ]:
                del w.flights[flight_id]
        # Only current positions are needed here, not the full view with every trajectory.
        active = [
            (f.id, f.cleared)
            for f in w.flights.values()
            if f.status == "active" and f.cleared is not None
        ]
        if active:
            positions = [position(path, w.time_s) for _, path in active]
            xyz = lonlat_to_xyz(np.array([[p["lon"], p["lat"]] for p in positions]))
            alt = np.array([p["altitude_m"] for p in positions])
            for a, b in monitor_positions(
                xyz, alt, cfg.separation.lateral_nm * NM_M, cfg.separation.vertical_ft * FT_M
            ):
                pair = (min(active[a][0], active[b][0]), max(active[a][0], active[b][0]))
                if pair not in self.alerted:
                    self.alerted.add(pair)
                    w.losses += 1
                    self.emit(
                        "separation_alert",
                        {"message": "Loss of separation detected", "flight_ids": list(pair)},
                    )

    def remember(self, record: InsertionRecord):
        self.history.append(record)
        del self.history[:-HISTORY_LIMIT]

    def start_worker(self):
        if self.solve_task is None and self.world.queue:
            flight = self.world.flights[self.world.queue.pop(0)]
            flight.status = "solving"
            self.world.frozen = self.world.config.time.freeze_sky_during_solve
            self.solve_task = asyncio.create_task(self._insert(flight))

    async def _insert(self, flight):
        loop = asyncio.get_running_loop()

        # The worker owns only a frozen input view. Completion mutates world
        # state on the event loop; reset is disallowed while this task is active.
        def progress(kind, data):
            loop.call_soon_threadsafe(self.emit, kind, data)

        try:
            record, trajectory = await asyncio.to_thread(insert, self.world, flight, progress)
            if trajectory is not None and trajectory.time_s[0] <= self.world.time_s:
                # At high rates with an unfrozen sky, computation can consume
                # the entire filing lead time. A safe historical trajectory is
                # not a usable clearance; hold and refile instead.
                trajectory = None
                record.verified = False
                record.outcome = "held"
                record.trajectory = None
                record.message = [
                    "NO CLEARANCE ISSUED",
                    "ENTRY DEADLINE MISSED · REFILING IN 15 MIN",
                ]
                record.metrics.stop_reason = "entry_deadline_missed"
                if record.attempts:
                    record.attempts[-1].outcome = "entry_deadline_missed"
            if trajectory is not None:
                flight.cleared = trajectory
                flight.entry = float(trajectory.time_s[0])
                flight.status = "active" if trajectory.time_s[0] <= self.world.time_s else "cleared"
                self.world.cleared_count += 1
            else:
                flight.status = "held"
                flight.refile_at = self.world.time_s + 15 * 60
            self.world.frozen = False
            record.snapshot = self.world.view()
            self.remember(record)
            self.emit(
                "clearance_issued" if record.verified else "controller_attention",
                {
                    "record": record.model_dump(mode="json"),
                    "world": self.world.view().model_dump(mode="json"),
                },
            )
        except Exception as error:
            flight.status, flight.refile_at = "held", self.world.time_s + 15 * 60
            self.world.frozen = False
            record = InsertionRecord(
                id=f"{flight.id}-error-{self.sequence}",
                flight_id=flight.id,
                callsign=flight.callsign,
                filed_at_s=flight.filed_at,
                cleared_at_s=self.world.time_s,
                outcome="error",
                verified=False,
                message=["NO CLEARANCE ISSUED", str(error)],
                trajectory=None,
                metrics=Metrics(),
                attempts=[],
                backend=self.world.config.solver.backend,
                snapshot=self.world.view(),
            )
            self.remember(record)
            self.emit(
                "controller_attention",
                {
                    "record": record.model_dump(mode="json"),
                    "message": str(error),
                    "world": self.world.view().model_dump(mode="json"),
                },
            )
        finally:
            self.solve_task = None
            self.world.frozen = False

    async def run(self):
        last, accumulator, last_emit = time.perf_counter(), 0.0, 0.0
        while True:
            await asyncio.sleep(0.05)
            now = time.perf_counter()
            elapsed, last = now - last, now
            if self.world.running and not self.world.frozen:
                accumulator += elapsed * self.world.speed
                accumulator = min(
                    accumulator,
                    max(self.world.config.time.tick_s, MAX_CATCH_UP_S * self.world.speed),
                )
                while (
                    accumulator >= self.world.config.time.tick_s
                    and self.world.running
                    and not self.world.frozen
                ):
                    accumulator -= self.world.config.time.tick_s
                    self.tick()
                    self.start_worker()
            else:
                accumulator = 0
            self.start_worker()
            if now - last_emit >= 1 / self.world.config.time.ui_tick_hz:
                last_emit = now
                self.emit("world_tick", {"world": self.world.view().model_dump(mode="json")})


def create_app() -> FastAPI:
    state: dict[str, Simulation] = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        started = time.perf_counter()
        await asyncio.to_thread(warmup)
        jit_ms = (time.perf_counter() - started) * 1000
        sim = await asyncio.to_thread(Simulation, os.getenv("NAT_DEMO_SCENARIO", "fleet_showcase"))
        sim.jit_ms = jit_ms
        state["sim"] = sim
        task = asyncio.create_task(sim.run())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        if sim.solve_task:
            await sim.solve_task
        sim.recorder.close()

    app = FastAPI(title="ORBIT NAT demonstrator", lifespan=lifespan)
    allowed_origins = {
        value.strip().rstrip("/")
        for value in os.getenv("NAT_ALLOWED_ORIGINS", "").split(",")
        if value.strip()
    }
    if "*" in allowed_origins:
        raise ValueError("NAT_ALLOWED_ORIGINS must list explicit browser origins")
    if allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=sorted(allowed_origins),
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
        )

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "synthetic": True,
            "backend": state["sim"].world.config.solver.backend,
            "encoding": "candidate_path",
            "jit_startup_ms": state["sim"].jit_ms,
        }

    @app.get("/api/state")
    async def get_state():
        return state["sim"].world.view()

    @app.get("/api/scenarios")
    async def scenarios():
        return {"scenarios": SCENARIOS}

    @app.get("/api/wind/grid")
    async def wind_grid(t: float | None = None):
        sim = state["sim"]
        if t is not None and (not np.isfinite(t) or abs(t) > 1e10):
            raise HTTPException(422, "Invalid wind time")
        return sim.world.wind.grid(sim.world.time_s if t is None else t)

    @app.get("/api/recording")
    async def recording():
        path = state["sim"].recorder.path
        return FileResponse(path, filename=path.name, media_type="application/x-ndjson")

    @app.post("/api/control")
    async def control(request: ControlRequest):
        sim = state["sim"]
        w = sim.world
        if request.action == "play":
            w.running = True
        elif request.action == "pause":
            w.running = False
        elif request.action == "speed":
            if request.speed not in w.config.time.speed_options:
                raise HTTPException(422, "Unsupported simulation speed")
            w.speed = request.speed
        elif request.action == "step":
            if sim.solve_task or w.running:
                raise HTTPException(
                    409, "Pause the simulation and wait for the current insertion before stepping"
                )
            sim.tick()
        elif request.action == "file_flight":
            if len(w.queue) >= 10:
                raise HTTPException(409, "Insertion queue is full")
            params = (
                {
                    "callsign": f"{w.config.traffic.callsign_prefixes[0]}417",
                    "conflict_with": f"{w.config.traffic.callsign_prefixes[0]}208",
                    "kind": "spatiotemporal",
                }
                if f"{w.config.traffic.callsign_prefixes[0]}417" not in w.flights
                and request.conflict
                else {}
            )
            w.file_flight(request.conflict, params)
        elif request.action == "reset":
            if sim.solve_task:
                raise HTTPException(409, "Wait for the current insertion before resetting")
            scenario = request.scenario or w.scenario
            if scenario not in SCENARIOS:
                raise HTTPException(422, "Unknown scenario")
            # Construct before mutation so an invalid scenario leaves the
            # existing world and recording intact.
            # Keep the idle check and world replacement atomic. A baseline
            # world builds in tens of milliseconds on this machine.
            replacement = World(load_config(scenario), scenario)
            sim.recorder.close()
            sim.world = replacement
            sim.recorder = Recorder(replacement.config, scenario)
            sim.history.clear()
            sim.last_solve, sim.last_progress, sim.last_step = None, None, None
            sim.alerted.clear()
            sim.emit(
                "hello",
                {
                    "world": replacement.view().model_dump(mode="json"),
                    "history": [],
                    "jit_startup_ms": sim.jit_ms,
                },
            )
        sim.start_worker()
        sim.emit("world_tick", {"world": sim.world.view().model_dump(mode="json")})
        return {"ok": True}

    @app.websocket("/ws")
    async def websocket(ws: WebSocket):
        # Remote viewers must be explicitly allowed by the backend operator.
        origin = ws.headers.get("origin")
        if origin:
            from urllib.parse import urlparse

            if (
                urlparse(origin).hostname not in ("localhost", "127.0.0.1", "::1")
                and origin not in allowed_origins
            ):
                await ws.close(code=1008)
                return
        await ws.accept()
        sim = state["sim"]
        queue: asyncio.Queue = asyncio.Queue(maxsize=120)
        sim.clients.add(queue)
        hello = ServerEvent(
            type="hello",
            sequence=sim.sequence,
            data=EventData(
                world=sim.world.view(),
                history=sim.history,
                solve=sim.last_solve,
                progress=sim.last_progress,
                step=sim.last_step,
                jit_startup_ms=sim.jit_ms,
            ),
        )
        try:
            await ws.send_json(hello.model_dump(mode="json"))
            while True:
                event = await queue.get()
                if event is None:
                    await ws.close(code=1013)
                    return
                await ws.send_json(event)
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            sim.clients.discard(queue)

    static = Path(__file__).resolve().parents[1] / "static"
    if static.is_dir():
        app.mount("/", StaticFiles(directory=static, html=True), name="web")
    return app
