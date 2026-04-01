# Adaptive Market Shock Simulation & Strategy Learning Engine (AMSSE)

A computational finance research simulator that compares portfolio strategy robustness
and resilience under four categories of macroeconomic shock via Monte Carlo methods.

---

## What It Does

AMSSE models a simplified market with correlated agents evolving under Geometric
Brownian Motion dynamics. A user-configurable shock is injected at a specified time,
propagating with realistic drift reduction and volatility amplification. Four strategies
compete under each scenario across hundreds of Monte Carlo runs:

| Strategy | Mechanism |
|---|---|
| **Conservative Hedging** | Cuts market exposure (beta) aggressively on shock; gradual vol-scaled recovery |
| **Balanced Reallocation** | Maintains moderate exposure; mechanically rebalances toward target beta |
| **Aggressive Risk-Seeking** | Holds and increases exposure post-shock ("buying the dip") |
| **Adaptive Strategy** | UCB1 contextual bandit selects beta from 5 discrete arms based on per-arm EWMA Sharpe reward |

---

## Shock Types

| Type | Description |
|---|---|
| **Interest Rate Shock** | Two-component model: immediate revaluation hit + sustained margin drag |
| **Liquidity Crisis** | Forced-selling dislocation; high vol amplification, slow recovery |
| **Volatility Spike** | VIX-style regime shift; extreme variance increase, mild drift effect |
| **Systemic Contagion** | Two-phase network spread: losses grow through connected agents, then decay |

---

## Metrics (per strategy, across full Monte Carlo ensemble)

- Average return and terminal portfolio value
- Annualised realised volatility
- Maximum peak-to-trough drawdown
- Recovery time (steps to return to pre-shock level)
- Sharpe ratio (annualised, rf = 2.5%)
- Sortino ratio (downside semi-deviation)
- Composite resilience score [0, 1] -- weighted: drawdown 40%, recovery 35%, Sharpe 25%

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Recharts |
| Backend | Python 3.11+, FastAPI, Pydantic v2 |
| Simulation | NumPy |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

---

## Project Structure

```
amsse/
├── README.md
├── render.yaml                       # Render Blueprint config (backend)
├── backend/
│   ├── main.py                       # FastAPI app, env-driven CORS
│   ├── requirements.txt
│   ├── routes/simulate.py
│   ├── schemas/simulation.py
│   └── engine/
│       ├── simulation.py             # Vectorized Monte Carlo runner
│       ├── shocks.py                 # 4 shock propagation models
│       ├── strategies.py             # Beta functions + UCB1 bandit
│       └── metrics.py                # Sharpe, drawdown, resilience
└── frontend/
    ├── vercel.json                   # Vercel deployment config
    ├── .env.local                    # Local dev vars (git-ignored)
    ├── .env.production.example       # Production var reference (committed)
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── postcss.config.js
    ├── next.config.js
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── globals.css
    ├── components/
    │   ├── ControlPanel.tsx
    │   ├── MetricCards.tsx
    │   ├── TimeSeriesChart.tsx
    │   ├── MetricsBarChart.tsx
    │   ├── ShockImpactChart.tsx
    │   └── MetricsTable.tsx
    ├── lib/api.ts
    └── types/simulation.ts
```

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm

### Backend

```bash
cd amsse/backend

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Verify: `curl http://localhost:8000/health`
API docs: `http://localhost:8000/docs`

### Frontend

```bash
cd amsse/frontend

npm install
npm run dev
# Open: http://localhost:3000
```

`frontend/.env.local` is pre-configured for local development:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Production Deployment

### Environment Variables

| Variable | Where to set | Local value | Production value |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Vercel dashboard -> Environment Variables | `http://localhost:8000` (in `.env.local`) | `https://amsse-backend.onrender.com` |
| `CORS_ORIGINS` | Render dashboard -> Environment | not needed locally | `https://your-project.vercel.app` |
| `PORT` | injected by Render automatically | not used locally | set by Render at runtime |

> `NEXT_PUBLIC_API_URL` is **inlined at build time** by Next.js.
> If you change it in Vercel, you must trigger a new deployment.

---

### Deploy Backend to Render

**Option A -- Blueprint (recommended)**

1. Push the repo to GitHub.
2. Render dashboard -> **New -> Blueprint** -> connect the repo.
3. Render reads `render.yaml` from the project root and auto-configures the service.
4. After creation, go to the **amsse-backend** service -> **Environment**.
5. Set `CORS_ORIGINS` = `https://your-project.vercel.app` (your Vercel URL).
6. Save -- this triggers an automatic redeploy.
7. Note the Render URL (e.g. `https://amsse-backend.onrender.com`).

**Option B -- Manual**

1. Render dashboard -> **New -> Web Service** -> connect the repo.
2. Set **Root Directory**: `backend`
3. Set **Runtime**: `Python 3`
4. Set **Build Command**: `pip install -r requirements.txt`
5. Set **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Set **Health Check Path**: `/health`
7. Add env var: `CORS_ORIGINS` = `https://your-project.vercel.app`
8. Click **Create Web Service**.
9. Note the Render URL.

> **Free tier note:** Render free tier services spin down after 15 minutes of
> inactivity. The first request after a cold start takes 30-60 seconds. The
> frontend will show the "Backend unreachable" banner during this time.
> Upgrade to Starter ($7/mo) for always-on behaviour.

---

### Deploy Frontend to Vercel

1. Vercel dashboard -> **New Project** -> import your GitHub repo.
2. Set **Root Directory** to `frontend`.
3. Framework preset will auto-detect as **Next.js** -- confirm this.
4. Under **Environment Variables**, add:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://amsse-backend.onrender.com` (your Render URL)
   - **Environments**: Production, Preview, Development
5. Click **Deploy**.
6. Note the Vercel URL (e.g. `https://amsse-abc123.vercel.app`).
7. Go back to Render -> update `CORS_ORIGINS` to the exact Vercel URL.
8. Render will redeploy automatically after the env var is saved.

**Verify the deployment:**
- Open the Vercel URL -- the "Backend unreachable" banner should NOT appear.
- Click **Run with Defaults** -- results should load within 5-15 seconds.
- If the banner appears, check that `NEXT_PUBLIC_API_URL` is set and redeploy.

---

## Pre-Launch Checklist

- [ ] `NEXT_PUBLIC_API_URL` set in Vercel -- matches Render URL exactly (no trailing slash)
- [ ] `CORS_ORIGINS` set in Render -- matches Vercel URL exactly (no trailing slash)
- [ ] `curl https://amsse-backend.onrender.com/health` returns `{"status":"ok",...}`
- [ ] Frontend loads without the "Backend unreachable" banner
- [ ] Clicking **Run Simulation** returns results (not an error state)

---

## Methods

- Correlated GBM dynamics via Cholesky decomposition of equicorrelation matrices
- Exponential decay shock propagation (two-phase for contagion)
- UCB1 multi-armed bandit for adaptive strategy selection with per-arm EWMA rewards
- Monte Carlo ensemble aggregation with P10/P90 confidence bands
- Composite resilience score from drawdown, recovery, and Sharpe components
- All strategies share the same stochastic market draws per run for controlled comparison

---

## Academic Context

This project is framed as an educational research tool for exploring the relationship
between strategy design, shock type, and portfolio resilience. It is not a predictor
of real-world asset prices.

Relevant methods:
- Correlated GBM: Avellaneda & Lipkin (2003)
- UCB1 bandit: Auer et al. (2002)
- Stress-period correlation spikes: Ang & Chen (2002)
- Downside risk measures: Rockafellar & Uryasev (2000)
