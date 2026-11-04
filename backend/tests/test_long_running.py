"""A demo left running for hours at high speed must stay responsive and bounded."""

import asyncio
import time

from nat_demo.api.app import FORGET_EXITED_S, HISTORY_LIMIT, MAX_BACKGROUND_QUEUE, Simulation
from nat_demo.api.messages import InsertionRecord, Metrics


def simulation(monkeypatch, tmp_path, scenario):
    monkeypatch.setattr("nat_demo.sim.recorder.ROOT", tmp_path)
    return Simulation(scenario)


def test_ticks_slower_than_real_time_never_starve_the_event_loop(monkeypatch, tmp_path):
    sim = simulation(monkeypatch, tmp_path, "fleet_showcase")
    sim.world.running, sim.world.speed = True, 300
    tick = sim.tick

    def slow_tick():
        # At 300x a 5 s tick has about 17 ms; this one always takes longer.
        time.sleep(0.03)
        tick()

    monkeypatch.setattr(sim, "tick", slow_tick)
    monkeypatch.setattr(sim, "start_worker", lambda: None)

    async def worst_gap():
        runner = asyncio.create_task(sim.run())
        worst, last = 0.0, time.perf_counter()
        for _ in range(60):
            await asyncio.sleep(0.01)
            now = time.perf_counter()
            worst, last = max(worst, now - last), now
        runner.cancel()
        return worst

    # Without a bound on catch-up, each pass owes more ticks than the last and the gap diverges.
    assert asyncio.run(worst_gap()) < 0.8
    sim.recorder.close()


def test_departed_aircraft_are_forgotten(monkeypatch, tmp_path):
    sim = simulation(monkeypatch, tmp_path, "fleet_showcase")
    initial = len(sim.world.flights)
    for _ in range(int(4 * 3600 / sim.world.config.time.tick_s)):
        sim.tick()
    exited = [f for f in sim.world.flights.values() if f.status == "exited"]
    assert all(
        f.cleared is not None and sim.world.time_s - f.cleared.time_s[-1] <= FORGET_EXITED_S
        for f in exited
    )
    assert len(sim.world.flights) < initial
    sim.recorder.close()


def test_background_filings_wait_while_the_solver_is_backlogged(monkeypatch, tmp_path):
    sim = simulation(monkeypatch, tmp_path, "busy")
    for _ in range(int(2 * 3600 / sim.world.config.time.tick_s)):
        sim.tick()  # no worker runs, so nothing leaves the queue
    assert 0 < len(sim.world.queue) <= MAX_BACKGROUND_QUEUE
    sim.recorder.close()


def test_history_keeps_only_recent_records(monkeypatch, tmp_path):
    sim = simulation(monkeypatch, tmp_path, "calm")
    for i in range(HISTORY_LIMIT + 20):
        sim.remember(
            InsertionRecord(
                id=f"r{i}",
                flight_id="XAT417",
                callsign="XAT417",
                filed_at_s=0,
                cleared_at_s=0,
                outcome="cleared",
                verified=True,
                message=[],
                trajectory=None,
                metrics=Metrics(),
                attempts=[],
                backend="pbit_emulator",
            )
        )
    assert len(sim.history) == HISTORY_LIMIT
    assert sim.history[-1].id == f"r{HISTORY_LIMIT + 19}"
    sim.recorder.close()
