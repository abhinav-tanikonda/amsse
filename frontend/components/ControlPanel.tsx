"use client";

import React from "react";
import {
  SimulationParams,
  ShockType,
  SHOCK_LABELS,
  SHOCK_DESCRIPTIONS,
} from "@/types/simulation";

interface ControlPanelProps {
  params: SimulationParams;
  onChange: (updated: Partial<SimulationParams>) => void;
  onRun: () => void;
  loading: boolean;
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  hint,
}: SliderFieldProps) {
  const display = format ? format(value) : String(value);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <span className="text-xs font-mono font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
      <div className="h-px flex-1 bg-slate-100" />
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">
        {title}
      </span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const dec2 = (v: number) => v.toFixed(2);
const int = (v: number) => String(Math.round(v));

export default function ControlPanel({
  params,
  onChange,
  onRun,
  loading,
}: ControlPanelProps) {
  const shockTypes: ShockType[] = [
    "interest_rate",
    "liquidity",
    "volatility",
    "contagion",
  ];

  return (
    <aside className="w-full flex flex-col gap-0 h-full overflow-y-auto">
      {/* Shock Scenario */}
      <SectionHeader title="Shock Scenario" />

      <div className="mb-4">
        <label className="text-xs font-medium text-slate-600 block mb-1.5">
          Shock Type
        </label>
        <div className="grid grid-cols-1 gap-1.5">
          {shockTypes.map((st) => (
            <button
              key={st}
              onClick={() => onChange({ shock_type: st })}
              className={`text-left px-3 py-2 rounded-md border text-xs font-medium transition-standard ${
                params.shock_type === st
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
              }`}
            >
              {SHOCK_LABELS[st]}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          {SHOCK_DESCRIPTIONS[params.shock_type]}
        </p>
      </div>

      <SliderField
        label="Shock Intensity"
        value={params.shock_intensity}
        min={0.05}
        max={1.0}
        step={0.05}
        format={pct}
        onChange={(v) => onChange({ shock_intensity: v })}
        hint="Magnitude of the macroeconomic disruption"
      />

      <SliderField
        label="Shock Start (Day)"
        value={params.shock_start}
        min={20}
        max={params.n_steps - 20}
        step={5}
        format={int}
        onChange={(v) => onChange({ shock_start: Math.round(v) })}
        hint="Simulation step at which the shock is injected"
      />

      {/* Market Dynamics */}
      <SectionHeader title="Market Dynamics" />

      <SliderField
        label="Baseline Volatility (σ)"
        value={params.baseline_volatility}
        min={0.05}
        max={0.5}
        step={0.01}
        format={pct}
        onChange={(v) => onChange({ baseline_volatility: v })}
        hint="Annualized baseline return volatility (pre-shock)"
      />

      <SliderField
        label="Market Sensitivity (β)"
        value={params.market_sensitivity}
        min={0.3}
        max={1.5}
        step={0.05}
        format={dec2}
        onChange={(v) => onChange({ market_sensitivity: v })}
        hint="Systemic exposure of the portfolio universe"
      />

      <SliderField
        label="Recovery Speed (λ)"
        value={params.recovery_speed}
        min={0.01}
        max={0.3}
        step={0.01}
        format={dec2}
        onChange={(v) => onChange({ recovery_speed: v })}
        hint="Rate of exponential decay of shock effect"
      />

      <SliderField
        label="Contagion Strength (ρ)"
        value={params.contagion_strength}
        min={0.0}
        max={1.0}
        step={0.05}
        format={pct}
        onChange={(v) => onChange({ contagion_strength: v })}
        hint="Inter-agent correlation amplification during shock"
      />

      {/* Simulation Settings */}
      <SectionHeader title="Simulation Settings" />

      <SliderField
        label="Time Steps (T)"
        value={params.n_steps}
        min={100}
        max={504}
        step={21}
        format={int}
        onChange={(v) =>
          onChange({
            n_steps: Math.round(v),
            shock_start: Math.min(params.shock_start, Math.round(v) - 20),
          })
        }
        hint="Simulation horizon in trading days"
      />

      <SliderField
        label="Monte Carlo Runs (N)"
        value={params.n_runs}
        min={50}
        max={500}
        step={50}
        format={int}
        onChange={(v) => onChange({ n_runs: Math.round(v) })}
        hint="Number of stochastic paths per strategy"
      />

      <SliderField
        label="Correlated Agents"
        value={params.n_agents}
        min={2}
        max={10}
        step={1}
        format={int}
        onChange={(v) => onChange({ n_agents: Math.round(v) })}
        hint="Number of correlated market participants"
      />

      {/* Adaptive Strategy */}
      <SectionHeader title="Adaptive Strategy" />

      <SliderField
        label="Exploration Parameter (C)"
        value={params.adaptive_aggressiveness}
        min={0.1}
        max={2.0}
        step={0.1}
        format={dec2}
        onChange={(v) => onChange({ adaptive_aggressiveness: v })}
        hint="UCB1 exploration bonus — higher values favour arm exploration"
      />

      {/* Run Button */}
      <div className="mt-6 sticky bottom-0 pb-2 bg-slate-50 pt-3">
        <button
          onClick={onRun}
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition-standard ${
            loading
              ? "bg-slate-300 text-slate-500 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm"
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                />
              </svg>
              Running Monte Carlo…
            </span>
          ) : (
            "Run Simulation"
          )}
        </button>
        <p className="text-center text-xs text-slate-400 mt-2">
          {params.n_runs} paths × {params.n_steps} steps
        </p>
      </div>
    </aside>
  );
}
