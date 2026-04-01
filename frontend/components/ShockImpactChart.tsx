"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  SimulationResponse,
  STRATEGY_COLORS,
  STRATEGY_SHORT,
} from "@/types/simulation";

interface ShockImpactChartProps {
  result: SimulationResponse;
}

export default function ShockImpactChart({ result }: ShockImpactChartProps) {
  const { strategies, shock_start, n_steps } = result;

  // For each strategy: pre-shock, trough, and final values (indexed to 100)
  const phaseData = useMemo(() => {
    return strategies.map((s) => {
      const preShock = s.mean_path[shock_start] * 100;

      // Find minimum after shock
      const postShockPath = s.mean_path.slice(shock_start);
      const minVal = Math.min(...postShockPath) * 100;
      const final = s.mean_path[n_steps - 1] * 100;

      return {
        name: STRATEGY_SHORT[s.name] ?? s.name,
        fullName: s.name,
        "Pre-Shock": parseFloat(preShock.toFixed(2)),
        "Post-Shock Trough": parseFloat(minVal.toFixed(2)),
        "Final Value": parseFloat(final.toFixed(2)),
      };
    });
  }, [result]);

  // Separate chart showing drawdown and net return as signed bars
  const deltaData = useMemo(() => {
    return strategies.map((s) => {
      const preShock = s.mean_path[shock_start] * 100;
      const postShockPath = s.mean_path.slice(shock_start);
      const minVal = Math.min(...postShockPath) * 100;
      const final = s.mean_path[n_steps - 1] * 100;

      return {
        name: STRATEGY_SHORT[s.name] ?? s.name,
        fullName: s.name,
        "Shock Drawdown (%)": parseFloat(
          (((minVal - preShock) / preShock) * 100).toFixed(2)
        ),
        "Net Return (%)": parseFloat(
          (((final - 100) / 100) * 100).toFixed(2)
        ),
      };
    });
  }, [result]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-700">
          Shock Impact Analysis
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Pre-shock vs trough vs final portfolio value across strategies
        </p>
      </div>

      {/* Phase value chart */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={phaseData}
          margin={{ top: 4, right: 12, bottom: 4, left: 12 }}
          barGap={2}
          barCategoryGap="25%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#f1f5f9"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => v.toFixed(0)}
            label={{
              value: "Index (100 = Start)",
              angle: -90,
              position: "insideLeft",
              offset: 8,
              style: { fontSize: 9, fill: "#cbd5e1" },
            }}
          />
          <Tooltip
            formatter={(v: number, name: string) => [`${v.toFixed(2)}`, name]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Bar
            dataKey="Pre-Shock"
            radius={[3, 3, 0, 0]}
            maxBarSize={32}
          >
            {phaseData.map((entry) => (
              <Cell
                key={entry.fullName}
                fill={STRATEGY_COLORS[entry.fullName] ?? "#94a3b8"}
                fillOpacity={0.4}
              />
            ))}
          </Bar>
          <Bar
            dataKey="Post-Shock Trough"
            radius={[3, 3, 0, 0]}
            maxBarSize={32}
          >
            {phaseData.map((entry) => (
              <Cell
                key={entry.fullName}
                fill={STRATEGY_COLORS[entry.fullName] ?? "#ef4444"}
                fillOpacity={0.75}
              />
            ))}
          </Bar>
          <Bar dataKey="Final Value" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {phaseData.map((entry) => (
              <Cell
                key={entry.fullName}
                fill={STRATEGY_COLORS[entry.fullName] ?? "#10b981"}
                fillOpacity={1.0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Drawdown & net return delta bars */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-500 mb-3">
          Shock drawdown (negative) vs overall net return
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart
            data={deltaData}
            margin={{ top: 0, right: 12, bottom: 4, left: 12 }}
            barGap={3}
            barCategoryGap="30%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f1f5f9"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              formatter={(v: number, name: string) => [
                `${v.toFixed(2)}%`,
                name,
              ]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
            <Bar
              dataKey="Shock Drawdown (%)"
              radius={[2, 2, 0, 0]}
              maxBarSize={36}
            >
              {deltaData.map((entry) => (
                <Cell
                  key={entry.fullName}
                  fill={STRATEGY_COLORS[entry.fullName] ?? "#ef4444"}
                  fillOpacity={0.45}
                />
              ))}
            </Bar>
            <Bar
              dataKey="Net Return (%)"
              radius={[2, 2, 0, 0]}
              maxBarSize={36}
            >
              {deltaData.map((entry) => (
                <Cell
                  key={entry.fullName}
                  fill={STRATEGY_COLORS[entry.fullName] ?? "#10b981"}
                  fillOpacity={0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
