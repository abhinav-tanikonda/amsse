import { SimulationParams, SimulationResponse } from "@/types/simulation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function runSimulation(
  params: SimulationParams
): Promise<SimulationResponse> {
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  return res.json() as Promise<SimulationResponse>;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
