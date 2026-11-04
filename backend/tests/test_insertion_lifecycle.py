import asyncio
import importlib
import json

import numpy as np

from nat_demo.api.app import Simulation
from nat_demo.config import load_config
from nat_demo.sim.insertion import insert
from nat_demo.sim.world import World
from nat_demo.solvers.pbit_emulator import SolveResult


def first_verified_candidate(qubo, config, rng, callback):
    """Deterministic solver double for lifecycle-only tests; sampler is tested separately."""
    index = next((i for i, feasible in enumerate(qubo.feasible) if feasible), None)
    bits = np.zeros(len(qubo.costs))
    if index is not None:
        bits[index] = 1
    return SolveResult(
        index, 0.0, 0, 0.0 if index is not None else None, qubo.energy(bits), "test_reference"
    )


def test_one_dynamically_impossible_candidate_does_not_abort_valid_alternatives(monkeypatch):
    module = importlib.import_module("nat_demo.sim.insertion")
    world = World(load_config(), "hero_crossing")
    flight = world.file_flight(True, {"callsign": "XAT417"})
    construct = module.make_trajectory
    rejected = False

    def one_impossible(xyz, levels, *args):
        nonlocal rejected
        if not rejected and np.any(levels != flight.level):
            rejected = True
            raise ValueError("level change cannot be completed on this candidate")
        return construct(xyz, levels, *args)

    monkeypatch.setattr(module, "make_trajectory", one_impossible)
    monkeypatch.setattr(module, "solve", first_verified_candidate)
    events = []
    record, path = insert(world, flight, lambda kind, data: events.append((kind, data)))
    assert rejected and record.verified and path is not None
    first_solve = next(data["solve"] for kind, data in events if kind == "solve_started")
    assert first_solve["terms"]["dynamics_rejected_paths"] == 1
    assert len(first_solve["candidates"]) == 440
    assert world.check(path, flight.scheduled_exit).passed


def test_tight_final_edge_uses_visible_delay_fallback_with_consistent_clearance(monkeypatch):
    module = importlib.import_module("nat_demo.sim.insertion")
    monkeypatch.setattr(module, "solve", first_verified_candidate)
    world = World(load_config("tight_skeleton"), "tight_skeleton")
    flight = world.file_flight(True, world.config.director.scripted_beats[0].params)
    record, path = insert(world, flight, lambda *_: None)
    assert record.verified and path is not None
    assert record.outcome == "cleared_after_fallback"
    assert record.attempts[0].reason == "Initial skeleton"
    assert record.attempts[0].feasible == 0
    assert record.attempts[1].reason == "Expanded skeleton"
    assert record.attempts[1].feasible == 0
    assert record.attempts[-1].reason.startswith("Entry delayed")
    assert path.time_s[0] > flight.entry
    assert world.check(path, flight.scheduled_exit).passed
    assert abs(record.metrics.arrival_dev_min) <= 10 + 1e-9
    assert "AS FILED" not in " ".join(record.message)
    assert "ENTRY" in " ".join(record.message)
    assert "Z" in " ".join(record.message)


def test_clearance_that_misses_entry_deadline_is_held_without_retroactive_issue(
    monkeypatch, tmp_path
):
    module = importlib.import_module("nat_demo.api.app")
    monkeypatch.setattr("nat_demo.sim.recorder.ROOT", tmp_path)
    sim = Simulation("hero_crossing")
    # A genuinely conflict-free flight keeps this test focused on completion
    # time rather than optimisation. Advance the sky while its valid result is
    # in flight, as can happen when freeze_sky_during_solve is disabled.
    sim.world.flights.clear()
    flight = sim.world.file_flight(False)
    sim.world.queue.clear()

    def sky_advanced(world, incoming, emit):
        record, path = insert(world, incoming, emit)
        assert record.verified and path is not None
        world.time_s = float(path.time_s[0]) + 5
        return record, path

    monkeypatch.setattr(module, "insert", sky_advanced)
    asyncio.run(sim._insert(flight))
    assert flight.cleared is None
    assert flight.status == "held"
    assert sim.world.cleared_count == 0
    assert sim.history[-1].verified is False
    assert sim.history[-1].metrics.stop_reason == "entry_deadline_missed"
    assert sim.history[-1].trajectory is None
    sim.recorder.close()
    events = [json.loads(line) for line in sim.recorder.path.read_text().splitlines()]
    assert not any(event["type"] == "clearance_issued" for event in events)
    assert any(event["type"] == "controller_attention" for event in events)
