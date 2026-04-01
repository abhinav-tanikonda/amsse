"""
Strategy exposure (beta) models for the four competing portfolio strategies.

Each strategy controls market exposure (beta) over time. Portfolio return at step t:

    r(t) = beta(t) * rho * r_market(t)
           + (1 - beta(t)) * r_safe
           + epsilon_idio(t)

where rho is market_sensitivity, r_safe is the daily risk-free return, and
epsilon_idio is the mean cross-sectional idiosyncratic noise.

Static strategies (Conservative, Balanced, Aggressive) compute beta(t) as
deterministic functions of time, shock parameters, and realised volatility.

Adaptive strategy selects beta from five discrete arms via a UCB1 multi-armed
bandit with per-arm EWMA reward estimation.
"""

from __future__ import annotations

import numpy as np
from typing import Optional


# ---------------------------------------------------------------------------
# Static strategy beta functions
# ---------------------------------------------------------------------------

def conservative_beta(
    t: int,
    shock_start: int,
    shock_intensity: float,
    recovery_speed: float,
    current_ann_vol: float,
    baseline_vol: float,
) -> float:
    """
    Conservative Hedging -- sharply de-risks when shock arrives, then
    rebuilds exposure as conditions normalise.

    Mechanism:
      - Pre-shock:  beta ~= 0.85 (defensive but invested)
      - Shock onset: immediate cut proportional to shock_intensity
      - Post-shock:  beta recovers toward 0.85 at rate 1.5 * recovery_speed
      - Vol-penalty: further reduces beta if realised vol exceeds baseline
                     (vol-targeting / risk-parity logic)

    Hedge benefit is implicit in low beta: conservative absorbs a smaller
    fraction of the shock's negative market return.
    """
    PRE_SHOCK_BETA = 0.85
    FLOOR_BETA = 0.13

    if t < shock_start:
        return PRE_SHOCK_BETA

    elapsed = float(t - shock_start)
    shock_cut = shock_intensity * (PRE_SHOCK_BETA - FLOOR_BETA)
    target_after_cut = PRE_SHOCK_BETA - shock_cut

    # Exponential recovery ramp
    recovery_ramp = 1.0 - np.exp(-recovery_speed * 1.5 * elapsed)
    recovering_beta = target_after_cut + (PRE_SHOCK_BETA - target_after_cut) * recovery_ramp

    # Volatility-scaling penalty
    vol_ratio = current_ann_vol / max(baseline_vol, 1e-8)
    vol_penalty = max(0.0, 1.0 - 0.35 * (vol_ratio - 1.0))
    adjusted = recovering_beta * vol_penalty

    return float(np.clip(adjusted, FLOOR_BETA, PRE_SHOCK_BETA))


def balanced_beta(
    t: int,
    shock_start: int,
    shock_intensity: float,
    recovery_speed: float,
) -> float:
    """
    Balanced Reallocation -- moderate, stable exposure with a modest
    shock response and mechanical mean-reversion.

    Mimics a 60/40-style portfolio that rebalances to target weights:
      - Pre-shock:  beta ~= 0.90
      - Post-shock: modest reduction proportional to shock_intensity
      - Recovery:   exponential return to 0.90
    """
    PRE_SHOCK_BETA = 0.90
    MIN_BETA = 0.50

    if t < shock_start:
        return PRE_SHOCK_BETA

    elapsed = float(t - shock_start)
    reduction = shock_intensity * 0.38 * np.exp(-recovery_speed * elapsed)
    return float(np.clip(PRE_SHOCK_BETA - reduction, MIN_BETA, PRE_SHOCK_BETA))


def aggressive_beta(
    t: int,
    shock_start: int,
    shock_intensity: float,
    recovery_speed: float,
) -> float:
    """
    Aggressive Risk-Seeking -- holds initial position through shock onset,
    then increases exposure ('buying the dip') after a short lag.

    Mimics a distressed-asset buyer or contrarian momentum strategy:
      - Pre-shock:       beta ~= 1.10 (modest leverage)
      - Shock + 0-9 d:   beta held at 1.10 (absorbs initial drop)
      - Shock + 10+ d:   beta ramps toward 1.55 as recovery opportunity grows
      - Maximum beta ~= 1.55 controlled by shock_intensity
    """
    PRE_SHOCK_BETA = 1.10
    DIP_BUY_LAG = 10
    MAX_BETA = 1.55

    if t < shock_start:
        return PRE_SHOCK_BETA

    elapsed = float(t - shock_start)
    if elapsed < DIP_BUY_LAG:
        return PRE_SHOCK_BETA

    extra = shock_intensity * 0.45 * (
        1.0 - np.exp(-recovery_speed * (elapsed - DIP_BUY_LAG))
    )
    return float(np.clip(PRE_SHOCK_BETA + extra, PRE_SHOCK_BETA, MAX_BETA))


# ---------------------------------------------------------------------------
# UCB1 multi-armed bandit
# ---------------------------------------------------------------------------

