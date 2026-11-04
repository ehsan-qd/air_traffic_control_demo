from dataclasses import dataclass
from typing import Any, Literal

import numpy as np

from nat_demo.api.messages import FlightView, PathView, PositionView, TrackView, WorldView
from nat_demo.config import DemoConfig
from nat_demo.core.trajectory import Trajectory, make_trajectory, position
from nat_demo.core.verify import verify
from nat_demo.geo.sphere import lonlat_to_xyz, resample
from nat_demo.synth.wind import SyntheticWind
from nat_demo.units import FT_M, NM_M


@dataclass
class Flight:
    id: str
    callsign: str
    aircraft_type: str
    mach: float
    level: int
    route: np.ndarray
    track_id: str | None
    filed_at: float
    entry: float
    scheduled_exit: float
    nominal: Trajectory
    status: Literal["filed", "solving", "cleared", "active", "exited", "held"] = "filed"
    cleared: Trajectory | None = None
    refile_at: float | None = None


class World:
    def __init__(self, config: DemoConfig, scenario: str):
        self.config, self.scenario = config, scenario
        streams = np.random.SeedSequence(config.seed).spawn(5)
        self.wind = SyntheticWind(config, np.random.default_rng(streams[0]))
        self.track_rng = np.random.default_rng(streams[1])
        self.traffic_rng = np.random.default_rng(streams[2])
        self.director_rng = np.random.default_rng(streams[3])
        self.solver_rng = np.random.default_rng(streams[4])
        self.time_s = 0.0
        self.speed = config.time.default_speed
        self.running = False
        self.frozen = False
        self.losses = 0
        self.cleared_count = 0
        self.flights: dict[str, Flight] = {}
        self.queue: list[str] = []
        self.tracks = self._tracks()
        self._initial_fleet()
        self.next_filing = (
            float(self.traffic_rng.exponential(3600 / config.traffic.filings_per_hour))
            if config.traffic.filings_per_hour
            else float("inf")
        )
        self.beats_fired: set[int] = set()

    def _tracks(self) -> list[TrackView]:
        cfg = self.config
        anchors = np.array([-52, -45, -37, -29, -20, -12], dtype=float)
        centre = self.wind.centre(anchors)
        result = []
        for i in range(cfg.traffic.track_count):
            lat = (
                centre + (i - (cfg.traffic.track_count - 1) / 2) * cfg.traffic.track_spacing_deg_lat
            )
            lat[1:-1] = (lat[:-2] + lat[1:-1] + lat[2:]) / 3
            lat = np.round(lat * 2) / 2
            result.append(
                TrackView(id=chr(65 + i), points=np.column_stack((anchors, lat)).tolist())
            )
        return result

    def trajectory(self, route, level, entry, mach):
        cfg = self.config.skeleton
        return make_trajectory(
            lonlat_to_xyz(route),
            np.full(len(route), level, dtype=float),
            entry,
            mach,
            self.wind.wind_uv,
            cfg.edge_cost_substeps,
            cfg.subintervals_per_edge,
            cfg.climb_rate_fpm,
        )

    def check(self, trajectory, scheduled_exit, exclude=None):
        cfg = self.config
        frozen = [
            (f.id, f.cleared)
            for f in self.flights.values()
            if f.id != exclude and f.cleared is not None and f.status in ("active", "cleared")
        ]
        return verify(
            trajectory,
            frozen,
            scheduled_exit,
            cfg.schedule.envelope_min * 60,
            cfg.separation.lateral_nm * NM_M,
            cfg.separation.vertical_ft * FT_M,
            cfg.separation.time_buffer_min * 60,
        )

    def _flight(self, callsign, route, level, entry, mach, track=None):
        nominal = self.trajectory(route, level, entry, mach)
        flight = Flight(
            callsign,
            callsign,
            str(self.traffic_rng.choice(self.config.traffic.aircraft_types)),
            mach,
            level,
            route,
            track,
            self.time_s,
            entry,
            float(nominal.time_s[-1]),
            nominal,
        )
        return flight

    def _initial_fleet(self):
        cfg = self.config
        target_track = self.tracks[min(2, len(self.tracks) - 1)]
        if cfg.traffic.initial_active_flights and cfg.traffic.initial_planned_flights:
            route = resample(np.asarray(target_track.points), cfg.skeleton.waypoints_per_flight)
            level = (
                370
                if 370 in cfg.airspace.legal_levels_eastbound
                else cfg.airspace.legal_levels_eastbound[
                    len(cfg.airspace.legal_levels_eastbound) // 2
                ]
            )
            hero = self._flight(
                f"{cfg.traffic.callsign_prefixes[0]}208",
                route,
                level,
                45 * 60,
                float(np.clip(0.82, *cfg.traffic.mach_range)),
                target_track.id,
            )
            hero.status, hero.cleared = "cleared", hero.nominal
            self.flights[hero.id] = hero
        # Reserve verified future traffic on several corridors. These create
        # distinct encounter opportunities without placing conflicts in the sky.
        for j in range(
            1, min(cfg.traffic.initial_planned_flights, cfg.traffic.initial_active_flights)
        ):
            track = self.tracks[(2 + j * 3) % len(self.tracks)]
            route = resample(np.asarray(track.points), cfg.skeleton.waypoints_per_flight)
            level = cfg.airspace.legal_levels_eastbound[
                (j + 1) % len(cfg.airspace.legal_levels_eastbound)
            ]
            planned = self._flight(
                f"{cfg.traffic.callsign_prefixes[j % len(cfg.traffic.callsign_prefixes)]}{208 + j}",
                route,
                level,
                (45 + j * 12) * 60,
                float(np.clip(0.82, *cfg.traffic.mach_range)),
                track.id,
            )
            if not self.check(planned.nominal, planned.scheduled_exit).passed:
                raise ValueError("Initial planned traffic is not separated")
            planned.status, planned.cleared = "cleared", planned.nominal
            self.flights[planned.id] = planned
        # Selected encounters have traffic above and below the target too.
        # A one-level escape is therefore not automatically a solution.
        targets = list(self.flights.values())[: cfg.traffic.initial_stacked_targets]
        for j, target in enumerate(targets):
            levels = cfg.airspace.legal_levels_eastbound
            level_index = levels.index(target.level)
            for delta in (-1, 1):
                index = level_index + delta
                if not 0 <= index < len(levels):
                    continue
                escort = self._flight(
                    f"{cfg.traffic.callsign_prefixes[j % len(cfg.traffic.callsign_prefixes)]}{600 + j * 2 + (delta + 1) // 2}",
                    target.route.copy(),
                    levels[index],
                    target.entry,
                    target.mach,
                    target.track_id,
                )
                if not self.check(escort.nominal, escort.scheduled_exit).passed:
                    raise ValueError("Initial stacked traffic is not separated")
                escort.status, escort.cleared = "cleared", escort.nominal
                self.flights[escort.id] = escort
        if len(self.flights) > cfg.traffic.initial_active_flights:
            raise ValueError("Planned and stacked flights exceed the requested initial fleet")
        attempts = 0
        while len(self.flights) < cfg.traffic.initial_active_flights:
            attempts += 1
            if attempts > 4000:
                raise RuntimeError(
                    "Could not build a verified initial fleet; reduce the requested density"
                )
            i = len(self.flights)
            track = self.tracks[int(self.traffic_rng.integers(len(self.tracks)))]
            route = resample(np.asarray(track.points), cfg.skeleton.waypoints_per_flight)
            random_route = (
                cfg.traffic.initial_random_route_fraction > 0
                and self.traffic_rng.random() < cfg.traffic.initial_random_route_fraction
            )
            if random_route:
                route = self._random_route()
            level = int(self.traffic_rng.choice(cfg.airspace.legal_levels_eastbound))
            mach = float(self.traffic_rng.uniform(*cfg.traffic.mach_range))
            entry = -float(self.traffic_rng.uniform(5 * 60, 2.5 * 3600))
            prefix = cfg.traffic.callsign_prefixes[i % len(cfg.traffic.callsign_prefixes)]
            serial = 100 + i * 7
            while f"{prefix}{serial}" in self.flights:
                serial += 1
            flight = self._flight(
                f"{prefix}{serial}",
                route,
                level,
                entry,
                mach,
                None if random_route else track.id,
            )
            if (
                flight.nominal.time_s[-1] <= 15 * 60
                or not self.check(flight.nominal, flight.scheduled_exit).passed
            ):
                continue
            flight.status, flight.cleared = "active", flight.nominal
            self.flights[flight.id] = flight

    def file_flight(self, conflict=True, params: dict[str, Any] | None = None):
        cfg, rng = self.config, self.traffic_rng
        params = cfg.validate_filing_params(params or {})
        requested = params.get("callsign")
        callsign = requested if requested and requested not in self.flights else self._callsign()
        track = self.tracks[int(rng.integers(len(self.tracks)))]
        route = resample(np.asarray(track.points), cfg.skeleton.waypoints_per_flight)
        weights = np.asarray(
            [cfg.traffic.level_weights[k] for k in cfg.airspace.legal_levels_eastbound]
        )
        level = int(rng.choice(cfg.airspace.legal_levels_eastbound, p=weights / weights.sum()))
        mach = float(rng.uniform(*cfg.traffic.mach_range))
        entry = self.time_s + float(rng.uniform(*cfg.traffic.filing_lead_time_min)) * 60
        track_id: str | None = track.id
        requested_route = params.get("route")
        if requested_route and requested_route.startswith("track:"):
            track = self.tracks[ord(requested_route[-1]) - ord("A")]
            route = resample(np.asarray(track.points), cfg.skeleton.waypoints_per_flight)
            track_id = track.id
        elif requested_route == "random":
            route = self._random_route()
            track_id = None
        target = self.flights.get(
            params.get("conflict_with", f"{cfg.traffic.callsign_prefixes[0]}208")
        )
        eligible = [
            f
            for f in self.flights.values()
            if f.cleared is not None
            and f.status in ("active", "cleared")
            and f.cleared.time_s[-1] > self.time_s + 50 * 60
        ]
        if target not in eligible:
            target = eligible[int(self.director_rng.integers(len(eligible)))] if eligible else None
        if conflict and target and target.cleared is not None:
            if requested_route is None:
                route = target.route.copy()
                if params.get("final_edge"):
                    route[:, 1] += np.linspace(-3, 0, len(route))
                else:
                    route[:, 1] += np.linspace(-2.0, 1.3, len(route))
                track_id = None
            level = params.get("level", target.level)
            mach = params.get("mach", float(np.clip(0.84, *cfg.traffic.mach_range)))
            provisional = self.trajectory(route, level, 0, mach)
            crossing = (
                len(route) - 2
                if params.get("final_edge")
                else int(round((len(route) - 1) * 2 / 3.3))
            )
            entry = float(
                target.cleared.waypoint_time_s[crossing]
                - provisional.waypoint_time_s[crossing]
                + params.get("offset_min", 0) * 60
            )
            kind = params.get("kind")
            if kind is None:
                if requested:
                    # Named presenter/script filings retain the hero encounter.
                    kind = "spatiotemporal"
                else:
                    kinds = sorted(cfg.director.conflict_kind_weights)
                    kind_weights = np.asarray(
                        [cfg.director.conflict_kind_weights[key] for key in kinds]
                    )
                    kind = str(self.director_rng.choice(kinds, p=kind_weights / kind_weights.sum()))
            if kind == "spatial_only":
                entry += 12 * 60
            # Respect filing lead time. If a target is unsuitable, do not claim
            # a conflict was injected; actual verifier results drive the UI.
            entry = max(entry, self.time_s + cfg.traffic.filing_lead_time_min[0] * 60)
        elif requested_route is None and rng.random() < cfg.traffic.random_route_fraction:
            route = self._random_route()
            track_id = None
        level = params.get("level", level)
        mach = params.get("mach", mach)
        flight = self._flight(callsign, route, level, entry, mach, track_id)
        self.flights[flight.id] = flight
        self.queue.append(flight.id)
        return flight

    def _random_route(self):
        cfg, rng = self.config, self.traffic_rng
        return resample(
            np.array(
                [
                    [cfg.airspace.oceanic_entry_lon_deg, rng.uniform(46, 56)],
                    [cfg.airspace.oceanic_exit_lon_deg, rng.uniform(49, 58)],
                ]
            ),
            cfg.skeleton.waypoints_per_flight,
        )

    def _callsign(self):
        for _ in range(10000):
            value = f"{self.traffic_rng.choice(self.config.traffic.callsign_prefixes)}{self.traffic_rng.integers(100, 1000)}"
            if value not in self.flights:
                return value
        raise RuntimeError("Synthetic callsign pool exhausted")

    def view(self) -> WorldView:
        flights = []
        for f in self.flights.values():
            trajectory = f.cleared or f.nominal
            flights.append(
                FlightView(
                    id=f.id,
                    callsign=f.callsign,
                    aircraft_type=f.aircraft_type,
                    mach=f.mach,
                    filed_level_fl=f.level,
                    track_id=f.track_id,
                    status=f.status,
                    entry_time_s=f.entry,
                    scheduled_exit_s=f.scheduled_exit,
                    route=f.route.tolist(),
                    position=PositionView(**position(trajectory, self.time_s)),
                    trajectory=PathView.model_validate(f.cleared.payload())
                    if f.cleared is not None
                    else None,
                )
            )
        return WorldView(
            scenario=self.scenario,
            start_utc=self.config.time.start_utc.isoformat(),
            sim_time_s=self.time_s,
            speed=self.speed,
            running=self.running,
            frozen_for_solve=self.frozen,
            flights=flights,
            tracks=self.tracks,
            queue_size=len(self.queue),
            separation_losses=self.losses,
            insertions_cleared=self.cleared_count,
            backend=self.config.solver.backend,
            seed=self.config.seed,
        )
