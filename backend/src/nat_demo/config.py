"""Strict, scenario-overridable configuration. Units here are aviation units."""

import os
import re
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

ROOT = Path(__file__).resolve().parents[3]
SCENARIOS = (
    "study_loop",
    "fleet_showcase",
    "tv_loop",
    "hero_crossing",
    "calm",
    "busy",
    "paper_worst_case",
    "tight_skeleton",
    "stress",
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class TimeConfig(StrictModel):
    start_utc: datetime
    tick_s: float = Field(gt=0, le=60)
    speed_options: list[int]
    default_speed: int
    freeze_sky_during_solve: bool
    ui_tick_hz: float = Field(gt=0, le=30)


class AirspaceConfig(StrictModel):
    lon_range_deg: tuple[float, float]
    lat_range_deg: tuple[float, float]
    oceanic_entry_lon_deg: float
    oceanic_exit_lon_deg: float
    fir_boundary_lon_deg: float
    legal_levels_eastbound: list[int]


class SeparationConfig(StrictModel):
    lateral_nm: float = Field(gt=0)
    time_buffer_min: float = Field(ge=0)
    vertical_ft: float = Field(gt=0)


class SkeletonConfig(StrictModel):
    K: int = Field(ge=0, le=3)
    J: int = Field(ge=0, le=3)
    lateral_spacing_nm: float = Field(gt=0)
    waypoints_per_flight: int = Field(ge=3, le=30)
    subintervals_per_edge: int = Field(ge=1, le=20)
    edge_cost_substeps: int = Field(ge=1, le=100)
    climb_rate_fpm: float = Field(gt=0)


class ScheduleConfig(StrictModel):
    envelope_min: float = Field(gt=0)


class ObjectiveConfig(StrictModel):
    w_theta: float = Field(gt=0)
    w_chi: float = Field(gt=0)
    p: int = Field(ge=1, le=4)


class QuboConfig(StrictModel):
    time_quantum_s: float = Field(gt=0)
    prune_unreachable: bool
    lambda_auto: bool
    lambda_margin: float = Field(gt=1)
    lambda_override: dict[str, float]
    normalise: Literal["max_abs"]


class OrbitConfig(StrictModel):
    endpoint_env: str
    api_key_env: str


class SolverConfig(StrictModel):
    backend: Literal["pbit_emulator", "orbit", "brute_force"]
    sweeps: int = Field(gt=0, le=1_000_000)
    beta_start: float = Field(gt=0)
    beta_end: float = Field(gt=0)
    beta_schedule: Literal["linear"]
    replicas: int = Field(ge=1, le=40)
    progress_every_sweeps: int = Field(gt=0)
    snapshot_every_sweeps: int = Field(gt=0)
    snapshot_betas: list[float]
    time_budget_s: float = Field(gt=0, le=60)
    orbit: OrbitConfig

    @model_validator(mode="after")
    def beta_order(self) -> "SolverConfig":
        if self.beta_end <= self.beta_start:
            raise ValueError("beta_end must exceed beta_start")
        return self


class ExpandedConfig(StrictModel):
    K: int = Field(ge=0, le=3)
    J: int = Field(ge=0, le=3)


class FallbackConfig(StrictModel):
    expanded_skeleton: ExpandedConfig
    entry_delay_step_min: int = Field(gt=0)
    entry_delay_max_min: int = Field(ge=0)


class TrafficConfig(StrictModel):
    initial_active_flights: int = Field(ge=0, le=100)
    initial_planned_flights: int = Field(default=1, ge=0, le=20)
    initial_stacked_targets: int = Field(default=0, ge=0, le=20)
    initial_random_route_fraction: float = Field(default=0, ge=0, le=1)
    filings_per_hour: float = Field(ge=0, le=120)
    filing_lead_time_min: tuple[float, float]
    track_count: int = Field(ge=1, le=12)
    track_spacing_deg_lat: float = Field(gt=0)
    random_route_fraction: float = Field(ge=0, le=1)
    level_weights: dict[int, float]
    mach_range: tuple[float, float]
    callsign_prefixes: list[str]
    aircraft_types: list[str]


class FilingParams(StrictModel):
    callsign: str | None = Field(default=None, pattern=r"^X[A-Z]{2}[0-9]{1,4}$")
    route: str | None = Field(default=None, pattern=r"^(random|track:[A-L])$")
    level: int | None = Field(default=None, gt=0)
    mach: float | None = Field(default=None, gt=0, lt=1.5)
    conflict_with: str | None = Field(default=None, pattern=r"^X[A-Z]{2}[0-9]{1,4}$")
    kind: Literal["spatial_only", "spatiotemporal"] | None = None
    offset_min: float = 0
    final_edge: bool = False

    @model_validator(mode="after")
    def exclusive_geometry(self) -> "FilingParams":
        if self.final_edge and self.route is not None:
            raise ValueError("final_edge and route specify different geometries; choose one")
        return self


class SpeedParams(StrictModel):
    speed: int = Field(gt=0)


class WindShiftParams(StrictModel):
    drift_deg_per_hour: float | None = None
    jet_core_kt: float | None = Field(default=None, ge=0, le=300)


class HighlightParams(StrictModel):
    flight_id: str = Field(pattern=r"^X[A-Z]{2}[0-9]{1,4}$")
    screen: Literal["control_room", "inside_orbit", "flight_deck"] = "control_room"


class Beat(StrictModel):
    at_min: float = Field(ge=0)
    action: Literal["file_flight", "set_speed", "pause", "wind_shift", "highlight"]
    params: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def action_parameters(self) -> "Beat":
        if any(value is None for value in self.params.values()):
            raise ValueError("beat parameters cannot be null")
        parameter_models: dict[str, type[StrictModel]] = {
            "file_flight": FilingParams,
            "set_speed": SpeedParams,
            "pause": StrictModel,
            "wind_shift": WindShiftParams,
            "highlight": HighlightParams,
        }
        self.params = (
            parameter_models[self.action].model_validate(self.params).model_dump(exclude_unset=True)
        )
        if self.action == "wind_shift" and not self.params:
            raise ValueError("wind_shift requires at least one wind parameter")
        return self


class DirectorConfig(StrictModel):
    enabled: bool
    conflict_injection_probability: float = Field(ge=0, le=1)
    conflict_kind_weights: dict[Literal["spatial_only", "spatiotemporal"], float]
    scripted_beats: list[Beat]


class WindConfig(StrictModel):
    source: Literal["synthetic", "era5"]
    era5_path: str | None
    jet_core_kt: float = Field(ge=0, le=300)
    jet_width_deg: float = Field(gt=0)
    jet_lat_deg: float
    meander_amp_deg: float = Field(ge=0)
    meander_wavenumber: float = Field(gt=0)
    drift_deg_per_hour: float
    level_peak_fl: float
    level_width_fl: float = Field(gt=0)
    background_westerly_kt: float = Field(ge=0)
    forecast_error_kt: float = Field(ge=0)


class UIConfig(StrictModel):
    show_synthetic_badge: bool
    ghost_max_paths: int = Field(ge=1, le=100)
    default_screen: Literal["control_room", "inside_orbit", "flight_deck"]


class DemoConfig(StrictModel):
    seed: int = Field(ge=0)
    time: TimeConfig
    airspace: AirspaceConfig
    separation: SeparationConfig
    skeleton: SkeletonConfig
    schedule: ScheduleConfig
    objective: ObjectiveConfig
    qubo: QuboConfig
    solver: SolverConfig
    fallback: FallbackConfig
    traffic: TrafficConfig
    director: DirectorConfig
    wind: WindConfig
    ui: UIConfig

    @model_validator(mode="after")
    def consistency(self) -> "DemoConfig":
        levels = self.airspace.legal_levels_eastbound
        if not levels or levels != sorted(set(levels)) or any(x <= 0 or x % 10 for x in levels):
            raise ValueError("legal levels must be sorted, unique multiples of 10")
        if set(self.traffic.level_weights) != set(levels):
            raise ValueError("level_weights must cover exactly the legal levels")
        if (
            any(x < 0 for x in self.traffic.level_weights.values())
            or sum(self.traffic.level_weights.values()) <= 0
        ):
            raise ValueError("level weights must be nonnegative with positive total")
        if not self.traffic.callsign_prefixes or any(
            re.fullmatch(r"X[A-Z]{2}", x) is None for x in self.traffic.callsign_prefixes
        ):
            raise ValueError("use three-letter fictitious callsign prefixes starting with X")
        if self.time.start_utc.tzinfo is None:
            raise ValueError("start_utc must include a UTC offset")
        if self.time.default_speed not in self.time.speed_options or any(
            x <= 0 for x in self.time.speed_options
        ):
            raise ValueError("invalid clock speed")
        for bounds in (
            self.airspace.lon_range_deg,
            self.airspace.lat_range_deg,
            self.traffic.mach_range,
            self.traffic.filing_lead_time_min,
        ):
            if bounds[0] >= bounds[1]:
                raise ValueError("ranges must be strictly increasing")
        if not -180 <= self.airspace.lon_range_deg[0] < self.airspace.lon_range_deg[1] <= 180:
            raise ValueError("longitude range must lie within [-180, 180]")
        if not -90 < self.airspace.lat_range_deg[0] < self.airspace.lat_range_deg[1] < 90:
            raise ValueError("latitude range must lie within (-90, 90)")
        if self.traffic.mach_range[0] <= 0 or self.traffic.mach_range[1] >= 1.5:
            raise ValueError("Mach range must lie within (0, 1.5)")
        if self.traffic.filing_lead_time_min[0] < 0:
            raise ValueError("filing lead time must be nonnegative")
        if not self.traffic.aircraft_types:
            raise ValueError("at least one aircraft type is required")
        kind_weights = self.director.conflict_kind_weights.values()
        if any(value < 0 for value in kind_weights) or sum(kind_weights) <= 0:
            raise ValueError("conflict kind weights must be nonnegative with positive total")
        for beat in self.director.scripted_beats:
            if beat.action == "file_flight":
                self.validate_filing_params(beat.params)
            elif beat.action == "set_speed" and beat.params["speed"] not in self.time.speed_options:
                raise ValueError("scripted speed must be one of time.speed_options")
            elif (
                beat.action == "highlight"
                and beat.params["flight_id"][:3] not in self.traffic.callsign_prefixes
            ):
                raise ValueError("highlight flight_id must use a configured fictitious prefix")
        if self.wind.source != "synthetic":
            raise ValueError(
                "ERA5 is not implemented in this baseline; synthetic wind must be explicit"
            )
        if self.wind.forecast_error_kt != 0:
            raise ValueError("forecast-error divergence is not implemented in this baseline")
        if not self.ui.show_synthetic_badge:
            raise ValueError("the synthetic-data badge is mandatory")
        return self

    def validate_filing_params(self, params: dict[str, Any]) -> dict[str, Any]:
        """Validate both scripted and direct filings against this world's configuration."""
        if any(value is None for value in params.values()):
            raise ValueError("filing parameters cannot be null")
        checked = FilingParams.model_validate(params).model_dump(exclude_unset=True)
        for key in ("callsign", "conflict_with"):
            if key in checked and checked[key][:3] not in self.traffic.callsign_prefixes:
                raise ValueError(f"{key} must use a configured fictitious prefix")
        if "level" in checked and checked["level"] not in self.airspace.legal_levels_eastbound:
            raise ValueError("scripted level must be a legal eastbound level")
        if checked.get("route", "").startswith("track:"):
            track_index = ord(checked["route"][-1]) - ord("A")
            if track_index >= self.traffic.track_count:
                raise ValueError("scripted route refers to an unconfigured track")
        return checked


def merge(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def load_config(scenario: str | None = None) -> DemoConfig:
    scenario = scenario or os.environ.get("NAT_DEMO_SCENARIO", "hero_crossing")
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario}")
    base = yaml.safe_load((ROOT / "config/default.yaml").read_text())
    override = yaml.safe_load((ROOT / f"config/scenarios/{scenario}.yaml").read_text()) or {}
    return DemoConfig.model_validate(merge(base, override))
