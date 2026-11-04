"""Independent, conservative separation certification of the decoded 4D path.

This module has no dependency on the QUBO or sampler. An altitude envelope and
occupation interval over a spherical arc contain every point of the flown piece.
If the envelopes cannot prove separation, we reject the clearance. This may
reject a safe path, but never relies on discrete point samples to certify safety.
"""

from dataclasses import dataclass

import numpy as np

from nat_demo.core.trajectory import Trajectory
from nat_demo.geo.segment_distance import arc_distance
from nat_demo.geo.sphere import Array, distance, unit


@dataclass(frozen=True)
class Verification:
    passed: bool
    conflicting_pairs: int
    conflicts_with: tuple[str, ...]
    schedule_passed: bool


def _validate_trajectory(trajectory: Trajectory) -> None:
    """Fail closed on malformed input before any envelope comparisons."""
    count = len(trajectory.time_s)
    if count < 2 or trajectory.xyz.shape != (count, 3) or trajectory.altitude_m.shape != (count,):
        raise ValueError("trajectory sample arrays must have consistent lengths")
    if not all(
        np.all(np.isfinite(value))
        for value in (trajectory.xyz, trajectory.altitude_m, trajectory.time_s)
    ):
        raise ValueError("trajectory samples must be finite")
    if np.any(np.diff(trajectory.time_s) <= 0):
        raise ValueError("trajectory sample times must strictly increase")
    if not np.allclose(np.linalg.norm(trajectory.xyz, axis=1), 1.0, atol=1e-10, rtol=0):
        raise ValueError("trajectory samples must be unit vectors")
    if np.any(np.sum(trajectory.xyz[:-1] * trajectory.xyz[1:], axis=1) <= -1 + 1e-12):
        raise ValueError("antipodal trajectory segments are ambiguous")


def conflict_pairs(
    a: Trajectory, b: Trajectory, lateral_m: float, vertical_m: float, buffer_s: float
) -> int:
    _validate_trajectory(a)
    _validate_trajectory(b)
    if (
        not all(np.isfinite(value) for value in (lateral_m, vertical_m, buffer_s))
        or lateral_m <= 0
        or vertical_m <= 0
        or buffer_s < 0
    ):
        raise ValueError("invalid separation thresholds")
    if a.time_s[-1] + buffer_s < b.time_s[0] or b.time_s[-1] + buffer_s < a.time_s[0]:
        return 0
    gap = np.maximum(a.time_s[:-1, None], b.time_s[None, :-1]) - np.minimum(
        a.time_s[1:, None], b.time_s[None, 1:]
    )
    alo, ahi = (
        np.minimum(a.altitude_m[:-1], a.altitude_m[1:]),
        np.maximum(a.altitude_m[:-1], a.altitude_m[1:]),
    )
    blo, bhi = (
        np.minimum(b.altitude_m[:-1], b.altitude_m[1:]),
        np.maximum(b.altitude_m[:-1], b.altitude_m[1:]),
    )
    vertical_gap = np.maximum(alo[:, None], blo[None, :]) - np.minimum(ahi[:, None], bhi[None, :])
    possible = ((gap < buffer_s) | (gap <= 0)) & (vertical_gap < vertical_m)
    i, j = np.where(possible)
    if not len(i):
        return 0
    ac = unit(a.xyz[:-1] + a.xyz[1:])
    bc = unit(b.xyz[:-1] + b.xyz[1:])
    radius_a = distance(a.xyz[:-1], a.xyz[1:]) / 2
    radius_b = distance(b.xyz[:-1], b.xyz[1:]) / 2
    near = distance(ac[i], bc[j]) <= lateral_m + radius_a[i] + radius_b[j] + 1e-5
    i, j = i[near], j[near]
    if not len(i):
        return 0
    separations = arc_distance(a.xyz[i], a.xyz[i + 1], b.xyz[j], b.xyz[j + 1])
    return int(np.count_nonzero(separations <= lateral_m + 1e-6))


def verify(
    trajectory: Trajectory,
    frozen: list[tuple[str, Trajectory]],
    scheduled_exit_s: float,
    envelope_s: float,
    lateral_m: float,
    vertical_m: float,
    buffer_s: float,
) -> Verification:
    _validate_trajectory(trajectory)
    if not np.isfinite(scheduled_exit_s) or not np.isfinite(envelope_s) or envelope_s < 0:
        raise ValueError("invalid schedule window")
    schedule = abs(float(trajectory.time_s[-1]) - scheduled_exit_s) <= envelope_s + 1e-7
    conflicts: list[str] = []
    count = 0
    for flight_id, other in frozen:
        n = conflict_pairs(trajectory, other, lateral_m, vertical_m, buffer_s)
        if n:
            conflicts.append(flight_id)
            count += n
    return Verification(schedule and not conflicts, count, tuple(conflicts), schedule)


def monitor_positions(
    xyz: Array, altitude_m: Array, lateral_m: float, vertical_m: float
) -> list[tuple[int, int]]:
    i, j = np.triu_indices(len(xyz), 1)
    vertical = np.abs(altitude_m[i] - altitude_m[j]) < vertical_m
    i, j = i[vertical], j[vertical]
    close = distance(xyz[i], xyz[j]) < lateral_m
    return [(int(a), int(b)) for a, b in zip(i[close], j[close], strict=True)]
