from fastapi import APIRouter, HTTPException
from schemas.simulation import SimulationRequest, SimulationResponse, StrategyResult, MetricsResult
from engine.simulation import run_monte_carlo, STRATEGY_NAMES
from engine.shocks import ShockType

router = APIRouter(tags=["Simulation"])

SCENARIO_LABELS: dict[str, str] = {
    "interest_rate": "Interest Rate Shock Scenario",
    "liquidity": "Market Liquidity Crisis Scenario",
    "volatility": "Volatility Spike Scenario",
    "contagion": "Systemic Contagion Scenario",
}


@router.post("/simulate", response_model=SimulationResponse)
def simulate(request: SimulationRequest) -> SimulationResponse:
    """
    Run a Monte Carlo simulation across all four strategies under the
    specified macroeconomic shock scenario.

    Returns mean paths, P10/P90 bands, and full metrics per strategy.
    """
    try:
        shock_type = ShockType(request.shock_type)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Invalid shock_type '{request.shock_type}'. "
                f"Choose from: interest_rate, liquidity, volatility, contagion"
            ),
        )

    try:
        raw_results = run_monte_carlo(
            n_steps=request.n_steps,
            n_runs=request.n_runs,
            n_agents=request.n_agents,
            baseline_volatility=request.baseline_volatility,
            shock_intensity=request.shock_intensity,
            market_sensitivity=request.market_sensitivity,
            recovery_speed=request.recovery_speed,
            contagion_strength=request.contagion_strength,
            adaptive_aggressiveness=request.adaptive_aggressiveness,
            shock_start=request.shock_start,
            shock_type=shock_type,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Simulation engine error: {str(exc)}",
        )

    strategies: list[StrategyResult] = []
    for name in STRATEGY_NAMES:
        r = raw_results[name]
        m = r["metrics"]
        strategies.append(
            StrategyResult(
                name=name,
                mean_path=r["mean_path"],
                percentile_10=r["percentile_10"],
                percentile_90=r["percentile_90"],
                metrics=MetricsResult(
                    avg_return=m["avg_return"],
                    terminal_value=m["terminal_value"],
                    volatility=m["volatility"],
                    max_drawdown=m["max_drawdown"],
                    recovery_time=m["recovery_time"],
                    resilience_score=m["resilience_score"],
                    sharpe_ratio=m["sharpe_ratio"],
                    sortino_ratio=m["sortino_ratio"],
                ),
            )
        )

    best_by_resilience = max(
        strategies, key=lambda s: s.metrics.resilience_score
    ).name
    best_by_return = max(
        strategies, key=lambda s: s.metrics.avg_return
    ).name
    best_by_sharpe = max(
        strategies, key=lambda s: s.metrics.sharpe_ratio
    ).name

    return SimulationResponse(
        strategies=strategies,
        shock_start=request.shock_start,
        n_steps=request.n_steps,
        best_by_resilience=best_by_resilience,
        best_by_return=best_by_return,
        best_by_sharpe=best_by_sharpe,
        scenario_label=SCENARIO_LABELS.get(request.shock_type, "Custom Scenario"),
    )
