"""
AMSSE FastAPI application entry point.

CORS origins are read from the CORS_ORIGINS environment variable
(comma-separated list) to support deployment without code changes.
Falls back to localhost for local development.
"""

from __future__ import annotations

import os
import sys

# Ensure backend directory is on path when run from project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.simulate import router as simulate_router


def _parse_cors_origins() -> list[str]:
    env_val = os.getenv("CORS_ORIGINS", "").strip()
    if env_val:
        return [o.strip() for o in env_val.split(",") if o.strip()]
    # Development defaults
    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]


app = FastAPI(
    title="Adaptive Market Shock Simulation & Strategy Learning Engine",
    description=(
        "Computational finance research simulator. "
        "Compares Conservative, Balanced, Aggressive, and Adaptive (UCB1 bandit) "
        "strategies under correlated macroeconomic shocks via Monte Carlo methods."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)

app.include_router(simulate_router, prefix="/api")


@app.get("/health", tags=["System"])
def health_check() -> dict[str, str]:
    """Liveness probe — returns 200 OK when the service is running."""
    return {"status": "ok", "service": "AMSSE Backend", "version": "1.0.0"}


@app.get("/", tags=["System"])
def root() -> dict[str, object]:
    return {
        "message": "AMSSE API — see /docs for endpoint documentation.",
        "endpoints": ["/health", "/api/simulate"],
    }
