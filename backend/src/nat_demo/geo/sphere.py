import numpy as np
from numpy.typing import ArrayLike, NDArray

from nat_demo.units import EARTH_RADIUS_M

Array = NDArray[np.float64]


def unit(vector: ArrayLike) -> Array:
    value = np.asarray(vector, dtype=np.float64)
    return np.asarray(
        value / np.maximum(np.linalg.norm(value, axis=-1, keepdims=True), 1e-15), dtype=np.float64
    )


def lonlat_to_xyz(lonlat_deg: Array) -> Array:
    lon, lat = np.moveaxis(np.deg2rad(lonlat_deg), -1, 0)
    return np.stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)), axis=-1)


def xyz_to_lonlat(xyz: Array) -> Array:
    return np.asarray(
        np.rad2deg(
            np.stack(
                (
                    np.arctan2(xyz[..., 1], xyz[..., 0]),
                    np.arctan2(xyz[..., 2], np.hypot(xyz[..., 0], xyz[..., 1])),
                ),
                axis=-1,
            )
        ),
        dtype=np.float64,
    )


def angle(a: Array, b: Array) -> Array:
    return np.asarray(np.arctan2(np.linalg.norm(np.cross(a, b), axis=-1), np.sum(a * b, axis=-1)))


def distance(a: Array, b: Array) -> Array:
    return angle(a, b) * EARTH_RADIUS_M


def slerp(a: Array, b: Array, fraction: Array) -> Array:
    delta = angle(a, b)
    sine = np.sin(delta)
    safe_sine = np.where(np.abs(sine) < 1e-12, 1.0, sine)
    f = np.asarray(fraction)
    result = (np.sin((1 - f) * delta) / safe_sine)[..., None] * a + (np.sin(f * delta) / safe_sine)[
        ..., None
    ] * b
    linear = (1 - f)[..., None] * a + f[..., None] * b
    return unit(np.where((np.abs(sine) < 1e-12)[..., None], linear, result))


def resample(route_deg: Array, count: int) -> Array:
    xyz = lonlat_to_xyz(route_deg)
    cumulative = np.concatenate(([0.0], np.cumsum(angle(xyz[:-1], xyz[1:]))))
    targets = np.linspace(0, cumulative[-1], count)
    indices = np.clip(np.searchsorted(cumulative, targets, side="right") - 1, 0, len(xyz) - 2)
    fraction = (targets - cumulative[indices]) / np.maximum(
        cumulative[indices + 1] - cumulative[indices], 1e-15
    )
    return xyz_to_lonlat(slerp(xyz[indices], xyz[indices + 1], fraction))
