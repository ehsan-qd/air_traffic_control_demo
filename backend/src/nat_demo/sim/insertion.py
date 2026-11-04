import time
from collections.abc import Callable
from copy import deepcopy
from datetime import timedelta
from typing import Any, Literal

import numpy as np

from nat_demo.api.messages import (
    AttemptView,
    InsertionRecord,
    Metrics,
    PathView,
    SolveView,
    StepView,
)
from nat_demo.core.candidates import candidate_paths
from nat_demo.core.qubo import assemble_candidate_qubo
from nat_demo.core.skeleton import build_skeleton
from nat_demo.core.trajectory import Trajectory, make_trajectory
from nat_demo.core.verify import verify
from nat_demo.sim.world import Flight, World
from nat_demo.solvers.pbit_emulator import solve
from nat_demo.units import FT_M, NM_M

Emit = Callable[[str, dict[str, Any]], None]


def insert(world: World, flight: Flight, emit: Emit) -> tuple[InsertionRecord, Trajectory | None]:
    cfg = world.config
    frozen = [
        (f.id, f.cleared)
        for f in world.flights.values()
        if f.id != flight.id
        and f.cleared is not None
        and f.status in ("active", "cleared")
        and f.cleared.time_s[-1] + cfg.separation.time_buffer_min * 60 >= flight.entry
        and f.cleared.time_s[0] - cfg.separation.time_buffer_min * 60
        <= flight.scheduled_exit + cfg.schedule.envelope_min * 60
    ]
    # Exact broad-phase pruning: disjoint altitude envelopes cannot violate
    # vertical separation anywhere on either trajectory, including climbs.
    # Surviving pairs still go through the independent spherical verifier.
    frozen_low = np.array([np.min(path.altitude_m) for _, path in frozen])
    frozen_high = np.array([np.max(path.altitude_m) for _, path in frozen])
    planning_wind = deepcopy(world.wind)
    metrics = Metrics(n_frozen=len(frozen))
    attempts: list[AttemptView] = []
    whole_started = time.perf_counter()

    def check(path: Trajectory):
        altitude_gap = np.maximum(np.min(path.altitude_m), frozen_low) - np.minimum(
            np.max(path.altitude_m), frozen_high
        )
        relevant = [
            frozen[i] for i in np.flatnonzero(altitude_gap < cfg.separation.vertical_ft * FT_M)
        ]
        return verify(
            path,
            relevant,
            flight.scheduled_exit,
            cfg.schedule.envelope_min * 60,
            cfg.separation.lateral_nm * NM_M,
            cfg.separation.vertical_ft * FT_M,
            cfg.separation.time_buffer_min * 60,
        )

    def step(name, started, detail="", status="done"):
        emit(
            "pipeline_step",
            {
                "step": StepView(
                    name=name,
                    status=status,
                    duration_ms=(time.perf_counter() - started) * 1000,
                    detail=detail,
                ).model_dump()
            },
        )

    nominal_check = check(flight.nominal)
    metrics.n_conflict_pairs = nominal_check.conflicting_pairs
    emit(
        "pipeline_step",
        {
            "step": StepView(
                name="Predict conflicts",
                status="done",
                detail=f"{metrics.n_conflict_pairs} conflicting sub-arc pairs · {len(frozen)} frozen flights",
            ).model_dump()
        },
    )
    if nominal_check.passed:
        metrics.t_verify_ms = (time.perf_counter() - whole_started) * 1000
        metrics.stop_reason = "nominal_verified"
        metrics.n_candidates_verified = 1
        metrics.n_candidates_feasible = 1
        attempts.append(
            AttemptView(
                number=1,
                reason="No conflict · nominal clearance",
                outcome="verified",
                candidates=1,
                feasible=1,
                duration_ms=metrics.t_verify_ms,
            )
        )
        view = SolveView(
            id=f"{flight.id}:0",
            flight_id=flight.id,
            callsign=flight.callsign,
            attempt=1,
            reason="No conflict · nominal clearance",
            nominal=PathView.model_validate(flight.nominal.payload()),
            candidates=[],
            candidate_feasible=[],
            conflicts_with=[],
            metrics=metrics,
            terms={"encoding": "candidate_path"},
        )
        emit("solve_started", {"solve": view.model_dump()})
        return _record(world, flight, flight.nominal, metrics, attempts, "cleared"), flight.nominal

    fallback = cfg.fallback
    plans = [
        (cfg.skeleton.K, cfg.skeleton.J, 0, "Initial skeleton"),
        (fallback.expanded_skeleton.K, fallback.expanded_skeleton.J, 0, "Expanded skeleton"),
    ]
    plans += [
        (cfg.skeleton.K, cfg.skeleton.J, delay, f"Entry delayed {delay} min")
        for delay in range(
            fallback.entry_delay_step_min,
            fallback.entry_delay_max_min + 1,
            fallback.entry_delay_step_min,
        )
    ]
    for attempt, (K, J, delay, reason) in enumerate(plans, 1):
        began = time.perf_counter()
        emit(
            "pipeline_step",
            {
                "step": StepView(
                    name="Build candidate QUBO",
                    status="running",
                    detail=f"Attempt {attempt} · {reason}",
                ).model_dump()
            },
        )
        skeleton = build_skeleton(
            flight.route,
            flight.level,
            cfg.airspace.legal_levels_eastbound,
            K,
            J,
            cfg.skeleton.lateral_spacing_nm,
        )
        candidates = candidate_paths(
            skeleton, cfg.objective.w_theta, cfg.objective.w_chi, cfg.objective.p
        )
        trajectories, feasible, costs, valid_candidates = [], [], [], []
        rejected_dynamics = 0
        for candidate in candidates:
            indices = np.arange(len(flight.route))
            try:
                path = make_trajectory(
                    skeleton.xyz[indices, candidate.nodes],
                    skeleton.level_fl[indices, candidate.nodes],
                    flight.entry + delay * 60,
                    flight.mach,
                    planning_wind.wind_uv,
                    cfg.skeleton.edge_cost_substeps,
                    cfg.skeleton.subintervals_per_edge,
                    cfg.skeleton.climb_rate_fpm,
                    candidate.theta,
                    candidate.chi,
                )
            except ValueError:
                # One physically impossible climb or wind triangle removes
                # that candidate, not every otherwise valid alternative.
                rejected_dynamics += 1
                continue
            valid_candidates.append(candidate)
            trajectories.append(path)
            # A path outside the arrival envelope is already infeasible. Do
            # not spend geometric-verification time on that doomed candidate.
            schedule_ok = (
                abs(float(path.time_s[-1]) - flight.scheduled_exit)
                <= cfg.schedule.envelope_min * 60 + 1e-7
            )
            feasible.append(schedule_ok and check(path).passed)
            costs.append(candidate.lateral_cost + candidate.vertical_cost)
        candidates = valid_candidates
        qubo = (
            assemble_candidate_qubo(np.asarray(costs), feasible, cfg.qubo.lambda_margin)
            if costs
            else None
        )
        terms: dict[str, float | int | str] = (
            dict(qubo.terms)
            if qubo is not None
            else {"encoding": "candidate_path", "candidate_count": 0}
        )
        terms["dynamics_rejected_paths"] = rejected_dynamics
        metrics.n_vars = len(candidates)
        metrics.nnz_q = qubo.sparse.nnz if qubo is not None else 0
        metrics.n_candidates_verified = len(candidates)
        metrics.n_candidates_feasible = feasible.count(True)
        metrics.t_build_ms = (time.perf_counter() - began) * 1000
        step(
            "Build candidate QUBO",
            began,
            f"{len(candidates)} path variables · {feasible.count(True)} verified candidates · {rejected_dynamics} dynamics rejections",
        )
        view = SolveView(
            id=f"{flight.id}:{attempt}",
            flight_id=flight.id,
            callsign=flight.callsign,
            attempt=attempt,
            reason=reason,
            nominal=PathView.model_validate(flight.nominal.payload()),
            candidates=[PathView.model_validate(t.payload()) for t in trajectories],
            candidate_feasible=feasible,
            conflicts_with=list(nominal_check.conflicts_with),
            metrics=metrics.model_copy(),
            terms=terms,
        )
        emit("solve_started", {"solve": view.model_dump()})
        # A known-empty candidate set is reported directly, not called a proof
        # that the full paper's unrestricted skeleton is infeasible.
        if not any(feasible):
            attempts.append(
                AttemptView(
                    number=attempt,
                    reason=reason,
                    outcome="no_verified_candidate",
                    candidates=len(candidates),
                    feasible=0,
                    duration_ms=(time.perf_counter() - began) * 1000,
                )
            )
            step(
                "Independent verifier",
                began,
                "No verified candidate · proceeding to fallback",
                "failed",
            )
            continue
        assert qubo is not None
        solve_start = time.perf_counter()
        emit(
            "pipeline_step",
            {
                "step": StepView(
                    name="Anneal on CPU",
                    status="running",
                    detail="Real p-bit Gibbs samples · bounded candidate basis",
                ).model_dump()
            },
        )
        result = solve(
            qubo,
            cfg.solver,
            world.solver_rng,
            lambda progress: emit("solve_progress", {"progress": progress}),
        )
        metrics.t_solve_ms = result.solve_ms
        metrics.sweeps = result.sweeps
        metrics.t_first_feasible_ms = result.first_feasible_ms
        metrics.stop_reason = result.stop_reason
        step("Anneal on CPU", solve_start, f"{result.sweeps:,} sweeps · {result.stop_reason}")
        verification_started = time.perf_counter()
        selected = result.selected
        if selected is not None and check(trajectories[selected]).passed:
            path = trajectories[selected]
            metrics.t_verify_ms = (time.perf_counter() - verification_started) * 1000
            metrics.c_n_lateral = candidates[selected].lateral_cost
            metrics.c_n_vertical = candidates[selected].vertical_cost
            metrics.c_n = metrics.c_n_lateral + metrics.c_n_vertical
            metrics.arrival_dev_min = (float(path.time_s[-1]) - flight.scheduled_exit) / 60
            attempts.append(
                AttemptView(
                    number=attempt,
                    reason=reason,
                    outcome="verified",
                    candidates=len(candidates),
                    feasible=feasible.count(True),
                    duration_ms=(time.perf_counter() - began) * 1000,
                )
            )
            step(
                "Independent verifier",
                verification_started,
                "Separation and schedule certified by conservative arc envelopes",
            )
            return _record(
                world,
                flight,
                path,
                metrics,
                attempts,
                "cleared" if attempt == 1 else "cleared_after_fallback",
            ), path
        attempts.append(
            AttemptView(
                number=attempt,
                reason=reason,
                outcome="sampler_no_verified_solution",
                candidates=len(candidates),
                feasible=feasible.count(True),
                duration_ms=(time.perf_counter() - began) * 1000,
            )
        )
        step(
            "Independent verifier",
            verification_started,
            "No sampled candidate passed · proceeding to fallback",
            "failed",
        )
    metrics.stop_reason = "fallbacks_exhausted"
    return _record(world, flight, None, metrics, attempts, "held"), None


