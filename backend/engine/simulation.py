"""
Core Monte Carlo simulation engine -- vectorized over all runs.

Architecture
------------
All stochastic inputs (market factor, idiosyncratic noise) are generated
once and shared across all four strategies. This ensures a fair comparison:
every strategy faces exactly the same market realisation in each run;
differences in outcomes arise purely from different beta(t) responses.

Static strategies (Conservative, Balanced, Aggressive) are computed as
batched NumPy operations (n_runs x n_steps) with no Python loop over runs.

The Adaptive Strategy requires a step-by-step UCB1 bandit update and is
computed with a Python loop over runs only, reusing the pre-generated
r_mkt and mean_idio arrays.

Portfolio return at each step (per strategy s):
    r_s[run, t] = beta_s[t] * rho * r_mkt[run, t]
                + (1 - beta_s[t]) * r_f
                + idio[run, t]

Portfolio value:
    V_s[run, t] = V_s[run, t-1] * max(1 + r_s[run, t], MIN_GROSS)
    V_s[run, 0] = 1.0
"""

from __future__ import annotations

import numpy as np
from typing import Any

from engine.shocks import (
    ShockType,
    compute_shock_drift,
    compute_shock_vol_multiplier,
    build_correlation_matrix,
)
from engine.strategies import (
    conservative_beta,
    balanced_beta,
    aggressive_beta,
    AdaptiveStrategy,
)
from engine.metrics import compute_metrics


# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

STRATEGY_NAMES: list[str] = [
    "Conservative Hedging",
    "Balanced Reallocation",
    "Aggressive Risk-Seeking",
    "Adaptive Strategy",
]

ANNUAL_DRIFT: float = 0.075          # 7.5% annualised baseline drift
RISK_FREE_ANNUAL: float = 0.025      # 2.5% annualised risk-free rate
BASE_CORRELATION: float = 0.40       # Baseline inter-agent equicorrelation
MIN_GROSS_RETURN: float = 0.001      # Floor: minimum gross return per step (0.1%)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _safe_cholesky(C: np.ndarray, n: int) -> np.ndarray:
    """Attempt Cholesky decomposition; fall back to identity on failure."""
    try:
        return np.linalg.cholesky(C)
    except np.linalg.LinAlgError:
        return np.eye(n, dtype=np.float64)


def _generate_idio_noise(
    rng: np.random.Generator,
    n_runs: int,
    n_steps: int,
    n_agents: int,
    shock_start: int,
    L_pre: np.ndarray,
    L_post: np.ndarray,
    idio_vol_daily: float,
) -> np.ndarray:
    """
    Generate mean cross-sectional idiosyncratic noise: (n_runs, n_steps).

    For each time step t, draw z ~ N(0, I_{n_agents}),
    apply Cholesky correlation (L_pre pre-shock, L_post post-shock), and
    average across agents to produce a single scalar noise term per (run, t).

    Implemented via batched 3D matmul for speed:
        corr_noise[t, run, :] = z[t, run, :] @ L.T
    """
    mean_idio = np.zeros((n_runs, n_steps), dtype=np.float64)

    # Pre-shock period: steps 1 .. shock_start-1
    n_pre = max(shock_start - 1, 0)
    if n_pre > 0:
        z_pre = rng.standard_normal((n_pre, n_runs, n_agents))
        cn_pre = z_pre @ L_pre.T                              # (n_pre, n_runs, n_agents)
        mean_idio[:, 1:shock_start] = (
            np.mean(cn_pre * idio_vol_daily, axis=2).T        # (n_runs, n_pre)
        )

    # Post-shock period: steps shock_start .. n_steps-1
    n_post = n_steps - shock_start
    if n_post > 0:
        z_post = rng.standard_normal((n_post, n_runs, n_agents))
        cn_post = z_post @ L_post.T                           # (n_post, n_runs, n_agents)
        mean_idio[:, shock_start:] = (
            np.mean(cn_post * idio_vol_daily, axis=2).T       # (n_runs, n_post)
        )

    return mean_idio


