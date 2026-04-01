"""
Shock propagation models for four macroeconomic stress categories.

Each shock type defines:
  compute_shock_drift(t)          -> daily drift reduction (non-negative; subtract from expected return)
  compute_shock_vol_multiplier(t) -> multiplicative vol factor (>= 1.0)

Both functions are deterministic given shock parameters. They are
pre-computed across all time steps once per simulation run.
"""

from __future__ import annotations

import numpy as np
from enum import Enum


class ShockType(str, Enum):
    INTEREST_RATE = "interest_rate"
    LIQUIDITY = "liquidity"
    VOLATILITY = "volatility"
    CONTAGION = "contagion"


# ---------------------------------------------------------------------------
# Drift reduction (subtract from expected daily return)
# ---------------------------------------------------------------------------

def compute_shock_drift(
    t: int,
    shock_start: int,
    shock_type: ShockType,
    shock_intensity: float,
    recovery_speed: float,
) -> float:
    """
    Daily drift reduction at time step t. Always non-negative.
    The caller subtracts this from the expected market return.
    """
    if t < shock_start:
        return 0.0

    elapsed = float(t - shock_start)
    lam = recovery_speed

    if shock_type == ShockType.INTEREST_RATE:
        # Two-component: immediate revaluation hit + sustained margin squeeze
        immediate = shock_intensity * 0.022 * np.exp(-0.60 * elapsed)
        sustained = shock_intensity * 0.004 * np.exp(-lam * elapsed)
        return float(immediate + sustained)

    elif shock_type == ShockType.LIQUIDITY:
        # Severe dislocation from forced selling; slower mean-reversion
        return float(shock_intensity * 0.028 * np.exp(-lam * 0.45 * elapsed))

    elif shock_type == ShockType.VOLATILITY:
        # Volatility shock drives variance more than drift; small residual bias
        return float(shock_intensity * 0.008 * np.exp(-lam * elapsed))

    elif shock_type == ShockType.CONTAGION:
        # Phase 1 (0..T_spread): losses spread via network -> increasing hit
        # Phase 2 (T_spread+):   systemic recovery -> exponential decay from peak
        T_spread = 25.0
        spread_rate = 0.12
        if elapsed <= T_spread:
            spread_factor = 1.0 - np.exp(-spread_rate * elapsed)
            return float(shock_intensity * 0.035 * spread_factor)
        else:
            peak = shock_intensity * 0.035 * (1.0 - np.exp(-spread_rate * T_spread))
            return float(peak * np.exp(-lam * (elapsed - T_spread)))

    return 0.0


# ---------------------------------------------------------------------------
# Volatility multiplier (>= 1.0)
# ---------------------------------------------------------------------------

def compute_shock_vol_multiplier(
    t: int,
    shock_start: int,
    shock_type: ShockType,
    shock_intensity: float,
    recovery_speed: float,
) -> float:
    """
    Multiplicative factor applied to daily return volatility at step t.
    Always >= 1.0. Shocks can only increase realised vol.
    """
    if t < shock_start:
        return 1.0

    elapsed = float(t - shock_start)
    lam = recovery_speed

    if shock_type == ShockType.INTEREST_RATE:
        extra = shock_intensity * 1.8 * np.exp(-lam * elapsed)
        return float(1.0 + extra)

    elif shock_type == ShockType.LIQUIDITY:
        # Larger spike; slower decay than interest-rate shock
        extra = shock_intensity * 3.5 * np.exp(-lam * 0.35 * elapsed)
        return float(1.0 + extra)

    elif shock_type == ShockType.VOLATILITY:
        # Direct vol shock -- very high multiplier; moderate decay rate
        extra = shock_intensity * 6.0 * np.exp(-lam * 0.55 * elapsed)
        return float(1.0 + extra)

    elif shock_type == ShockType.CONTAGION:
        # Vol follows the two-phase network contagion shape
        T_spread = 25.0
        spread_rate = 0.10
        if elapsed <= T_spread:
            spread_factor = elapsed / T_spread
            extra = shock_intensity * 2.8 * spread_factor
        else:
            peak_extra = shock_intensity * 2.8
            extra = peak_extra * np.exp(-lam * (elapsed - T_spread))
        return float(1.0 + extra)

    return 1.0


# ---------------------------------------------------------------------------
# Correlation matrix
# ---------------------------------------------------------------------------

def build_correlation_matrix(
    n_agents: int,
    base_correlation: float,
    shock_type: ShockType,
    shock_active: bool,
    contagion_strength: float,
) -> np.ndarray:
    """
    Return an n_agents x n_agents equicorrelation matrix.

    During shock, off-diagonal correlations increase (empirically documented
    'correlation spike' under stress). For contagion shocks, the increase
    equals the full contagion_strength gap; for others, 30% of the gap.
    A Cholesky-safe PD correction is applied via eigenvalue clipping.
    """
    if shock_active and shock_type == ShockType.CONTAGION:
        target = base_correlation + contagion_strength * (1.0 - base_correlation)
    elif shock_active:
        target = base_correlation + 0.30 * contagion_strength * (1.0 - base_correlation)
    else:
        target = base_correlation

    # Equicorrelation matrix
    C = np.full((n_agents, n_agents), target, dtype=np.float64)
    np.fill_diagonal(C, 1.0)

    # Enforce positive-definiteness via eigenvalue floor
    eigenvalues, eigenvectors = np.linalg.eigh(C)
    eigenvalues = np.maximum(eigenvalues, 1e-8)
    C = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T

    # Re-normalise to unit diagonal (correlation, not covariance)
    d = np.sqrt(np.diag(C))
    C = C / np.outer(d, d)
    np.fill_diagonal(C, 1.0)

    return C
