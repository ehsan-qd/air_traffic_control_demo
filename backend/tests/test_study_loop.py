import math

from nat_demo.api.app import Simulation


def test_study_loop_paces_three_real_conflicting_requests_without_random_filings(
    monkeypatch, tmp_path
):
    monkeypatch.setattr("nat_demo.sim.recorder.ROOT", tmp_path)
    sim = Simulation("study_loop")
    world = sim.world
    assert len(world.flights) == 90
    assert world.speed == 10
    assert not world.config.time.freeze_sky_during_solve
    assert math.isinf(world.next_filing)
    arrivals = []
    for _ in range(300):  # 25 simulated minutes = 150 presentation seconds at 10x.
        before = len(world.queue)
        sim.tick()
        if len(world.queue) > before:
            flight = world.flights[world.queue[-1]]
            check = world.check(flight.nominal, flight.scheduled_exit)
            assert not check.passed
            arrivals.append((world.time_s / world.speed, flight.callsign))
    assert arrivals == [(15, "XAT417"), (57, "XBQ418"), (87, "XCV419")]
    assert len(world.queue) == 3
    assert world.losses == 0
    sim.recorder.close()
