"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  SimulationParams,
  SimulationResponse,
  DEFAULT_PARAMS,
} from "@/types/simulation";
import { runSimulation, checkHealth } from "@/lib/api";
import ControlPanel from "@/components/ControlPanel";
import MetricCards from "@/components/MetricCards";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import MetricsBarChart from "@/components/MetricsBarChart";
import ShockImpactChart from "@/components/ShockImpactChart";
import MetricsTable from "@/components/MetricsTable";

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: SimulationResponse }
  | { status: "error"; message: string };

function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-screen-2xl mx-auto px-6 py-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-indigo-600" />
            <span className="text-xs font-semibold text-indigo-600 uppercase tracking-widest">
              Computational Finance Research
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">
            Adaptive Market Shock Simulation
            <span className="text-slate-400 font-normal">
              {" "}
              &amp; Strategy Learning Engine
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            A Monte Carlo simulation framework for evaluating portfolio strategy
            robustness under correlated macroeconomic shocks. Compares
            conservative, balanced, aggressive, and adaptive (UCB1 bandit)
            strategies across user-defined market stress scenarios.
          </p>
        </div>
        <div className="flex-shrink-0 hidden md:flex flex-col items-end gap-1 text-right">
          <div className="text-xs text-slate-400">
            Stack: Python &middot; FastAPI &middot; NumPy &middot; Next.js &middot; Recharts
          </div>
          <div className="text-xs text-slate-400">
            Methods: GBM &middot; Cholesky &middot; UCB1 Bandit &middot; Monte Carlo
          </div>
        </div>
      </div>
    </header>
  );
}

function EmptyState({ onRun }: { onRun: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
        <svg
          className="w-7 h-7 text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </svg>
      </div>
      <h2 className="text-sm font-semibold text-slate-700 mb-1">
        No simulation results yet
      </h2>
      <p className="text-sm text-slate-400 max-w-sm mb-5">
        Configure scenario parameters in the control panel, then click{" "}
        <span className="font-medium text-slate-600">Run Simulation</span> to
        begin. Each run executes the Monte Carlo engine and compares all four
        strategies against the same market realisations.
      </p>
      <button
        onClick={onRun}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-standard"
      >
        Run with Defaults
      </button>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
      <div className="relative w-12 h-12 mb-5">
        <div className="absolute inset-0 rounded-full border-2 border-indigo-100" />
        <div className="absolute inset-0 rounded-full border-2 border-t-indigo-600 animate-spin" />
      </div>
      <p className="text-sm font-medium text-slate-700">
        Running Monte Carlo simulation...
      </p>
      <p className="text-xs text-slate-400 mt-1">
        Propagating shocks &middot; Updating bandit beliefs &middot; Computing metrics
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <h2 className="text-sm font-semibold text-slate-700 mb-1">
        Simulation Error
      </h2>
      <p className="text-xs text-slate-500 max-w-xs mb-4 font-mono bg-slate-50 border border-slate-200 rounded px-3 py-2">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition-standard"
      >
        Retry
      </button>
    </div>
  );
}

function ScenarioBanner({ result }: { result: SimulationResponse }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-sm font-semibold text-slate-700">
          {result.scenario_label}
        </span>
      </div>
      <span className="text-xs text-slate-400">&middot;</span>
      <span className="text-xs text-slate-500">
        {result.n_steps} steps &middot; Shock at day {result.shock_start}
      </span>
      <span className="text-xs text-slate-400">&middot;</span>
      <span className="text-xs text-slate-500">
        {result.strategies.length} strategies &middot; Monte Carlo ensemble
      </span>
    </div>
  );
}

export default function Home() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [appState, setAppState] = useState<AppState>({ status: "idle" });
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth().then(setBackendHealthy);
  }, []);

  const handleParamChange = useCallback(
    (updated: Partial<SimulationParams>) => {
      setParams((prev) => ({ ...prev, ...updated }));
    },
    []
  );

  const handleRun = useCallback(async () => {
    setAppState({ status: "loading" });
    try {
      const result = await runSimulation(params);
      setAppState({ status: "success", result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setAppState({ status: "error", message: msg });
    }
  }, [params]);

  const isLoading = appState.status === "loading";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      {backendHealthy === false && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-800 flex items-center gap-2">
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Backend unreachable at{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">
            {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
          </code>
          {" "}— start the FastAPI server before running the simulation.
        </div>
      )}

      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full">
        <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-slate-50 px-4 py-5 flex flex-col sticky top-0 h-screen overflow-y-auto">
          <ControlPanel
            params={params}
            onChange={handleParamChange}
            onRun={handleRun}
            loading={isLoading}
          />
        </div>

        <main className="flex-1 px-6 py-5 flex flex-col gap-5 min-w-0">
          {appState.status === "idle" && <EmptyState onRun={handleRun} />}
          {appState.status === "loading" && <LoadingOverlay />}
          {appState.status === "error" && (
            <ErrorState message={appState.message} onRetry={handleRun} />
          )}
          {appState.status === "success" && (
            <>
              <ScenarioBanner result={appState.result} />
              <MetricCards result={appState.result} />
              <TimeSeriesChart result={appState.result} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <MetricsBarChart result={appState.result} />
                <ShockImpactChart result={appState.result} />
              </div>
              <MetricsTable result={appState.result} />
              <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Strategy Mechanics
                  </h4>
                  <dl className="space-y-2 text-xs text-slate-500">
                    <div className="flex items-start gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-700">Conservative:</strong>{" "}
                        Cuts beta from ~0.85 to ~0.13-0.25 on shock onset;
                        vol-scaling further penalises exposure when sigma rises.
                        Hedge benefit is implicit in low systematic loading.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-700">Balanced:</strong>{" "}
                        Maintains beta 0.50-0.90, mechanically rebalancing
                        toward a target weight. Absorbs moderate shock impact.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-700">Aggressive:</strong>{" "}
                        Holds then increases beta (up to ~1.55) post-shock,
                        buying the dip. High variance; strong recovery
                        potential but deep drawdowns.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-700">Adaptive (UCB1):</strong>{" "}
                        Selects beta from five arms using Upper Confidence Bound
                        exploration. Each arm tracks its own EWMA Sharpe reward.
                        Converges pre-shock; re-explores post-shock as rewards
                        shift. C controls exploration aggressiveness.
                      </div>
                    </div>
                  </dl>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Simulation Architecture
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-500">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-slate-400">--</span>
                      <span>
                        All strategies share the same stochastic market draws
                        per run. Only beta responses differ, ensuring controlled
                        comparison across strategies.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-slate-400">--</span>
                      <span>
                        Agent correlations are modelled via Cholesky decomposition
                        of an equicorrelation matrix that increases during shock,
                        reflecting the empirically documented correlation spike.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-slate-400">--</span>
                      <span>
                        Shock drift and vol effects decay exponentially with
                        rate lambda. Contagion uses a two-phase spread model:
                        network propagation then recovery.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-slate-400">--</span>
                      <span>
                        Resilience score weights: drawdown depth (40%),
                        recovery speed (35%), risk-adjusted return (25%).
                        Higher scores indicate greater robustness under the chosen shock regime.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
