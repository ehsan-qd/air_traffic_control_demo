import importlib

import numpy as np

from nat_demo.api.app import Simulation
from nat_demo.config import load_config
from nat_demo.core.verify import monitor_positions
from nat_demo.geo.sphere import distance, lonlat_to_xyz
from nat_demo.sim.insertion import insert
from nat_demo.sim.world import World
from nat_demo.solvers.pbit_emulator import SolveResult
from nat_demo.units import FT_M, NM_M


def test_showcase_has_a_dense_diverse_independently_verified_fleet():
    world = World(load_config("fleet_showcase"), "fleet_showcase")
    assert len(world.flights) == 90
    assert sum(f.status == "active" for f in world.flights.values()) == 76
    assert len({f.aircraft_type for f in world.flights.values()}) >= 5
    assert len({f.level for f in world.flights.values()}) == 6
    assert sum(f.track_id is None for f in world.flights.values()) >= 15
    for flight in world.flights.values():
        assert world.check(flight.cleared, flight.scheduled_exit, exclude=flight.id).passed


def test_showcase_queues_multiple_distinct_encounters(monkeypatch, tmp_path):
    monkeypatch.setattr("nat_demo.sim.recorder.ROOT", tmp_path)
    sim = Simulation("fleet_showcase")
    sim.tick()
    sim.tick()
    assert sim.world.queue[:3] == ["XAT417", "XBQ418", "XCV419"]
    targets = set()
    for flight_id in sim.world.queue[:3]:
        flight = sim.world.flights[flight_id]
        result = sim.world.check(flight.nominal, flight.scheduled_exit)
        assert not result.passed
        targets.update(result.conflicts_with)
    assert {"XAT208", "XBQ209", "XCV210"} <= targets
    assert not sim.world.config.time.freeze_sky_during_solve
    sim.recorder.close()


def test_three_stacked_encounters_have_large_choice_spaces_and_verified_solutions(monkeypatch):
    # Use a deterministic solver double here to exercise every candidate and
    # independent verifier. Real Gibbs sampling is covered by sampler/API tests.
    def choose(qubo, config, rng, callback):
        indices = np.flatnonzero(qubo.feasible)
        selected = int(indices[np.argmin(qubo.costs[indices])])
        bits = np.zeros(len(qubo.costs))
        bits[selected] = 1
        return SolveResult(selected, 0, 0, 0, qubo.energy(bits), "test_reference")

    monkeypatch.setattr(importlib.import_module("nat_demo.sim.insertion"), "solve", choose)
    world = World(load_config("fleet_showcase"), "fleet_showcase")
    for beat in world.config.director.scripted_beats[:3]:
        flight = world.file_flight(True, beat.params)
        record, trajectory = insert(world, flight, lambda *_: None)
        assert record.verified and trajectory is not None
        assert record.metrics.n_vars >= 1300
        assert 1 < record.metrics.n_candidates_feasible < record.metrics.n_vars / 4
        assert record.metrics.c_n > 2  # one legal-level escape is insufficient
        # Full independent check includes ALL other flights, also those removed
        # by insertion's exact altitude-envelope broad phase.
        assert world.check(trajectory, flight.scheduled_exit).passed
        flight.cleared, flight.status = trajectory, "cleared"


def test_vectorised_live_monitor_matches_pairwise_spherical_reference():
    rng = np.random.default_rng(23)
    xyz = lonlat_to_xyz(np.column_stack((rng.uniform(-32, -28, 90), rng.uniform(48, 52, 90))))
    altitude = rng.choice([330, 350, 370], 90) * 100 * FT_M
    expected = [
        (i, j)
        for i in range(len(xyz))
        for j in range(i + 1, len(xyz))
        if abs(altitude[i] - altitude[j]) < 1000 * FT_M
        and float(distance(xyz[i], xyz[j])) < 30 * NM_M
    ]
    assert monitor_positions(xyz, altitude, 30 * NM_M, 1000 * FT_M) == expected
    assert monitor_positions(np.empty((0, 3)), np.empty(0), 30 * NM_M, 1000 * FT_M) == []
