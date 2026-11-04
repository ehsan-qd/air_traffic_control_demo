"""Arc distances using plane intersections and endpoint projections, never arccos."""

import numpy as np

from nat_demo.geo.sphere import Array, angle, unit
from nat_demo.units import EARTH_RADIUS_M


def on_arc(a: Array, b: Array, point: Array) -> Array:
    return np.asarray(angle(a, point) + angle(point, b) - angle(a, b) < 1e-9, dtype=np.float64)


def point_arc(point: Array, a: Array, b: Array) -> Array:
    cross = np.cross(a, b)
    nondegenerate = np.linalg.norm(cross, axis=-1) > 1e-15
    normal = unit(cross)
    projection = point - np.sum(point * normal, axis=-1)[..., None] * normal
    has_projection = np.linalg.norm(projection, axis=-1) > 1e-15
    q = unit(projection)
    closest = np.minimum(angle(point, a), angle(point, b))
    for candidate in (q, -q):
        closest = np.where(
            nondegenerate & has_projection & on_arc(a, b, candidate).astype(bool),
            np.minimum(closest, angle(point, candidate)),
            closest,
        )
    return np.asarray(closest)


def arc_distance(a: Array, b: Array, c: Array, d: Array) -> Array:
    na, nb = unit(np.cross(a, b)), unit(np.cross(c, d))
    cross = np.cross(na, nb)
    p = unit(cross)
    crossing = np.zeros(np.broadcast_shapes(a.shape[:-1], c.shape[:-1]), dtype=bool)
    for candidate in (p, -p):
        crossing |= (
            (np.linalg.norm(cross, axis=-1) > 1e-12)
            & on_arc(a, b, candidate).astype(bool)
            & on_arc(c, d, candidate).astype(bool)
        )
    closest = np.minimum.reduce(
        np.broadcast_arrays(
            point_arc(a, c, d), point_arc(b, c, d), point_arc(c, a, b), point_arc(d, a, b)
        )
    )
    return np.where(crossing, 0.0, closest) * EARTH_RADIUS_M


def arc_distance_matrix(u0: Array, u1: Array, v0: Array, v1: Array) -> Array:
    return arc_distance(u0[:, None, :], u1[:, None, :], v0[None, :, :], v1[None, :, :])
