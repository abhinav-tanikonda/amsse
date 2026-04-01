"use client";

import React from "react";
import {
  SimulationResponse,
  MetricsResult,
  STRATEGY_COLORS,
} from "@/types/simulation";

interface MetricsTableProps {
  result: SimulationResponse;
}

function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

function TCell({
  value,
  isBest,
  isWorst,
}: {
  value: string;
  isBest: boolean;
  isWorst: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-right font-mono text-xs tabular-nums ${
        isBest
          ? "text-emerald-600 font-semibold"
          : isWorst
          ? "text-red-500"
          : "text-slate-700"
      }`}
    >
      {value}
      {isBest && (
        <span className="ml-1 text-emerald-400 text-[10px]">▲</span>
      )}
    </td>
  );
}

interface RowDef {
  label: string;
  key: keyof MetricsResult;
  format: (v: number) => string;
  higherIsBetter: boolean;
}

const ROWS: RowDef[] = [
  {
    label: "Avg Return",
    key: "avg_return",
    format: (v) => `${(v * 100).toFixed(2)}%`,
    higherIsBetter: true,
  },
  {
    label: "Terminal Value",
    key: "terminal_value",
    format: (v) => (v * 100).toFixed(2),
    higherIsBetter: true,
  },
  {
    label: "Volatility (ann.)",
    key: "volatility",
    format: (v) => `${(v * 100).toFixed(2)}%`,
    higherIsBetter: false,
  },
  {
    label: "Max Drawdown",
    key: "max_drawdown",
    format: (v) => `${(v * 100).toFixed(2)}%`,
    higherIsBetter: false,
  },
  {
    label: "Recovery Time",
    key: "recovery_time",
    format: (v) => `${Math.round(v)} d`,
    higherIsBetter: false,
  },
  {
    label: "Resilience Score",
    key: "resilience_score",
    format: (v) => v.toFixed(4),
    higherIsBetter: true,
  },
  {
    label: "Sharpe Ratio",
    key: "sharpe_ratio",
    format: (v) => v.toFixed(3),
    higherIsBetter: true,
  },
  {
    label: "Sortino Ratio",
    key: "sortino_ratio",
    format: (v) => v.toFixed(3),
    higherIsBetter: true,
  },
];

export default function MetricsTable({ result }: MetricsTableProps) {
  const { strategies } = result;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">
          Full Metrics Summary
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Aggregated across all Monte Carlo runs · ▲ best in row · red = worst
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-5 py-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">
                Metric
              </th>
              {strategies.map((s) => (
                <th
                  key={s.name}
                  className="text-right px-4 py-3 font-semibold text-slate-600 text-[10px] uppercase tracking-wide"
                >
                  <span className="flex items-center justify-end">
                    <ColorDot color={STRATEGY_COLORS[s.name] ?? "#6b7280"} />
                    {s.name.split(" ")[0]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {ROWS.map((row) => {
              const values = strategies.map(
                (s) => s.metrics[row.key] as number
              );
              const best = row.higherIsBetter
                ? Math.max(...values)
                : Math.min(...values);
              const worst = row.higherIsBetter
                ? Math.min(...values)
                : Math.max(...values);
              const allEqual = values.every(
                (v) => Math.abs(v - values[0]) < 1e-9
              );

              return (
                <tr
                  key={row.key}
                  className="hover:bg-slate-50/50 transition-standard"
                >
                  <td className="px-5 py-3 font-medium text-slate-600 whitespace-nowrap">
                    {row.label}
                  </td>
                  {strategies.map((s) => {
                    const v = s.metrics[row.key] as number;
                    return (
                      <TCell
                        key={s.name}
                        value={row.format(v)}
                        isBest={!allEqual && Math.abs(v - best) < 1e-9}
                        isWorst={!allEqual && Math.abs(v - worst) < 1e-9}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
