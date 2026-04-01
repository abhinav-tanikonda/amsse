export type ShockType =
  | "interest_rate"
  | "liquidity"
  | "volatility"
  | "contagion";

export interface SimulationParams {
  n_steps: number;
  n_runs: number;
  n_agents: number;
  baseline_volatility: number;
  shock_intensity: number;
  market_sensitivity: number;
  recovery_speed: number;
  contagion_strength: number;
  adaptive_aggressiveness: number;
  shock_start: number;
  shock_type: ShockType;
}

export interface MetricsResult {
  avg_return: number;
  terminal_value: number;
  volatility: number;
  max_drawdown: number;
  recovery_time: number;
  resilience_score: number;
  sharpe_ratio: number;
  sortino_ratio: number;
}

export interface StrategyResult {
  name: string;
  mean_path: number[];
  percentile_10: number[];
  percentile_90: number[];
  metrics: MetricsResult;
}

export interface SimulationResponse {
  strategies: StrategyResult[];
  shock_start: number;
  n_steps: number;
  best_by_resilience: string;
  best_by_return: string;
  best_by_sharpe: string;
  scenario_label: string;
}

export const DEFAULT_PARAMS: SimulationParams = {
  n_steps: 252,
  n_runs: 200,
  n_agents: 5,
  baseline_volatility: 0.15,
  shock_intensity: 0.4,
  market_sensitivity: 0.85,
  recovery_speed: 0.08,
  contagion_strength: 0.5,
  adaptive_aggressiveness: 0.7,
  shock_start: 80,
  shock_type: "liquidity",
};

export const STRATEGY_COLORS: Record<string, string> = {
  "Conservative Hedging": "#3B82F6",
  "Balanced Reallocation": "#10B981",
  "Aggressive Risk-Seeking": "#EF4444",
  "Adaptive Strategy": "#8B5CF6",
};

export const STRATEGY_SHORT: Record<string, string> = {
  "Conservative Hedging": "Conservative",
  "Balanced Reallocation": "Balanced",
  "Aggressive Risk-Seeking": "Aggressive",
  "Adaptive Strategy": "Adaptive",
};

export const SHOCK_LABELS: Record<ShockType, string> = {
  interest_rate: "Interest Rate Shock",
  liquidity: "Liquidity Crisis",
  volatility: "Volatility Spike",
  contagion: "Systemic Contagion",
};

export const SHOCK_DESCRIPTIONS: Record<ShockType, string> = {
  interest_rate:
    "A sudden rise in policy rates increases discount factors, compresses asset valuations, and sustains a persistent drag on portfolio returns.",
  liquidity:
    "Market liquidity dries up, triggering forced selling, wide bid-ask spreads, and sharp volatility amplification across all correlated agents.",
  volatility:
    "A volatility regime shift (VIX-style spike) dramatically increases return variance, creating large dispersion across strategies and runs.",
  contagion:
    "Losses propagate through an inter-agent network: initial losses at one node transmit to correlated counterparties, building to a systemic peak before gradual recovery.",
};