class UCB1Bandit:
    """
    Upper Confidence Bound 1 (UCB1) multi-armed bandit.

    Each arm k has:
      - Q[k]: incremental mean estimate of observed rewards
      - N[k]: pull count

    Selection rule: argmax_k { Q[k] + C * sqrt(ln(t) / N[k]) }

    Arm with N[k]=0 is selected first (force-initialisation phase).
    C is the exploration constant: higher -> more exploration.
    """

    def __init__(self, arms: np.ndarray, c: float = 1.0) -> None:
        self.arms = arms.copy()
        self.K = len(arms)
        self.Q = np.zeros(self.K, dtype=np.float64)
        self.N = np.zeros(self.K, dtype=np.int64)
        self.t: int = 0
        self.c: float = c

    def select_arm(self) -> int:
        self.t += 1
        unpulled = np.where(self.N == 0)[0]
        if len(unpulled) > 0:
            return int(unpulled[0])
        log_t = np.log(float(self.t))
        ucb_scores = self.Q + self.c * np.sqrt(log_t / self.N.astype(np.float64))
        return int(np.argmax(ucb_scores))

    def update(self, arm_idx: int, reward: float) -> None:
        """Incremental (Welford) mean update for arm_idx."""
        self.N[arm_idx] += 1
        self.Q[arm_idx] += (reward - self.Q[arm_idx]) / float(self.N[arm_idx])


# ---------------------------------------------------------------------------
# Adaptive Strategy -- UCB1 over discrete beta arms with per-arm EWMA rewards
# ---------------------------------------------------------------------------

class AdaptiveStrategy:
    """
    Adaptive portfolio strategy using UCB1 bandit with per-arm EWMA reward
    estimation.

    Arms -- discrete market exposure levels:
        [0.15, 0.42, 0.70, 0.98, 1.30]

    Reward signal -- per-arm exponentially weighted Sharpe-like ratio:
        reward(arm_k) = ewma_return[k] / ewma_vol[k] * REWARD_SCALE

    Each arm independently tracks its own EWMA of return and squared return.
    This gives the bandit genuine signal about which exposure level produces
    superior risk-adjusted performance in the current regime.

    Regime-adaptive behaviour:
      - Pre-shock, high-beta arms earn good risk-adjusted rewards ->
        bandit converges toward arm 3 or 4 (beta ~= 0.98 to 1.30)
      - Post-shock onset, high-beta arms earn poor rewards (large negative
        returns, elevated vol) -> bandit re-explores and shifts toward
        low-beta arms (beta ~= 0.15 to 0.42)
      - Recovery phase: reward improves again for moderate-to-high beta ->
        bandit gradually shifts back up

    The exploration constant C (adaptive_aggressiveness) controls how
    quickly the bandit abandons a previously good arm after regime change.
    Higher C -> faster re-exploration -> better adaptation, but noisier pre-shock.

    EWMA_ALPHA = 0.15 gives an effective half-life of ~4.3 steps, making
    the reward signal responsive to market regime changes within ~10-15 days.
    """

    ARM_BETAS = np.array([0.15, 0.42, 0.70, 0.98, 1.30], dtype=np.float64)
    EWMA_ALPHA: float = 0.15       # half-life ~= 4.3 steps
    REWARD_SCALE: float = 100.0    # scale Sharpe-like ratio to UCB-compatible range

    def __init__(self, c: float = 1.0) -> None:
        K = len(self.ARM_BETAS)
        self.bandit = UCB1Bandit(arms=self.ARM_BETAS, c=c)
        self.current_arm: int = 0

        # Per-arm EWMA state (independent tracking)
        self._ewma_ret = np.zeros(K, dtype=np.float64)
        self._ewma_sq = np.full(K, 1e-6, dtype=np.float64)
        self.step_count: int = 0

    @property
    def current_beta(self) -> float:
        return float(self.ARM_BETAS[self.current_arm])

    def observe_and_select(self, last_return: Optional[float]) -> float:
        """
        1. Update the current arm's EWMA with last_return (if available).
        2. Compute the arm's risk-adjusted reward and call bandit.update().
        3. Select the next arm via UCB1.
        4. Return the chosen beta value.
        """
        if last_return is not None and self.step_count > 0:
            k = self.current_arm
            alpha = self.EWMA_ALPHA
            r = last_return

            # Incremental EWMA update (per arm)
            self._ewma_ret[k] = alpha * r + (1.0 - alpha) * self._ewma_ret[k]
            self._ewma_sq[k] = alpha * r * r + (1.0 - alpha) * self._ewma_sq[k]

            # Variance: E[X^2] - (E[X])^2; clip to avoid sqrt of negatives
            ewma_var = max(
                float(self._ewma_sq[k]) - float(self._ewma_ret[k]) ** 2,
                1e-10,
            )
            ewma_vol = np.sqrt(ewma_var)

            # Risk-adjusted reward: EWMA Sharpe analogue
            reward = float(self._ewma_ret[k] / ewma_vol) * self.REWARD_SCALE
            self.bandit.update(k, reward)

        # Select next arm
        self.current_arm = self.bandit.select_arm()
        self.step_count += 1
        return float(self.ARM_BETAS[self.current_arm])
