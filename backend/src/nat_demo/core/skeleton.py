from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from nat_demo.geo.sphere import Array, lonlat_to_xyz, unit
from nat_demo.units import EARTH_RADIUS_M, NM_M


@dataclass(frozen=True)
class Skeleton:
    xyz: Array
    level_fl: Array
    theta: NDArray[np.int64]
    chi: NDArray[np.int64]
    nominal_node: int


def build_skeleton(
    route: Array, filed_level: int, legal_levels: list[int], K: int, J: int, spacing_nm: float
) -> Skeleton:
    nominal = lonlat_to_xyz(route)
    theta = np.tile(np.arange(-K, K + 1), 2 * J + 1)
    chi = np.repeat(np.arange(-J, J + 1), 2 * K + 1)
    normals = np.zeros_like(nominal)
    arriving = unit(
        nominal[1:-1] * np.sum(nominal[:-2] * nominal[1:-1], axis=-1)[:, None] - nominal[:-2]
    )
    departing = unit(
        nominal[2:] - nominal[1:-1] * np.sum(nominal[2:] * nominal[1:-1], axis=-1)[:, None]
    )
    normals[1:-1] = unit(np.cross(unit(arriving + departing), nominal[1:-1]))
    radians = theta * spacing_nm * NM_M / EARTH_RADIUS_M
    xyz = (
        np.cos(radians)[None, :, None] * nominal[:, None, :]
        + np.sin(radians)[None, :, None] * normals[:, None, :]
    )
    xyz[0] = nominal[0]
    xyz[-1] = nominal[-1]
    indices = legal_levels.index(filed_level) + chi
    levels = np.array([legal_levels[i] if 0 <= i < len(legal_levels) else np.nan for i in indices])
    level_fl = np.tile(levels, (len(route), 1))
    level_fl[0] = filed_level
    level_fl[-1] = filed_level
    return Skeleton(unit(xyz), level_fl, theta, chi, int(np.where((theta == 0) & (chi == 0))[0][0]))