def _compute_static_paths(
    beta_arr: np.ndarray,
    market_sensitivity: float,
    daily_rf: float,
    r_mkt: np.ndarray,
    mean_idio: np.ndarray,
    momentum_bonus: np.ndarray | None = None,
) -> np.ndarray:
    """
    Compute portfolio value paths for a static strategy.

    Parameters
    ----------
    beta_arr           : (n_steps,) deterministic exposure array
    market_sensitivity : scalar rho
    daily_rf           : scalar daily risk-free return
    r_mkt              : (n_runs, n_steps) market factor returns
    mean_idio          : (n_runs, n_steps) cross-sectional idio noise
    momentum_bonus     : (n_runs, n_steps) optional additional return

    Returns
    -------
    paths : (n_runs, n_steps) portfolio value matrix, initial value 1.0
    """
    # Broadcasting: (n_steps,) x scalar x (n_runs, n_steps) -> (n_runs, n_steps)
    r_portfolio = (
        beta_arr * market_sensitivity * r_mkt
        + (1.0 - beta_arr) * daily_rf
        + mean_idio
    )
    if momentum_bonus is not None:
        r_portfolio = r_portfolio + momentum_bonus

    # Gross returns with floor (prevents negative portfolio values)
    gross = np.maximum(1.0 + r_portfolio, MIN_GROSS_RETURN)
    gross[:, 0] = 1.0  # initial value: portfolio starts at 1.0

    return np.cumprod(gross, axis=1)


def _compute_adaptive_paths(
    n_runs: int,
    n_steps: int,
    market_sensitivity: float,
    daily_rf: float,
    adaptive_aggressiveness: float,
    r_mkt: np.ndarray,
    mean_idio: np.ndarray,
) -> np.ndarray:
    """
    Compute adaptive strategy paths via sequential UCB1 bandit updates.

    Each run uses an independent AdaptiveStrategy instance (fresh priors).
    The bandit observes the portfolio return from the previous step and
    selects the exposure arm for the current step.

    Reuses the same r_mkt and mean_idio draws as the static strategies
    to ensure all strategies face the same market environment.

    Returns
    -------
    paths : (n_runs, n_steps) portfolio value matrix
    """
    paths = np.ones((n_runs, n_steps), dtype=np.float64)

    for run in range(n_runs):
        adaptive = AdaptiveStrategy(c=adaptive_aggressiveness)
        V = 1.0
        last_return: float | None = None

        for t in range(1, n_steps):
            beta = adaptive.observe_and_select(last_return)
            r = (
                beta * market_sensitivity * float(r_mkt[run, t])
                + (1.0 - beta) * daily_rf
                + float(mean_idio[run, t])
            )
            new_V = max(V * max(1.0 + r, MIN_GROSS_RETURN), 1e-6)
            last_return = (new_V - V) / max(V, 1e-10)
            V = new_V
            paths[run, t] = V

    return paths


