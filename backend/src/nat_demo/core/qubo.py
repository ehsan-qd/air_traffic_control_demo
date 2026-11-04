from dataclasses import dataclass

import numpy as np
from scipy.sparse import csr_matrix

from nat_demo.geo.sphere import Array


@dataclass(frozen=True)
class Qubo:
    matrix: Array
    sparse: csr_matrix
    offset: float
    scale: float
    penalty: float
    costs: Array
    feasible: list[bool]
    terms: dict[str, float | int | str]

    def energy(self, bits: Array) -> float:
        return float(bits @ self.matrix @ bits + self.offset)


def assemble_candidate_qubo(costs: Array, feasible: list[bool], margin: float) -> Qubo:
    """E = cost.x + A(sum(x)-1)^2 + 2A sum(infeasible_i*x_i).

    Symmetric convention: off-diagonal entries A produce the 2A pair term.
    A exceeds every candidate's complexity, so if any candidate is feasible a
    global minimizer is exactly one feasible path. Search coverage is bounded.
    """
    if costs.ndim != 1 or not len(costs) or len(feasible) != len(costs):
        raise ValueError("QUBO requires matching nonempty cost and feasibility vectors")
    if not np.all(np.isfinite(costs)) or np.any(costs < 0):
        raise ValueError("candidate complexity must be finite and nonnegative")
    if not np.isfinite(margin) or margin <= 1:
        raise ValueError("penalty margin must exceed one")
    n = len(costs)
    penalty = margin * (float(np.max(costs, initial=0)) + 1)
    matrix = np.full((n, n), penalty, dtype=np.float64)
    np.fill_diagonal(
        matrix, costs - penalty + 2 * penalty * (1 - np.asarray(feasible, dtype=np.float64))
    )
    scale = float(np.max(np.abs(matrix), initial=1))
    matrix /= scale
    return Qubo(
        matrix,
        csr_matrix(matrix),
        penalty / scale,
        scale,
        penalty,
        costs,
        feasible,
        {
            "objective_max": float(np.max(costs, initial=0)),
            "one_hot_penalty": penalty,
            "rejection_penalty": 2 * penalty,
            "rejected_paths": feasible.count(False),
            "candidate_count": n,
            "encoding": "candidate_path",
        },
    )
