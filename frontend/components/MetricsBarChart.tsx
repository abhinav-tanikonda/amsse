"use client";

import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  SimulationResponse,
  MetricsResult,
  STRATEGY_COLORS,
  STRATEGY_SHORT,
} from "@/types/simulation";

interface MetricsBarChartProps {
  result: SimulationResponse;
}

type MetricTab = "performance" | "risk" | "risk_adjusted" | "resilience";

interface MetricDef {
  key: keyof MetricsResult;
  display: string;
  /** Transform the raw backend value for chart display */
  toChart: (v: number) => number;
  /** Format the chart-display value for the tooltip */
  formatTooltip: (v: number) => string;
  higherIsBetter: boolean;
}

interface TabConfig {
  label: string;
  metrics: MetricDef[];
  yNote?: string;
}

const TABS: Record<MetricTab, TabConfig> = {
  performance: {
    label: "Performance",
    metrics: [
      {
        key: "avg_return",
        display: "Avg Return (%)",
        toChart: (v) => parseFloat((v * 100).toFixed(4)),
        formatTooltip: (v) => `${v.toFixed(2)}%`,
        higherIsBetter: true,
      },
      {
        key: "terminal_value",
        display: "Terminal (×100)",
        toChart: (v) => parseFloat((v * 100).toFixed(4)),
        formatTooltip: (v) => v.toFixed(2),
        higherIsBetter: true,
      },
    ],
  },
  risk: {
    label: "Risk",
    yNote: "Lower is better for risk metrics",
    metrics: [
      {
        key: "volatility",
        display: "Vol (%)",
        toChart: (v) => parseFloat((v * 100).toFixed(4)),
        formatTooltip: (v) => `${v.toFixed(2)}%`,
        higherIsBetter: false,
      },
      {
        key: "max_drawdown",
        display: "Max DD (%)",
        toChart: (v) => parseFloat((v * 100).toFixed(4)),
        formatTooltip: (v) => `${v.toFixed(2)}%`,
        higherIsBetter: false,
      },
    ],
  },
  risk_adjusted: {
    label: "Risk-Adjusted",
    metrics: [
      {
        key: "sharpe_ratio",
        display: "Sharpe",
        toChart: (v) => parseFloat(v.toFixed(6)),
        formatTooltip: (v) => v.toFixed(3),
        higherIsBetter: true,
      },
      {
        key: "sortino_ratio",
        display: "Sortino",
        toChart: (v) => parseFloat(v.toFixed(6)),
        formatTooltip: (v) => v.toFixed(3),
        higherIsBetter: true,
      },
    ],
  },
  resilience: {
    label: "Resilience",
    metrics: [
      {
        key: "resilience_score",
        display: "Resilience",
        toChart: (v) => parseFloat(v.toFixed(6)),
        formatTooltip: (v) => v.toFixed(4),
        higherIsBetter: true,
      },
      {
        key: "recovery_time",
        display: "Recovery (d)",
        toChart: (v) => parseFloat(v.toFixed(1)),
        formatTooltip: (v) => `${Math.round(v)} d`,
        higherIsBetter: false,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

interface BarTooltipPayload {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

interface BarTooltipProps {
  active?: boolean;
  payload?: BarTooltipPayload[];
  label?: string;
  activeTab: MetricTab;
}

function BarCustomTooltip({
  active,
  payload,
  label,
  activeTab,
}: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const config = TABS[activeTab];
  const metricDef = config.metrics.find((m) => m.display === label);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.07)",
        minWidth: 160,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          color: "#475569",
          marginBottom: 4,
          fontSize: 11,
        }}
      >
        {label}
      </div>
      {payload.map((p) => (
        <div
          key={p.dataKey}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "1px 0",
            color: "#64748b",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: p.color,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            {STRATEGY_SHORT[p.name] ?? p.name}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontWeight: 500,
            }}
          >
            {metricDef
              ? metricDef.formatTooltip(p.value)
              : typeof p.value === "number"
              ? p.value.toFixed(3)
              : String(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MetricsBarChart({ result }: MetricsBarChartProps) {
  const [activeTab, setActiveTab] = useState<MetricTab>("performance");
  const config = TABS[activeTab];

  // Build chart data: one object per metric, strategy names as bar data keys
  const chartData = config.metrics.map((m) => {
    const entry: Record<string, number | string> = { metric: m.display };
    for (const s of result.strategies) {
      entry[s.name] = m.toChart(s.metrics[m.key] as number);
    }
    return entry;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">
            Strategy Comparison
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cross-strategy metric comparison · grouped by category
          </p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(TABS) as MetricTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs px-2.5 py-1 rounded font-medium transition-standard ${
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {TABS[tab].label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 16, bottom: 8, left: 16 }}
          barGap={4}
          barCategoryGap="30%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#f1f5f9"
            vertical={false}
          />
          <XAxis
            dataKey="metric"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <Tooltip
            content={(props) => (
              <BarCustomTooltip
                {...(props as Omit<BarTooltipProps, "activeTab">)}
                activeTab={activeTab}
              />
            )}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
            formatter={(value: string) => STRATEGY_SHORT[value] ?? value}
          />
          {activeTab === "risk" && (
            <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
          )}
          {result.strategies.map((s) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              name={s.name}
              fill={STRATEGY_COLORS[s.name] ?? "#6b7280"}
              radius={[3, 3, 0, 0]}
              maxBarSize={48}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {config.yNote && (
        <p className="text-xs text-slate-400 text-center mt-2">
          {config.yNote}
        </p>
      )}
    </div>
  );
}
