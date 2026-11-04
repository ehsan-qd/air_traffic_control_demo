import numpy as np
import pytest
from pydantic import ValidationError

from nat_demo.config import SCENARIOS, DemoConfig, load_config
from nat_demo.core.candidates import candidate_paths
from nat_demo.core.skeleton import build_skeleton
from nat_demo.core.trajectory import make_trajectory
from nat_demo.sim.world import World


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_scenario_config_is_valid(scenario):
    assert load_config(scenario).ui.show_synthetic_badge


@pytest.mark.parametrize(
    "section,key,value",
    [
        ("solver", "unknown_setting", 1),
        ("solver", "beta_end", 0.00001),
        ("skeleton", "K", -1),
        ("traffic", "mach_range", [-1, 0.8]),
        ("traffic", "aircraft_types", []),
        ("wind", "forecast_error_kt", 1),
        ("wind", "source", "era5"),
        ("ui", "show_synthetic_badge", False),
    ],
)
def test_config_rejects_unknown_invalid_or_unimplemented_values(section, key, value):
    config = load_config().model_dump()
    config[section][key] = value
    with pytest.raises(ValidationError):
        DemoConfig.model_validate(config)


def test_unknown_scenario_rejected():
    with pytest.raises(ValueError, match="Unknown scenario"):
        load_config("../default")


def test_initial_fleet_is_deterministic_and_independently_verified():
    config = load_config("hero_crossing")
    first, second = World(config, "hero_crossing"), World(config, "hero_crossing")
    assert first.view().model_dump(mode="json") == second.view().model_dump(mode="json")
    assert len(first.flights) == config.traffic.initial_active_flights
    for flight in first.flights.values():
        assert first.check(flight.cleared, flight.scheduled_exit, exclude=flight.id).passed
    # Solver work must not consume the traffic or wind random streams.
    first.solver_rng.random(100)
    a, b = first.file_flight(), second.file_flight()
    np.testing.assert_array_equal(a.nominal.xyz, b.nominal.xyz)
    np.testing.assert_array_equal(a.nominal.time_s, b.nominal.time_s)
    assert a.callsign == b.callsign


def test_hero_has_a_real_conflict_and_a_verified_single_vertical_manoeuvre():
    config = load_config("hero_crossing")
    world = World(config, "hero_crossing")
    flight = world.file_flight(
        params={"callsign": "XAT417", "conflict_with": "XAT208", "kind": "spatiotemporal"}
    )
    assert not world.check(flight.nominal, flight.scheduled_exit).passed
    cfg = config.skeleton
    skeleton = build_skeleton(
        flight.route,
        flight.level,
        config.airspace.legal_levels_eastbound,
        cfg.K,
        cfg.J,
        cfg.lateral_spacing_nm,
    )
    paths = candidate_paths(
        skeleton, config.objective.w_theta, config.objective.w_chi, config.objective.p
    )
    assert len(paths) == 441
    assert len({tuple(path.nodes) for path in paths}) == len(paths)
    assert all(path.nodes[0] == path.nodes[-1] == skeleton.nominal_node for path in paths)
    for candidate in paths:
        if candidate.lateral_cost or candidate.vertical_cost != 2:
            continue
        indices = np.arange(len(candidate.nodes))
        selected = np.asarray(candidate.nodes)
        trajectory = make_trajectory(
            skeleton.xyz[indices, selected],
            skeleton.level_fl[indices, selected],
            flight.entry,
            flight.mach,
            world.wind.wind_uv,
            cfg.edge_cost_substeps,
            cfg.subintervals_per_edge,
            cfg.climb_rate_fpm,
            candidate.theta,
            candidate.chi,
        )
        if world.check(trajectory, flight.scheduled_exit).passed:
            assert (
                abs(trajectory.time_s[-1] - flight.scheduled_exit)
                <= config.schedule.envelope_min * 60
            )
            break
    else:
        pytest.fail("hero crossing has no verified single vertical plateau candidate")
