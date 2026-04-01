from __future__ import annotations

from pydantic import BaseModel, Field, model_validator
from typing import Literal


class SimulationRequest(BaseModel):
    """
    Parameters controlling the Monte Carlo market shock simulation.
    All values have sensible defaults; clients may override any field.
    """

    # Simulation scale
    n_steps: int = Field(
        252, ge=50, le=1000,
        description="Simulation horizon in trading days. 252 ≈ 1 trading year.",
    )
    n_runs: int = Field(
        200, ge=10, le=2000,
        description="Number of Monte Carlo paths per strategy.",
    )
    n_agents: int = Field(
        5, ge=2, le=20,
        description="Number of correlated market participants whose noise is Cholesky-decomposed.",
    )

    # Market parameters
    baseline_volatility: float = Field(
        0.15, ge=0.01, le=0.80,
        description="Annualized baseline return volatility (pre-shock).",
    )
    market_sensitivity: float = Field(
        0.85, ge=0.1, le=2.0,
        description="Portfolio universe sensitivity to the systemic market factor.",
    )

    # Shock parameters
    shock_type: Literal["interest_rate", "liquidity", "volatility", "contagion"] = Field(
        "liquidity",
        description="Category of macroeconomic shock to inject.",
    )
    shock_intensity: float = Field(
        0.4, ge=0.0, le=1.0,
        description="Shock magnitude (0 = no shock, 1 = maximum distress).",
    )
    shock_start: int = Field(
        80, ge=5,
        description="Simulation step at which the shock begins propagating.",
    )

    # Dynamics
    recovery_speed: float = Field(
        0.08, ge=0.005, le=0.5,
        description="Exponential decay rate lambda of shock effects. Higher = faster recovery.",
    )
    contagion_strength: float = Field(
        0.5, ge=0.0, le=1.0,
        description="Inter-agent correlation amplification during shock periods.",
    )

    # Adaptive strategy
    adaptive_aggressiveness: float = Field(
        0.7, ge=0.05, le=3.0,
        description="UCB1 exploration constant C. Higher values favour arm exploration.",
    )

    @model_validator(mode="after")
    def shock_start_valid(self) -> SimulationRequest:
        if self.shock_start >= self.n_steps - 10:
            raise ValueError(
                f"shock_start ({self.shock_start}) must be at least 10 steps "
                f"before n_steps ({self.n_steps})."
            )
        return self


class MetricsResult(BaseModel):
    """Quantitative performance and risk metrics for a single strategy."""
    avg_return: float = Field(description="Mean terminal return across all Monte Carlo runs.")
    terminal_value: float = Field(description="Mean terminal portfolio value (initial = 1.0).")
    volatility: float = Field(description="Annualized realized volatility of daily returns.")
    max_drawdown: float = Field(description="Maximum peak-to-trough drawdown on the mean path (negative).")
    recovery_time: int = Field(description="Steps from shock onset to recovery of pre-shock level.")
    resilience_score: float = Field(description="Composite resilience score in [0, 1].")
    sharpe_ratio: float = Field(description="Annualized Sharpe ratio (risk-free = 2.5% p.a.).")
    sortino_ratio: float = Field(description="Sortino ratio using downside deviation.")


class StrategyResult(BaseModel):
    """Complete simulation output for one strategy."""
    name: str
    mean_path: list[float] = Field(description="Mean portfolio value at each time step.")
    percentile_10: list[float] = Field(description="10th-percentile path across Monte Carlo runs.")
    percentile_90: list[float] = Field(description="90th-percentile path across Monte Carlo runs.")
    metrics: MetricsResult


class SimulationResponse(BaseModel):
    """Full response from /api/simulate."""
    strategies: list[StrategyResult]
    shock_start: int
    n_steps: int
    best_by_resilience: str = Field(description="Strategy with highest resilience_score.")
    best_by_return: str = Field(description="Strategy with highest avg_return.")
    best_by_sharpe: str = Field(description="Strategy with highest Sharpe ratio.")
    scenario_label: str = Field(description="Human-readable shock scenario label.")
