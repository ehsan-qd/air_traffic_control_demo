import numpy as np
import pytest
from hypothesis import given
from hypothesis import strategies as st

from nat_demo.core.skeleton import build_skeleton
from nat_demo.geo.segment_distance import arc_distance, arc_distance_matrix, point_arc
from nat_demo.geo.sphere import angle, distance, lonlat_to_xyz, slerp, xyz_to_lonlat
from nat_demo.units import EARTH_RADIUS_M, NM_M


def xyz(points):
    return lonlat_to_xyz(np.asarray(points, dtype=float))


def test_arc_crossing_is_detected_between_endpoints():
    a, b, c, d = xyz([[-2, 0], [2, 0], [0, -2], [0, 2]])
    assert min(distance(a, c), distance(a, d), distance(b, c), distance(b, d)) > 100_000
    assert arc_distance(a, b, c, d) == pytest.approx(0, abs=1e-6)


def test_degenerate_parallel_and_short_arcs():
    a, b, c, d = xyz([[0, 0], [1, 0], [2, 0], [3, 0]])
    assert arc_distance(a, b, c, d) == pytest.approx(EARTH_RADIUS_M * np.pi / 180)
    assert arc_distance(a, c, b, d) == pytest.approx(0, abs=1e-6)
    assert arc_distance(a, a, c, c) == pytest.approx(distance(a, c))
    assert arc_distance(a, a, a, b) == pytest.approx(0, abs=1e-6)
    pole = xyz([0, 90])
    assert point_arc(pole, a, b) == pytest.approx(np.pi / 2)
    short = xyz([1e-9, 0])
    assert angle(a, short) == pytest.approx(np.deg2rad(1e-9), rel=1e-10)
    assert np.isfinite(arc_distance(a, short, c, d))


def test_arc_matrix_and_dateline():
    a, b, c, d = xyz([[179, 0], [-179, 0], [180, -1], [180, 1]])
    matrix = arc_distance_matrix(np.array([a, c]), np.array([b, d]), np.array([c]), np.array([d]))
    np.testing.assert_allclose(matrix, 0, atol=1e-6)
    np.testing.assert_allclose(xyz_to_lonlat(slerp(a, b, np.asarray(0.5))), [180, 0], atol=1e-10)


@given(st.floats(min_value=-170, max_value=170), st.floats(min_value=-70, max_value=70))
def test_distance_is_symmetric_and_bounded_by_endpoint_distances(lon, lat):
    a, b, c, d = xyz([[lon, lat], [lon + 2, lat + 1], [lon - 1, lat + 2], [lon + 1, lat + 3]])
    value = float(arc_distance(a, b, c, d))
    assert value >= 0
    assert value == pytest.approx(float(arc_distance(c, d, a, b)), abs=1e-6)
    assert (
        value <= float(min(distance(a, c), distance(a, d), distance(b, c), distance(b, d))) + 1e-6
    )


def test_skeleton_offsets_right_and_fixes_endpoints_and_legal_levels():
    route = np.array([[-10, 0], [0, 0], [10, 0]], dtype=float)
    skeleton = build_skeleton(route, 370, [350, 370, 390], 1, 1, 30)
    right = np.flatnonzero((skeleton.theta == 1) & (skeleton.chi == 0))[0]
    left = np.flatnonzero((skeleton.theta == -1) & (skeleton.chi == 0))[0]
    assert xyz_to_lonlat(skeleton.xyz[1, right])[1] < 0
    assert xyz_to_lonlat(skeleton.xyz[1, left])[1] > 0
    assert distance(skeleton.xyz[1, right], xyz(route[1])) == pytest.approx(30 * NM_M)
    np.testing.assert_allclose(
        skeleton.xyz[0], np.broadcast_to(xyz(route[0]), skeleton.xyz[0].shape)
    )
    np.testing.assert_allclose(
        skeleton.xyz[-1], np.broadcast_to(xyz(route[-1]), skeleton.xyz[-1].shape)
    )
    assert np.all(skeleton.level_fl[[0, -1]] == 370)
    upper = build_skeleton(route, 390, [350, 370, 390], 1, 1, 30)
    assert np.all(np.isnan(upper.level_fl[1, upper.chi == 1]))
