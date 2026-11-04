from dataclasses import replace

import numpy as np
import pytest

from nat_demo.core.trajectory import Trajectory, make_trajectory, position, true_airspeed
from nat_demo.core.verify import conflict_pairs, verify
from nat_demo.geo.sphere import distance, lonlat_to_xyz
from nat_demo.units import FT_M, NM_M


def trajectory(points, times, altitudes=None):
    coordinates = lonlat_to_xyz(np.asarray(points, dtype=float))
    altitude = (
        np.full(len(points), 10_000.0) if altitudes is None else np.asarray(altitudes, dtype=float)
    )
    time = np.asarray(times, dtype=float)
    return Trajectory(
        coordinates,
        altitude,
        time,
        coordinates,
        altitude,
        time,
        np.zeros(len(points)),
        np.zeros(len(points)),
    )


def zero_wind(lon, lat, level, time):
    return np.zeros_like(lon), np.zeros_like(lat)


def test_wind_triangle_and_exact_midpoint_integration():
    coordinates = lonlat_to_xyz(np.array([[0, 0], [1, 0]], dtype=float))
    levels = np.array([350.0, 350.0])
    tas = float(true_airspeed(0.82, np.asarray(350.0)))
    length = float(distance(*coordinates))
    for tailwind, crosswind in [(0, 0), (40, 0), (-40, 0), (20, 50)]:

        def wind(lon, lat, level, time, tailwind=tailwind, crosswind=crosswind):
            assert time == 125.0  # Planning wind frozen at entry time.
            return np.full_like(lon, tailwind), np.full_like(lat, crosswind)

        path = make_trajectory(coordinates, levels, 125, 0.82, wind, 20, 4, 1500)
        expected = length / (np.sqrt(tas**2 - crosswind**2) + tailwind)
        assert path.time_s[-1] - 125 == pytest.approx(expected)
        assert position(path, 125 + expected / 2)["lon"] == pytest.approx(0.5)
        assert position(path, 125 + expected / 2)["ground_speed_ms"] == pytest.approx(
            length / expected
        )
    assert float(true_airspeed(1, np.asarray(400.0))) == pytest.approx(295.069, abs=0.001)


def test_actual_climb_ramp_and_transition_conflict():
    coordinates = lonlat_to_xyz(np.array([[0, 0], [2, 0]], dtype=float))
    path = make_trajectory(coordinates, np.array([350.0, 390.0]), 0, 0.82, zero_wind, 20, 4, 1500)
    completion = 4000 / 1500 * 60
    assert np.any(np.isclose(path.time_s, completion))
    assert position(path, completion / 2)["altitude_m"] == pytest.approx(370 * 100 * FT_M)
    assert position(path, completion + 1)["altitude_m"] == pytest.approx(390 * 100 * FT_M)
    other = trajectory([[0, 0], [2, 0]], [0, 800], [370 * 100 * FT_M] * 2)
    assert conflict_pairs(path, other, 30 * NM_M, 1000 * FT_M, 180) > 0


def test_continuous_arc_verifier_does_not_clear_a_crossing_between_samples():
    a = trajectory([[-2, 0], [2, 0]], [0, 100])
    b = trajectory([[0, -2], [0, 2]], [0, 100])
    result = verify(a, [("crossing", b)], 100, 0, 30 * NM_M, 1000 * FT_M, 180)
    assert not result.passed
    assert result.conflicts_with == ("crossing",)
    assert result.conflicting_pairs == 1


def test_exact_unquantised_time_buffer_schedule_and_vertical_threshold():
    a = trajectory([[0, 0], [1, 0]], [0, 100])
    b = trajectory([[0, 0], [1, 0]], [280, 380])
    assert conflict_pairs(a, b, 30 * NM_M, 1000 * FT_M, 180) == 0
    assert conflict_pairs(a, replace(b, time_s=b.time_s - 0.0001), 30 * NM_M, 1000 * FT_M, 180) == 1
    assert verify(a, [], 700, 600, 30 * NM_M, 1000 * FT_M, 180).passed
    assert not verify(a, [], 700.0001, 600, 30 * NM_M, 1000 * FT_M, 180).passed
    high = replace(a, altitude_m=a.altitude_m + 1000 * FT_M)
    assert conflict_pairs(a, high, 30 * NM_M, 1000 * FT_M - 1e-8, 180) == 0
    assert (
        conflict_pairs(
            a, replace(high, altitude_m=high.altitude_m - 1), 30 * NM_M, 1000 * FT_M, 180
        )
        == 1
    )


def test_zero_buffer_still_detects_coincident_entry_exit():
    a = trajectory([[0, 0], [1, 0]], [0, 100])
    b = trajectory([[1, 0], [2, 0]], [100, 200])
    assert conflict_pairs(a, b, 30 * NM_M, 1000 * FT_M, 0) == 1


@pytest.mark.parametrize("kind", ["nan", "duplicate_time", "nonunit"])
def test_verifier_fails_closed_on_malformed_trajectory(kind):
    path = trajectory([[0, 0], [1, 0]], [0, 100])
    if kind == "nan":
        path = replace(path, altitude_m=np.array([np.nan, 10000.0]))
    elif kind == "duplicate_time":
        path = replace(path, time_s=np.zeros(2))
    else:
        path = replace(path, xyz=np.zeros((2, 3)))
    with pytest.raises(ValueError):
        verify(path, [], 100, 600, 30 * NM_M, 1000 * FT_M, 180)


def test_impossible_climb_and_crosswind_are_rejected():
    coordinates = lonlat_to_xyz(np.array([[0, 0], [0.01, 0]], dtype=float))
    with pytest.raises(ValueError, match="level change"):
        make_trajectory(coordinates, np.array([310.0, 410.0]), 0, 0.82, zero_wind, 20, 4, 1500)

    def extreme_wind(lon, lat, level, time):
        return np.zeros_like(lon), np.full_like(lat, 400)

    with pytest.raises(ValueError, match="crosswind"):
        make_trajectory(coordinates, np.array([350.0, 350.0]), 0, 0.82, extreme_wind, 20, 4, 1500)
