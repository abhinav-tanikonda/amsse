"use client";

import React from "react";
import {
  SimulationResponse,
  STRATEGY_COLORS,
  STRATEGY_SHORT,
} from "@/types/simulation";

interface MetricCardsProps {
  result: SimulationResponse;
}

function BestBadge({
  label,
  strategy,
  detail,
}: {
  label: string;
  strategy: string;
  detail: string;
}) {
  const color = STRATEGY_COLORS[strategy] ?? "#6366f1";
  const short = STRATEGY_SHORT[strategy] ?? strategy;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4 flex flex-col gap-2">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-semibold text-slate-800">{short}</span>
      </div>
      <div className="font-mono text-lg font-semibold" style={{ color }}>
        {detail}
      </div>
    </div>
  );
}

function MetricStat({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
        {label}
      </div>
      <div
        className={`font-mono text-lg font-semibold ${
          good === undefined
            ? "text-slate-800"
            : good
            ? "text-emerald-600"
            : "text-red-500"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function MetricCards({ result }: MetricCardsProps) {
  const { strategies, best_by_resilience, best_by_return, best_by_sharpe } =
    result;

  const resilientStrategy = strategies.find(
    (s) => s.name === best_by_resilience
  );
  const returnStrategy = strategies.find((s) => s.name === best_by_return);
  const sharpeStrategy = strategies.find((s) => s.name === best_by_sharpe);

  const avgMaxDrawdown =
    strategies.reduce((sum, s) => sum + s.metrics.max_drawdown, 0) /
    strategies.length;
  const avgVol =
    strategies.reduce((sum, s) => sum + s.metrics.volatility, 0) /
    strategies.length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <BestBadge
        label="Best Resilience"
        strategy={best_by_resilience}
        detail={
          resilientStrategy
            ? `Score ${resilientStrategy.metrics.resilience_score.toFixed(3)}`
            : "—"
        }
      />
      <BestBadge
        label="Highest Return"
        strategy={best_by_return}
        detail={
          returnStrategy
            ? `+${(returnStrategy.metrics.avg_return * 100).toFixed(1)}%`
            : "—"
        }
      />
      <BestBadge
        label="Best Sharpe"
        strategy={best_by_sharpe}
        detail={
          sharpeStrategy
            ? sharpeStrategy.metrics.sharpe_ratio.toFixed(2)
            : "—"
        }
      />
      <MetricStat
        label="Avg Max Drawdown"
        value={`${(avgMaxDrawdown * 100).toFixed(1)}%`}
        good={avgMaxDrawdown > -0.2}
      />
      <MetricStat
        label="Avg Realized Vol"
        value={`${(avgVol * 100).toFixed(1)}%`}
        good={avgVol < 0.25}
      />
    </div>
  );
}