def _record(
    world: World,
    flight: Flight,
    path: Trajectory | None,
    metrics: Metrics,
    attempts: list[AttemptView],
    outcome: Literal["cleared", "cleared_after_fallback", "held", "error"],
) -> InsertionRecord:
    message = ["NO CLEARANCE ISSUED", "CONTROLLER ATTENTION · REFILING IN 15 MIN"]
    if path is not None:
        changed = np.flatnonzero((path.chi != 0) | (path.theta != 0))
        if len(changed):
            first = int(changed[0])
            fl = round(float(path.waypoint_altitude_m[first]) / (100 * FT_M))
            instructions = []
            if fl != flight.level:
                instructions.append(f"{'CLIMB' if fl > flight.level else 'DESCEND'} TO FL{fl}")
            if path.theta[first] != 0:
                instructions.append(
                    f"OFFSET {abs(float(path.theta[first])) * world.config.skeleton.lateral_spacing_nm:.0f} NM {'RIGHT' if path.theta[first] > 0 else 'LEFT'}"
                )
            last = int(changed[-1])
            message = [
                f"AFTER WPT {first - 1:02} " + " / ".join(instructions),
                f"AFTER WPT {last:02} REJOIN FILED ROUTE / FL{flight.level}",
            ]
        else:
            message = [f"CLEARED FILED ROUTE · MAINTAIN FL{flight.level}", "OCEANIC ENTRY AS FILED"]
        if attempts and attempts[-1].reason.startswith("Entry delayed"):
            entry_utc = (
                world.config.time.start_utc + timedelta(seconds=float(path.time_s[0]))
            ).strftime("%H:%M:%SZ")
            if len(changed):
                message[0] = f"ENTRY {entry_utc} · " + message[0]
            else:
                message[1] = f"OCEANIC ENTRY {entry_utc} · {attempts[-1].reason.upper()}"
    return InsertionRecord(
        id=f"{flight.id}-{len(world.flights)}-{int(world.time_s)}",
        flight_id=flight.id,
        callsign=flight.callsign,
        filed_at_s=flight.filed_at,
        cleared_at_s=world.time_s,
        outcome=outcome,
        verified=path is not None,
        message=message,
        trajectory=PathView.model_validate(path.payload()) if path is not None else None,
        metrics=metrics,
        attempts=attempts,
        backend=world.config.solver.backend,
    )
