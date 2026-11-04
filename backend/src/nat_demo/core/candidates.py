"""Initial reduced search basis; deliberately not the full edge/slack encoding."""

from dataclasses import dataclass

import numpy as np

from nat_demo.core.skeleton import Skeleton
from nat_demo.geo.sphere import Array


@dataclass(frozen=True)
class CandidatePath:
    nodes: list[int]
    theta: Array
    chi: Array
    lateral_cost: float
    vertical_cost: float


def candidate_paths(
    skeleton: Skeleton, w_theta: float, w_chi: float, p: int
) -> list[CandidatePath]:
    count = len(skeleton.xyz)
    nominal = skeleton.nominal_node
    patterns: set[tuple[int, ...]] = {tuple([nominal] * count)}
    for node in range(len(skeleton.theta)):
        if node == nominal or not np.isfinite(skeleton.level_fl[1, node]):
            continue
        for start in range(1, count - 1):
            for end in range(start + 1, count):
                pattern = [nominal] * count
                pattern[start:end] = [node] * (end - start)
                patterns.add(tuple(pattern))
    result: list[CandidatePath] = []
    for nodes in sorted(patterns, key=lambda path: (path != tuple([nominal] * count), path)):
        theta = np.asarray(skeleton.theta[list(nodes)], dtype=np.float64)
        chi = np.asarray(skeleton.chi[list(nodes)], dtype=np.float64)
        result.append(
            CandidatePath(
                list(nodes),
                theta,
                chi,
                float(w_theta * np.sum(np.abs(np.diff(theta)) ** p)),
                float(w_chi * np.sum(np.abs(np.diff(chi)) ** p)),
            )
        )
    return result
