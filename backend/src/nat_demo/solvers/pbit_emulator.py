import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import numpy as np
from numba import njit

from nat_demo.config import SolverConfig
from nat_demo.core.qubo import Qubo


@njit(nogil=True, cache=True)
def gibbs_chunk(matrix, states, sweeps, beta_start, beta_end, seed):
    """Candidate-QUBO Gibbs updates with constant symmetric off-diagonal coupling."""
    np.random.seed(seed)
    replicas, n = states.shape
    best = states[0].copy()
    best_energy = 1e30
    for sweep in range(sweeps):
        beta = beta_start + (beta_end - beta_start) * sweep / max(1, sweeps - 1)
        for replica in range(replicas):
            # This reduced QUBO has constant off-diagonal coupling. Keep the
            # exact local field using its sufficient statistic, the active count.
            active = np.sum(states[replica])
            for i in np.random.permutation(n):
                field = (
                    matrix[i, i] + 2 * matrix[0, 1] * (active - states[replica, i])
                    if n > 1
                    else matrix[i, i]
                )
                value = max(-700.0, min(700.0, beta * field))
                bit = 1 if np.random.random() < 1.0 / (1.0 + np.exp(value)) else 0
                active += bit - states[replica, i]
                states[replica, i] = bit
            # Use the same sufficient statistic, avoiding a dense matvec.
            coupling = matrix[0, 1] if n > 1 else 0.0
            energy = coupling * active * (active - 1)
            for i in range(n):
                energy += matrix[i, i] * states[replica, i]
            if energy < best_energy:
                best_energy = energy
                best = states[replica].copy()
    return states, best, best_energy


def warmup() -> None:
    # JIT is startup work. Its duration is reported separately from solve time.
    gibbs_chunk(
        np.array([[-0.5, 0.5], [0.5, -0.5]]), np.zeros((2, 2), dtype=np.int64), 1, 0.1, 1.0, 1
    )


@dataclass
class SolveResult:
    selected: int | None
    solve_ms: float
    sweeps: int
    first_feasible_ms: float | None
    best_energy: float
    stop_reason: str


def solve(
    qubo: Qubo,
    config: SolverConfig,
    rng: np.random.Generator,
    on_progress: Callable[[dict[str, Any]], None],
) -> SolveResult:
    if config.backend != "pbit_emulator":
        raise RuntimeError(f"{config.backend} is not connected; choose pbit_emulator")
    n = len(qubo.costs)
    if n < 1 or qubo.matrix.shape != (n, n) or not np.all(np.isfinite(qubo.matrix)):
        raise ValueError("solver requires a finite nonempty candidate QUBO")
    coupling = float(qubo.matrix[0, 1]) if n > 1 else 0.0
    off_diagonal = qubo.matrix.copy()
    np.fill_diagonal(off_diagonal, coupling)
    if not np.all(off_diagonal == coupling):
        raise ValueError("candidate sampler requires constant symmetric off-diagonal coupling")
    states = rng.integers(0, 2, (config.replicas, n), dtype=np.int64)
    started = time.perf_counter()
    counts = states.sum(axis=1)
    initial_energy = states @ np.diag(qubo.matrix) + coupling * counts * (counts - 1) + qubo.offset
    initial_best = int(np.argmin(initial_energy))
    best_energy = float(initial_energy[initial_best])
    selected: int | None = None
    first_feasible: float | None = None
    active = np.flatnonzero(states[initial_best])
    if len(active) == 1 and qubo.feasible[int(active[0])]:
        selected = int(active[0])
        first_feasible = (time.perf_counter() - started) * 1000
    completed = 0
    # Small chunks guarantee progress and a responsive wall-clock deadline.
    chunk_size = min(config.progress_every_sweeps, 200)
    captures = set()
    while completed < config.sweeps:
        elapsed = time.perf_counter() - started
        if elapsed >= config.time_budget_s:
            break
        # The ramp is tied to measured budget consumption if the requested work
        # would exceed the budget. Both beta and completed sweeps are reported.
        steps = min(chunk_size, config.sweeps - completed)
        wall_fraction = elapsed / (config.time_budget_s * 0.85)
        start_fraction = min(1.0, max(completed / max(1, config.sweeps - 1), wall_fraction))
        fraction = min(1.0, max((completed + steps - 1) / max(1, config.sweeps - 1), wall_fraction))
        beta_start = config.beta_start + (config.beta_end - config.beta_start) * start_fraction
        beta = config.beta_start + (config.beta_end - config.beta_start) * fraction
        states, best, energy = gibbs_chunk(
            qubo.matrix, states, steps, beta_start, beta, int(rng.integers(0, 2**31 - 1))
        )
        completed += steps
        elapsed_ms = (time.perf_counter() - started) * 1000
        energy += qubo.offset
        active = np.flatnonzero(best)
        if len(active) == 1 and qubo.feasible[int(active[0])]:
            index = int(active[0])
            if selected is None or qubo.costs[index] < qubo.costs[selected]:
                selected = index
            if first_feasible is None:
                first_feasible = elapsed_ms
        if energy < best_energy:
            best_energy = energy
        capture = next((x for x in config.snapshot_betas if beta >= x and x not in captures), None)
        if capture is not None:
            captures.add(capture)
        if (
            completed % min(config.progress_every_sweeps, 2000) == 0
            or capture is not None
            or completed >= config.sweeps
        ):
            ghosts = [np.flatnonzero(state).tolist() for state in states]
            on_progress(
                {
                    "sweep": completed,
                    "requested_sweeps": config.sweeps,
                    "beta": beta,
                    "energy": best_energy,
                    "elapsed_ms": elapsed_ms,
                    "feasible_index": selected,
                    "active_candidates": ghosts,
                    "capture_beta": capture,
                }
            )
    return SolveResult(
        selected,
        (time.perf_counter() - started) * 1000,
        completed,
        first_feasible,
        best_energy,
        "sweeps" if completed >= config.sweeps else "wall_clock_budget",
    )
