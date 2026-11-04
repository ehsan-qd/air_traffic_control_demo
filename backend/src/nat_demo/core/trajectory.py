from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from nat_demo.geo.sphere import Array, angle, slerp, unit, xyz_to_lonlat
from nat_demo.units import EARTH_RADIUS_M, FT_M

WindFunction = Callable[[Array, Array, Array, float], tuple[Array, Array]]


@dataclass(frozen=True)
class Trajectory:
    xyz: Array
    altitude_m: Array
    time_s: Array
    waypoint_xyz: Array
    waypoint_altitude_m: Array
    waypoint_time_s: Array
    theta: Array
    chi: Array

    def payload(self) -> dict[str, object]:
        points = xyz_to_lonlat(self.waypoint_xyz)
        return {
            "points": np.column_stack((points, self.waypoint_altitude_m / (100 * FT_M))).tolist(),
            "times_s": self.waypoint_time_s.tolist(),
            "theta": self.theta.tolist(),
            "chi": self.chi.tolist(),
        }


def true_airspeed(mach: float, level_fl: Array) -> Array:
    height = level_fl * 100 * FT_M
    temperature = np.maximum(216.65, 288.15 - 0.0065 * height)
    return np.asarray(mach * np.sqrt(1.4 * 287.05287 * temperature))


def make_trajectory(
    xyz: Array,
    levels_fl: Array,
    entry_s: float,
    mach: float,
    wind: WindFunction,
    substeps: int,
    subintervals: int,
    climb_fpm: float,
    theta: Array | None = None,
    chi: Array | None = None,
) -> Trajectory:
    if xyz.ndim != 2 or xyz.shape[1] != 3 or len(xyz) < 2:
        raise ValueError("trajectory needs at least two unit-vector waypoints")
    if levels_fl.shape != (len(xyz),) or not np.all(np.isfinite(levels_fl)):
        raise ValueError("every waypoint needs a finite flight level")
    if not np.all(np.isfinite(xyz)) or not np.allclose(
        np.linalg.norm(xyz, axis=1), 1.0, atol=1e-10, rtol=0
    ):
        raise ValueError("waypoints must be finite unit vectors")
    if (
        not np.isfinite(entry_s)
        or not np.isfinite(mach)
        or mach <= 0
        or not np.isfinite(climb_fpm)
        or climb_fpm <= 0
        or substeps < 1
        or subintervals < 1
    ):
        raise ValueError("invalid trajectory integration parameters")
    a, b = xyz[:-1], xyz[1:]
    lengths = angle(a, b)
    if np.any(lengths <= 1e-12) or np.any(lengths >= np.pi - 1e-10):
        raise ValueError("trajectory edges must be nonzero, unambiguous minor arcs")
    fraction = (np.arange(substeps) + 0.5) / substeps
    mid = slerp(a[:, None, :], b[:, None, :], fraction[None, :])
    normal = unit(np.cross(a, b))
    tangent = unit(np.cross(normal[:, None, :], mid))
    lonlat = xyz_to_lonlat(mid)
    u, v = wind(lonlat[..., 0], lonlat[..., 1], levels_fl[1:, None], entry_s)
    lon, lat = np.moveaxis(np.deg2rad(lonlat), -1, 0)
    east = np.stack((-np.sin(lon), np.cos(lon), np.zeros_like(lon)), axis=-1)
    north = np.stack((-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)), axis=-1)
    if not np.all(np.isfinite(u)) or not np.all(np.isfinite(v)):
        raise ValueError("wind must be finite")
    vector = u[..., None] * east + v[..., None] * north
    tail = np.sum(vector * tangent, axis=-1)
    cross_sq = np.maximum(0.0, np.sum(vector * vector, axis=-1) - tail * tail)
    tas = true_airspeed(mach, levels_fl[1:, None])
    if np.any(cross_sq >= tas * tas):
        raise ValueError("wind exceeds the aircraft's crosswind capability")
    gs = np.sqrt(tas * tas - cross_sq) + tail
    if np.any(gs <= 0):
        raise ValueError("non-positive ground speed")
    piece_s = EARTH_RADIUS_M * angle(a, b)[:, None] / (substeps * gs)
    offsets = np.column_stack((np.zeros(len(a)), np.cumsum(piece_s, axis=1)))
    costs = offsets[:, -1]
    waypoint_times = entry_s + np.concatenate(([0.0], np.cumsum(costs)))
    waypoint_alt = levels_fl * (100 * FT_M)
    samples_xyz, samples_alt, samples_t = [xyz[0]], [float(waypoint_alt[0])], [entry_s]
    climb_ms = climb_fpm * FT_M / 60
    for edge in range(len(a)):
        f = np.linspace(0, 1, subintervals + 1)
        time = np.interp(f, np.linspace(0, 1, substeps + 1), offsets[edge])
        difference = waypoint_alt[edge + 1] - waypoint_alt[edge]
        climb_s = abs(difference) / climb_ms
        if climb_s > costs[edge]:
            raise ValueError("level change cannot be completed on the edge")
        if 0 < climb_s < costs[edge] and np.min(np.abs(time - climb_s)) > 1e-8:
            cf = np.interp(climb_s, time, f)
            f = np.append(f, cf)
            time = np.append(time, climb_s)
            order = np.argsort(time)
            f, time = f[order], time[order]
        points = slerp(a[edge], b[edge], f)
        alt = waypoint_alt[edge] + np.sign(difference) * np.minimum(
            abs(difference), time * climb_ms
        )
        samples_xyz.extend(points[1:])
        samples_alt.extend(alt[1:])
        samples_t.extend(waypoint_times[edge] + time[1:])
    n = len(xyz)
    return Trajectory(
        np.asarray(samples_xyz),
        np.asarray(samples_alt),
        np.asarray(samples_t),
        xyz,
        waypoint_alt,
        waypoint_times,
        np.zeros(n) if theta is None else theta,
        np.zeros(n) if chi is None else chi,
    )


def position(trajectory: Trajectory, time_s: float) -> dict[str, float]:
    i = int(
        np.clip(
            np.searchsorted(trajectory.time_s, time_s, side="right") - 1,
            0,
            len(trajectory.time_s) - 2,
        )
    )
    duration = trajectory.time_s[i + 1] - trajectory.time_s[i]
    f = float(np.clip((time_s - trajectory.time_s[i]) / duration, 0, 1))
    xyz = slerp(trajectory.xyz[i], trajectory.xyz[i + 1], np.asarray(f))
    lon, lat = xyz_to_lonlat(xyz)
    next_lon, next_lat = xyz_to_lonlat(trajectory.xyz[i + 1])
    dlon = np.deg2rad(next_lon - lon)
    p1, p2 = np.deg2rad(lat), np.deg2rad(next_lat)
    heading = (
        np.rad2deg(
            np.arctan2(
                np.sin(dlon) * np.cos(p2),
                np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dlon),
            )
        )
        % 360
    )
    return {
        "lon": float(lon),
        "lat": float(lat),
        "altitude_m": float((1 - f) * trajectory.altitude_m[i] + f * trajectory.altitude_m[i + 1]),
        "heading_deg": float(heading),
        "ground_speed_ms": float(
            EARTH_RADIUS_M * angle(trajectory.xyz[i], trajectory.xyz[i + 1]) / duration
        ),
    }
