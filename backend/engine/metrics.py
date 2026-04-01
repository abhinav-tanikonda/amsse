"""
Portfolio performance and risk metric computation.

All functions operate on arrays of portfolio value paths:
  paths: np.ndarray of shape (n_runs, n_steps), initial value = 1.0

Metrics returned are numerically stable and JSON-serializable (Python floats).
"""

from __future__ import annotations

import numpy as np


# ---------------------------------------------------------------------------
# Individual metric functions
# ---------------------------------------------------------------------------

def max_drawdown(values: np.ndarray) -> float:
    """
    Maximum peak-to-trough percentage drawdown on a 1-D value path.
    Returns a non-positive number; 0.0 if no drawdown occurred.
    """
    if len(values) < 2:
        return 0.0
    running_max = np.maximum.accumulate(values)
    drawdowns = (values - running_max) / np.maximum(running_max, 1e-10)
    return float(np.min(drawdowns))


def recovery_time(values: np.ndarray, shock_start: int) -> int:
    """
    Steps from shock_start until the portfolio recovers to its pre-shock level.

    Algorithm:
      1. Record the portfolio value at shock_start (pre-shock level).
      2. Exclude the shock onset step and search the subsequent path.
      3. Locate the post-shock trough (minimum value).
      4. If the trough is not below the pre-shock level, no real drawdown
         occurred -- return 0.
      5. Search for the first step after the trough where the value
         returns to >= pre-shock level.
      6. If not recovered within the simulation, return remaining steps.

    Returns an integer step count. 0 = no drawdown or immediate recovery.
    """
    if shock_start >= len(values) - 1:
        return 0

    pre_shock_level = float(values[shock_start])

    # Exclude shock onset step (values[shock_start] == pre_shock_level by definition)
    post_shock = values[shock_start + 1:]
    if len(post_shock) == 0:
        return 0

    # Locate the trough
    trough_idx = int(np.argmin(post_shock))
    trough_val = float(post_shock[trough_idx])

    # Guard: if no real drawdown, return 0 immediately
    if trough_val >= pre_shock_level - 1e-7:
        return 0

    # Search for recovery after the trough
    after_trough = post_shock[trough_idx:]
    recovered_indices = np.where(after_trough >= pre_shock_level - 1e-7)[0]

    if len(recovered_indices) == 0:
        # Never recovered; return remaining horizon length
        return int(len(post_shock))

    # Steps from shock_start+1 to recovery
    return int(trough_idx + int(recovered_indices[0]) + 1)


def sharpe_ratio(
    daily_returns: np.ndarray,
    risk_free_annual: float = 0.025,
) -> float:
    """
    Annualised Sharpe ratio.
    Assumes 252 trading days per year. risk_free_annual defaults to 2.5% p.a.
    """
    rf_daily = risk_free_annual / 252.0
    excess = daily_returns - rf_daily
    std = float(np.std(excess))
    if std < 1e-10:
        return 0.0
    return float(np.clip(np.mean(excess) / std * np.sqrt(252.0), -10.0, 20.0))


def sortino_ratio(
    daily_returns: np.ndarray,
    risk_free_annual: float = 0.025,
) -> float:
    """
    Sortino ratio using downside semi-deviation below the risk-free rate.
    Appropriate when return distributions are skewed (common post-shock).

    Clipped to [-10, 15] to avoid pathological values from near-zero
    downside deviation in strongly trending scenarios.
    """
    rf_daily = risk_free_annual / 252.0
    excess = daily_returns - rf_daily
    downside = excess[excess < 0.0]

    if len(downside) == 0:
        # All returns exceed risk-free -- cap at a large positive value
        return float(np.clip(np.mean(excess) * np.sqrt(252.0) * 20.0, 0.0, 15.0))

    downside_std = float(np.std(downside))
    if downside_std < 1e-10:
        return 0.0
    return float(np.clip(
        np.mean(excess) / downside_std * np.sqrt(252.0),
        -10.0,
        15.0,
    ))


def resilience_score(
    dd: float,
    rec_time: int,
    n_steps: int,
    shock_start: int,
    sharpe: float,
) -> float:
    """
    Composite resilience score in [0, 1].

    Components and weights:
      - Drawdown preservation (40%): 1 + max_drawdown  (dd <= 0, so this is in [0,1])
      - Recovery speed (35%):  1 - recovery_time / max_possible_steps
      - Risk-adjusted return (25%): normalised Sharpe, mapped from [-2, 4] -> [0, 1]

    Higher score = more resilient behaviour under the shock scenario.
    """
    max_possible = float(max(n_steps - shock_start - 1, 1))

    dd_component = float(np.clip(1.0 + dd, 0.0, 1.0))
    rec_component = float(np.clip(1.0 - rec_time / max_possible, 0.0, 1.0))
    sharpe_component = float(np.clip((sharpe + 2.0) / 6.0, 0.0, 1.0))

    score = 0.40 * dd_component + 0.35 * rec_component + 0.25 * sharpe_component
    return float(np.clip(score, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Aggregate metrics over Monte Carlo ensemble
# ---------------------------------------------------------------------------

def compute_metrics(paths: np.ndarray, shock_start: int) -> dict[str, float | int]:
    """
    Compute all performance and risk metrics from a Monte Carlo ensemble.

    Parameters
    ----------
    paths : np.ndarray, shape (n_runs, n_steps)
        Portfolio value paths. Initial value = 1.0 for all runs.
    shock_start : int
        Time step at which the shock was injected.

    Returns
    -------
    dict with keys matching MetricsResult schema.
    All values are Python float or int (JSON-serialisable).
    """
    n_runs, n_steps = paths.shape

    # Cross-sectional aggregation
    mean_path = np.mean(paths, axis=0)              # (n_steps,)
    terminal_values = paths[:, -1]                  # (n_runs,)

    # Daily returns on the mean path for Sharpe / Sortino
    mean_safe = np.maximum(mean_path, 1e-10)
    mean_daily_returns = np.diff(mean_safe) / mean_safe[:-1]  # (n_steps-1,)

    # Full ensemble daily returns for realised volatility
    paths_safe = np.maximum(paths, 1e-10)
    all_daily_returns = np.diff(paths_safe, axis=1) / paths_safe[:, :-1]  # (n_runs, n_steps-1)

    # Compute metrics
    avg_return_val = float(np.mean(terminal_values - 1.0))
    terminal_value_val = float(np.mean(terminal_values))
    vol_val = float(np.clip(
        np.std(all_daily_returns.ravel()) * np.sqrt(252.0),
        0.0, 5.0,
    ))
    dd_val = max_drawdown(mean_path)
    rec_val = recovery_time(mean_path, shock_start)
    sharpe_val = sharpe_ratio(mean_daily_returns)
    sortino_val = sortino_ratio(mean_daily_returns)
    res_val = resilience_score(dd_val, rec_val, n_steps, shock_start, sharpe_val)

    return {
        "avg_return":       round(avg_return_val, 8),
        "terminal_value":   round(terminal_value_val, 8),
        "volatility":       round(vol_val, 8),
        "max_drawdown":     round(float(np.clip(dd_val, -1.0, 0.0)), 8),
        "recovery_time":    int(rec_val),
        "resilience_score": round(res_val, 8),
        "sharpe_ratio":     round(float(np.clip(sharpe_val, -10.0, 20.0)), 8),
        "sortino_ratio":    round(float(np.clip(sortino_val, -10.0, 15.0)), 8),
    }
