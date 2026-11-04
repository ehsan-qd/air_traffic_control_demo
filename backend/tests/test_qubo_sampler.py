from itertools import product

import numpy as np
import pytest

from nat_demo.config import load_config
from nat_demo.core.qubo import assemble_candidate_qubo
from nat_demo.solvers.pbit_emulator import gibbs_chunk, solve


@pytest.mark.parametrize("feasible", list(product([False, True], repeat=3)))
def test_exhaustive_qubo_energy_and_ground_state(feasible):
    costs = np.array([0.0, 2.0, 7.0])
    qubo = assemble_candidate_qubo(costs, list(feasible), 1.5)
    energies = []
    states = list(product([0.0, 1.0], repeat=3))
    for state in states:
        bits = np.asarray(state)
        expected = (
            costs @ bits
            + qubo.penalty * (bits.sum() - 1) ** 2
            + 2 * qubo.penalty * np.asarray([not x for x in feasible]) @ bits
        )
        energy = qubo.energy(bits)
        assert energy * qubo.scale == pytest.approx(expected)
        assert float(bits @ qubo.sparse @ bits + qubo.offset) == pytest.approx(energy)
        energies.append(energy)
    best = np.asarray(states[int(np.argmin(energies))])
    if any(feasible):
        assert best.sum() == 1
        selected = int(np.argmax(best))
        assert feasible[selected]
        assert costs[selected] == min(c for c, f in zip(costs, feasible, strict=True) if f)
    else:
        assert best.sum() == 0  # Never claim a feasible path when none was certified.


def test_sampler_fixed_work_determinism_and_reported_energy():
    qubo = assemble_candidate_qubo(np.array([0.0, 2.0, 4.0, 6.0]), [False, True, True, False], 1.5)
    states = np.random.default_rng(31).integers(0, 2, (24, 4))
    first = gibbs_chunk(qubo.matrix, states.copy(), 100, 0.1, 32.0, 123)
    second = gibbs_chunk(qubo.matrix, states.copy(), 100, 0.1, 32.0, 123)
    np.testing.assert_array_equal(first[0], second[0])
    np.testing.assert_array_equal(first[1], second[1])
    assert first[2] == second[2]
    assert first[2] + qubo.offset == pytest.approx(qubo.energy(first[1]))
    assert first[2] <= min(float(x @ qubo.matrix @ x) for x in first[0]) + 1e-12


def test_single_bit_gibbs_matches_logistic_probability():
    states, best, energy = gibbs_chunk(
        np.array([[0.7]]), np.zeros((20000, 1), dtype=np.int64), 1, 2.0, 2.0, 88
    )
    assert states.mean() == pytest.approx(1 / (1 + np.exp(1.4)), abs=0.012)
    assert energy == pytest.approx(float(best @ np.array([[0.7]]) @ best))


def test_solver_returns_only_verified_choice_and_measured_progress():
    config = load_config().solver.model_copy(
        update={"sweeps": 40, "progress_every_sweeps": 10, "beta_start": 16.0, "time_budget_s": 5.0}
    )
    qubo = assemble_candidate_qubo(np.array([0.0, 2.0, 5.0]), [False, True, True], 1.5)
    progress = []
    result = solve(qubo, config, np.random.default_rng(42), progress.append)
    assert result.selected == 1
    assert result.sweeps == 40
    assert result.stop_reason == "sweeps"
    assert result.solve_ms > 0
    assert result.first_feasible_ms is not None
    assert progress[-1]["sweep"] == 40
    assert result.best_energy == pytest.approx(qubo.energy(np.array([0.0, 1.0, 0.0])))
    assert all(event["elapsed_ms"] > 0 for event in progress)


@pytest.mark.parametrize(
    "costs,feasible,margin",
    [
        (np.array([]), [], 1.5),
        (np.array([-1.0]), [True], 1.5),
        (np.array([np.nan]), [True], 1.5),
        (np.array([0.0]), [], 1.5),
        (np.array([0.0]), [True], 1.0),
    ],
)
def test_invalid_qubo_input_is_rejected(costs, feasible, margin):
    with pytest.raises(ValueError):
        assemble_candidate_qubo(costs, feasible, margin)


def test_sampler_rejects_nonconstant_couplings():
    from dataclasses import replace

    qubo = assemble_candidate_qubo(np.array([0.0, 2.0, 5.0]), [False, True, True], 1.5)
    matrix = qubo.matrix.copy()
    matrix[0, 2] = matrix[2, 0] = 0
    with pytest.raises(ValueError, match="constant symmetric"):
        solve(
            replace(qubo, matrix=matrix),
            load_config().solver,
            np.random.default_rng(42),
            lambda event: None,
        )


def test_completed_work_reaches_end_beta_and_tiny_budget_has_finite_energy():
    config = load_config().solver.model_copy(
        update={"sweeps": 25, "progress_every_sweeps": 2000, "time_budget_s": 5.0}
    )
    qubo = assemble_candidate_qubo(np.array([0.0, 2.0]), [True, True], 1.5)
    progress = []
    result = solve(qubo, config, np.random.default_rng(42), progress.append)
    assert result.sweeps == 25
    assert progress[-1]["beta"] == config.beta_end
    assert progress[-1]["sweep"] == 25
    tiny = solve(
        qubo,
        config.model_copy(update={"time_budget_s": 1e-12}),
        np.random.default_rng(42),
        lambda event: None,
    )
    assert np.isfinite(tiny.best_energy)
    assert tiny.stop_reason == "wall_clock_budget"