def _to_json_list(arr: np.ndarray) -> list[float]:
    """Convert a 1-D NumPy array to a list of JSON-serialisable Python floats."""
    return [round(float(v), 8) for v in arr]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_monte_carlo(
    n_steps: int,
    n_runs: int,
    n_agents: int,
    baseline_volatility: float,
    shock_intensity: float,
    market_sensitivity: float,
    recovery_speed: float,
    contagion_strength: float,
    adaptive_aggressiveness: float,
    shock_start: int,
    shock_type: ShockType,
) -> dict[str, Any]:
    """
    Execute the full Monte Carlo experiment across all four strategies.

    Returns
    -------
    dict mapping strategy_name ->
        {
            "mean_path":      list[float],  length n_steps
            "percentile_10":  list[float],  length n_steps
            "percentile_90":  list[float],  length n_steps
            "metrics":        dict          (see engine.metrics.compute_metrics)
        }
    """
    # Derived constants
    daily_drift = ANNUAL_DRIFT / 252.0
    daily_rf = RISK_FREE_ANNUAL / 252.0
    idio_vol_daily = baseline_volatility * 0.28 / np.sqrt(252.0)

    # Deterministic shock arrays (n_steps,)
    shock_drift_arr = np.array([
        compute_shock_drift(t, shock_start, shock_type, shock_intensity, recovery_speed)
        for t in range(n_steps)
    ], dtype=np.float64)

    vol_mult_arr = np.array([
        compute_shock_vol_multiplier(t, shock_start, shock_type, shock_intensity, recovery_speed)
        for t in range(n_steps)
    ], dtype=np.float64)

    # Daily market vol and annualised vol arrays
    market_vol_arr = baseline_volatility * vol_mult_arr / np.sqrt(252.0)
    ann_vol_arr = baseline_volatility * vol_mult_arr

    # Static beta arrays (n_steps,)
    beta_conservative = np.array([
        conservative_beta(
            t, shock_start, shock_intensity, recovery_speed,
            float(ann_vol_arr[t]), baseline_volatility,
        )
        for t in range(n_steps)
    ], dtype=np.float64)

    beta_balanced = np.array([
        balanced_beta(t, shock_start, shock_intensity, recovery_speed)
        for t in range(n_steps)
    ], dtype=np.float64)

    beta_aggressive = np.array([
        aggressive_beta(t, shock_start, shock_intensity, recovery_speed)
        for t in range(n_steps)
    ], dtype=np.float64)

    # Correlation matrices and Cholesky factors
    corr_pre = build_correlation_matrix(
        n_agents, BASE_CORRELATION, shock_type,
        shock_active=False, contagion_strength=contagion_strength,
    )
    corr_post = build_correlation_matrix(
        n_agents, BASE_CORRELATION, shock_type,
        shock_active=True, contagion_strength=contagion_strength,
    )
    L_pre = _safe_cholesky(corr_pre, n_agents)
    L_post = _safe_cholesky(corr_post, n_agents)

    # Shared stochastic inputs
    rng = np.random.default_rng()

    # Systemic market factor returns: (n_runs, n_steps)
    eps_sys = rng.standard_normal((n_runs, n_steps))
    r_mkt = (daily_drift - shock_drift_arr) + market_vol_arr * eps_sys  # broadcast (n_steps,)

    # Cross-sectional idiosyncratic noise: (n_runs, n_steps)
    mean_idio = _generate_idio_noise(
        rng, n_runs, n_steps, n_agents, shock_start,
        L_pre, L_post, idio_vol_daily,
    )

    # Static strategy paths (fully vectorized)
    paths_conservative = _compute_static_paths(
        beta_conservative, market_sensitivity, daily_rf, r_mkt, mean_idio,
    )
    paths_balanced = _compute_static_paths(
        beta_balanced, market_sensitivity, daily_rf, r_mkt, mean_idio,
    )

    # Aggressive: add momentum amplification on positive-market days post-shock
    time_eligible = (np.arange(n_steps) > shock_start + 5).astype(np.float64)  # (n_steps,)
    pos_market = np.where(r_mkt > 0, r_mkt, 0.0)                               # (n_runs, n_steps)
    momentum_bonus = 0.04 * market_sensitivity * pos_market * time_eligible     # broadcast

    paths_aggressive = _compute_static_paths(
        beta_aggressive, market_sensitivity, daily_rf, r_mkt, mean_idio,
        momentum_bonus=momentum_bonus,
    )

    # Adaptive strategy (sequential -- bandit needs step-by-step updates)
    paths_adaptive = _compute_adaptive_paths(
        n_runs, n_steps, market_sensitivity, daily_rf,
        adaptive_aggressiveness, r_mkt, mean_idio,
    )

    # Aggregate results
    all_paths: dict[str, np.ndarray] = {
        "Conservative Hedging":    paths_conservative,
        "Balanced Reallocation":   paths_balanced,
        "Aggressive Risk-Seeking": paths_aggressive,
        "Adaptive Strategy":       paths_adaptive,
    }

    results: dict[str, Any] = {}
    for name in STRATEGY_NAMES:
        paths = all_paths[name]   # (n_runs, n_steps)
        results[name] = {
            "mean_path":      _to_json_list(np.mean(paths, axis=0)),
            "percentile_10":  _to_json_list(np.percentile(paths, 10.0, axis=0)),
            "percentile_90":  _to_json_list(np.percentile(paths, 90.0, axis=0)),
            "metrics":        compute_metrics(paths, shock_start),
        }

    return results
