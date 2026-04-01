"use client";

import React, { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Area,
  Tooltip,
} from "recharts";
import {
  SimulationResponse,
  STRATEGY_COLORS,
  STRATEGY_SHORT,
} from "@/types/simulation";

interface TimeSeriesChartProps {
  result: SimulationResponse;
}

const toKey = (name: string) =>
  name.replace(/ /g, "_").replace(/-/g, "_");

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: number;
}

const BAND_KEYS = new Set(["band_lower", "band_delta"]);

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const filtered = payload.filter(
    (p) => !BAND_KEYS.has(String(p.dataKey))
  );
  if (filtered.length === 0) return null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.07)",
        minWidth: 140,
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
        Day {label}
      </div>
      {filtered.map((p) => (
        <div
          key={String(p.dataKey)}
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
                borderRadius: "50%",
                backgroundColor: p.color,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            {STRATEGY_SHORT[p.name] ?? String(p.name).replace(/_/g, " ")}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontWeight: 500,
            }}
          >
            {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TimeSeriesChart({ result }: TimeSeriesChartProps) {
  const [bandStrategy, setBandStrategy] = useState<string>("");

  const { strategies, shock_start, n_steps } = result;

  // Downsample to <= 252 data points for performance
  const chartData = useMemo(() => {
    const stride = Math.max(1, Math.floor(n_steps / 252));
    const points: Record<string, number>[] = [];

    for (let i = 0; i < n_steps; i += stride) {
      const pt: Record<string, number> = { step: i };

      for (const s of strategies) {
        const k = toKey(s.name);
        pt[k] = parseFloat((s.mean_path[i] * 100).toFixed(3));
      }

      // Confidence band for the selected strategy (stacked area method)
      if (bandStrategy) {
        const bs = strategies.find((s) => s.name === bandStrategy);
        if (bs) {
          pt["band_lower"] = parseFloat(
            (bs.percentile_10[i] * 100).toFixed(3)
          );
          pt["band_delta"] = parseFloat(
            ((bs.percentile_90[i] - bs.percentile_10[i]) * 100).toFixed(3)
          );
        }
      }

      points.push(pt);
    }
    return points;
  }, [result, bandStrategy]);

  const shockX = useMemo(() => {
    const stride = Math.max(1, Math.floor(n_steps / 252));
    return Math.floor(shock_start / stride) * stride;
  }, [shock_start, n_steps]);

  const activeBandColor = bandStrategy
    ? (STRATEGY_COLORS[bandStrategy] ?? "#6366f1")
    : "#6366f1";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">
            Portfolio Value — All Strategies
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mean across Monte Carlo runs · Indexed to 100 at t = 0
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Confidence band:</span>
          <select
            className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-600 cursor-pointer"
            value={bandStrategy}
            onChange={(e) => setBandStrategy(e.target.value)}
          >
            <option value="">None</option>
            {strategies.map((s) => (
              <option key={s.name} value={s.name}>
                {STRATEGY_SHORT[s.name] ?? s.name}
              </option>
            ))}
          </select>
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
            ⚡ Shock: Day {shock_start}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart
          data={chartData}
          margin={{ top: 4, right: 20, bottom: 8, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="step"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickFormatter={(v: number) => `D${v}`}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickFormatter={(v: number) => v.toFixed(0)}
            axisLine={false}
            tickLine={false}
            label={{
              value: "Portfolio Value (Index)",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 10, fill: "#cbd5e1" },
            }}
          />

          {/* Custom tooltip suppresses band series rows */}
          <Tooltip content={<CustomTooltip />} />

          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
            formatter={(value: string) => {
              // Hide band series from legend entirely
              if (BAND_KEYS.has(value)) return "";
              const found = strategies.find((s) => toKey(s.name) === value);
              return found
                ? (STRATEGY_SHORT[found.name] ?? found.name)
                : value.replace(/_/g, " ");
            }}
          />

          <ReferenceLine
            x={shockX}
            stroke="#f59e0b"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{
              value: "Shock",
              position: "insideTopRight",
              fontSize: 10,
              fill: "#f59e0b",
            }}
          />

          {/* Stacked confidence band (only when bandStrategy is set) */}
          {bandStrategy && (
            <>
              <Area
                type="monotone"
                dataKey="band_lower"
                fill="transparent"
                stroke="none"
                stackId="ci"
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                type="monotone"
                dataKey="band_delta"
                fill={activeBandColor}
                fillOpacity={0.12}
                stroke="none"
                stackId="ci"
                isAnimationActive={false}
                legendType="none"
              />
            </>
          )}

          {/* Strategy mean lines */}
          {strategies.map((s) => {
            const k = toKey(s.name);
            const color = STRATEGY_COLORS[s.name] ?? "#6b7280";
            return (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                name={s.name}
                stroke={color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive
                animationDuration={600}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
