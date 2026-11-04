"""The WebSocket contract; TypeScript is generated from these models."""

from typing import Literal

from pydantic import Field

from nat_demo.config import StrictModel


class PathView(StrictModel):
    points: list[list[float]]
    times_s: list[float]
    theta: list[float]
    chi: list[float]


class PositionView(StrictModel):
    lon: float
    lat: float
    altitude_m: float
    heading_deg: float
    ground_speed_ms: float


class FlightView(StrictModel):
    id: str
    callsign: str
    aircraft_type: str
    mach: float
    filed_level_fl: int
    track_id: str | None
    status: Literal["filed", "solving", "cleared", "active", "exited", "held"]
    entry_time_s: float
    scheduled_exit_s: float
    route: list[list[float]]
    position: PositionView
    trajectory: PathView | None


class TrackView(StrictModel):
    id: str
    points: list[list[float]]


class WorldView(StrictModel):
    scenario: str
    start_utc: str
    sim_time_s: float
    speed: int
    running: bool
    frozen_for_solve: bool
    flights: list[FlightView]
    tracks: list[TrackView]
    queue_size: int
    separation_losses: int
    insertions_cleared: int
    backend: str
    formulation: Literal["candidate_path"] = "candidate_path"
    seed: int


class Metrics(StrictModel):
    n_frozen: int = 0
    n_conflict_pairs: int = 0
    n_vars: int = 0
    nnz_q: int = 0
    n_candidates_verified: int = 0
    n_candidates_feasible: int = 0
    t_build_ms: float = 0
    t_solve_ms: float = 0
    t_verify_ms: float = 0
    t_first_feasible_ms: float | None = None
    c_n: float = 0
    c_n_lateral: float = 0
    c_n_vertical: float = 0
    arrival_dev_min: float = 0
    sweeps: int = 0
    stop_reason: str = ""


class ProgressView(StrictModel):
    sweep: int
    requested_sweeps: int
    beta: float
    energy: float
    elapsed_ms: float
    feasible_index: int | None
    active_candidates: list[list[int]]
    capture_beta: float | None


class SolveView(StrictModel):
    id: str
    flight_id: str
    callsign: str
    attempt: int
    reason: str
    encoding: Literal["candidate_path"] = "candidate_path"
    nominal: PathView
    candidates: list[PathView]
    candidate_feasible: list[bool]
    conflicts_with: list[str]
    metrics: Metrics
    terms: dict[str, float | int | str]


class StepView(StrictModel):
    name: str
    status: Literal["running", "done", "failed"]
    duration_ms: float = 0
    detail: str = ""


class AttemptView(StrictModel):
    number: int
    reason: str
    outcome: str
    candidates: int
    feasible: int
    duration_ms: float


class InsertionRecord(StrictModel):
    id: str
    flight_id: str
    callsign: str
    filed_at_s: float
    cleared_at_s: float
    outcome: Literal["cleared", "cleared_after_fallback", "held", "error"]
    verified: bool
    message: list[str]
    trajectory: PathView | None
    metrics: Metrics
    attempts: list[AttemptView]
    backend: str
    snapshot: WorldView | None = None


class WindGrid(StrictModel):
    time_s: float
    level_fl: int
    width: int
    height: int
    bounds: list[float]
    u_ms: list[float]
    v_ms: list[float]


class EventData(StrictModel):
    world: WorldView | None = None
    solve: SolveView | None = None
    progress: ProgressView | None = None
    record: InsertionRecord | None = None
    history: list[InsertionRecord] | None = None
    step: StepView | None = None
    message: str | None = None
    flight_ids: list[str] | None = None
    screen: str | None = None
    jit_startup_ms: float | None = None


class ServerEvent(StrictModel):
    type: Literal[
        "hello",
        "world_tick",
        "solve_started",
        "solve_progress",
        "pipeline_step",
        "clearance_issued",
        "controller_attention",
        "separation_alert",
        "error",
        "focus",
    ]
    sequence: int = Field(ge=0)
    data: EventData


class ControlRequest(StrictModel):
    action: Literal["play", "pause", "speed", "step", "reset", "file_flight"]
    speed: int | None = None
    scenario: str | None = None
    conflict: bool = True
