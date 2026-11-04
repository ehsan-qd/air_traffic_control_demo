import json

import numpy as np
import pytest
from pydantic import ValidationError

from nat_demo.api.app import Simulation
from nat_demo.config import DemoConfig, load_config
from nat_demo.geo.sphere import resample
from nat_demo.sim.world import World


def configured(beats=None, **traffic):
    data = load_config("calm").model_dump(mode="json")
    data["traffic"].update(traffic)
    if beats is not None:
        data["director"]["scripted_beats"] = beats
    return DemoConfig.model_validate(data)


@pytest.mark.parametrize(
    "action,params",
    [
        ("file_flight", {"callsign": "BAW123"}),
        ("file_flight", {"callsign": "XXX123"}),
        ("file_flight", {"conflict_with": "XXX123"}),
        ("file_flight", {"level": 360}),
        ("file_flight", {"mach": float("nan")}),
        ("file_flight", {"mach": -1}),
        ("file_flight", {"route": "track:Z"}),
        ("file_flight", {"route": "track:L"}),
        ("file_flight", {"route": "track:A", "final_edge": True}),
        ("file_flight", {"kind": "unknown"}),
        ("file_flight", {"offset_min": float("inf")}),
        ("file_flight", {"mispelled_level": 370}),
        ("set_speed", {"speed": 7}),
        ("set_speed", {}),
        ("pause", {"speed": 60}),
        ("wind_shift", {"jet_core_kt": 400}),
        ("wind_shift", {"drift_deg_per_hour": float("inf")}),
        ("wind_shift", {"source": "era5"}),
        ("wind_shift", {"jet_core_kt": None}),
        ("wind_shift", {}),
        ("highlight", {"flight_id": "XAT208", "screen": "unknown"}),
        ("highlight", {"flight_id": "XXX208"}),
        ("highlight", {"screen": "flight_deck"}),
    ],
)
def test_invalid_director_parameters_rejected_before_playback(action, params):
    with pytest.raises(ValidationError):
        configured([{"at_min": 0, "action": action, "params": params}])


def test_explicit_route_level_and_mach_are_honoured_even_when_injecting():
    cfg = configured()
    for conflict in (False, True):
        world = World(cfg, "calm")
        flight = world.file_flight(
            conflict, {"callsign": "XAT499", "route": "track:A", "level": 390, "mach": 0.83}
        )
        assert flight.level == 390
        assert flight.mach == 0.83
        assert flight.track_id == "A"
        expected = resample(np.asarray(world.tracks[0].points), cfg.skeleton.waypoints_per_flight)
        np.testing.assert_array_equal(flight.route, expected)
        assert np.all(flight.nominal.waypoint_altitude_m == 390 * 100 * 0.3048)
        random = world.file_flight(
            conflict, {"callsign": "XAT500", "route": "random", "level": 410, "mach": 0.81}
        )
        assert random.track_id is None
        assert random.level == 410
        assert random.mach == 0.81
        assert not np.array_equal(random.route, world.flights["XAT208"].route)
        assert random.route[0, 0] == pytest.approx(cfg.airspace.oceanic_entry_lon_deg)
        assert random.route[-1, 0] == pytest.approx(cfg.airspace.oceanic_exit_lon_deg)


def test_conflict_kind_weights_control_automatic_filings_without_changing_hero():
    data = configured().model_dump()
    data["director"]["conflict_kind_weights"] = {"spatial_only": 1.0, "spatiotemporal": 0.0}
    spatial_world = World(DemoConfig.model_validate(data), "calm")
    data["director"]["conflict_kind_weights"] = {"spatial_only": 0.0, "spatiotemporal": 1.0}
    temporal_world = World(DemoConfig.model_validate(data), "calm")
    spatial = spatial_world.file_flight(True)
    temporal = temporal_world.file_flight(True)
    np.testing.assert_array_equal(spatial.route, temporal.route)
    assert spatial.entry - temporal.entry == pytest.approx(12 * 60)
    assert not temporal_world.check(temporal.nominal, temporal.scheduled_exit).passed
    data["director"]["conflict_kind_weights"] = {"spatial_only": 1.0, "spatiotemporal": 0.0}
    hero_world = World(DemoConfig.model_validate(data), "calm")
    hero = hero_world.file_flight(True, {"callsign": "XAT417"})
    assert not hero_world.check(hero.nominal, hero.scheduled_exit).passed


def test_custom_prefixes_cover_initial_and_scripted_callsigns():
    cfg = configured(callsign_prefixes=["XYZ"])
    world = World(cfg, "calm")
    assert "XYZ208" in world.flights
    assert all(f.callsign.startswith("XYZ") for f in world.flights.values())
    flight = world.file_flight(True, {"callsign": "XYZ417", "conflict_with": "XYZ208"})
    assert flight.callsign == "XYZ417"
    assert not world.check(flight.nominal, flight.scheduled_exit).passed
    with pytest.raises(ValueError, match="configured fictitious prefix"):
        world.file_flight(True, {"callsign": "XAT417"})


def test_every_supported_beat_executes_without_runtime_validation_errors(monkeypatch, tmp_path):
    beats = [
        {
            "at_min": 0,
            "action": "file_flight",
            "params": {"callsign": "XAT499", "route": "track:A", "level": 390, "mach": 0.83},
        },
        {"at_min": 0, "action": "set_speed", "params": {"speed": 10}},
        {
            "at_min": 0,
            "action": "wind_shift",
            "params": {"jet_core_kt": 190, "drift_deg_per_hour": -2},
        },
        {
            "at_min": 0,
            "action": "highlight",
            "params": {"flight_id": "XAT499", "screen": "flight_deck"},
        },
        {"at_min": 0, "action": "pause", "params": {}},
    ]
    cfg = configured(beats, filings_per_hour=0)
    monkeypatch.setattr("nat_demo.api.app.load_config", lambda scenario: cfg)
    monkeypatch.setattr("nat_demo.sim.recorder.ROOT", tmp_path)
    sim = Simulation("calm")
    try:
        sim.world.running = True
        sim.tick()
        assert sim.world.queue == ["XAT499"]
        assert sim.world.speed == 10
        assert not sim.world.running
        assert sim.world.config.wind.jet_core_kt == 190
        assert sim.world.config.wind.drift_deg_per_hour == -2
        events = [json.loads(line) for line in sim.recorder.path.read_text().splitlines()]
        focus = next(event for event in events if event["type"] == "focus")
        assert focus["data"]["screen"] == "flight_deck"
        assert focus["data"]["flight_ids"] == ["XAT499"]
        sim.tick()
        assert sim.world.queue == ["XAT499"]
    finally:
        sim.recorder.close()
