"""
Application entry point for The Kage Protocol.

Uses the modern FastAPI lifespan context manager (replaces the
deprecated ``@app.on_event`` pattern) for startup/shutdown lifecycle.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import get_settings
from app.core.logging import setup_logging, get_logger
from app.db import init_db
from app.reaper import reaper_loop
from app.services.docker_service import get_docker_service

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle for the application."""
    settings = get_settings()

    # --- Startup ---
    setup_logging(level=settings.log_level, json_logs=settings.json_logs)
    logger.info("Starting The Kage Protocol")

    init_db()
    logger.info("Database initialised")

    # Eagerly initialise the Docker client so connection errors surface early
    docker_svc = get_docker_service()
    if docker_svc.ping():
        logger.info("Docker daemon reachable")
    else:
        logger.warning("Docker daemon is NOT reachable — container operations will fail")

    # Ensure the challenge network exists at startup
    docker_svc.ensure_challenge_network(settings.challenge_network)

    # Fire-and-forget the reaper background task
    reaper_task = asyncio.create_task(reaper_loop())
    logger.info("Reaper background task started")

    yield

    # --- Shutdown ---
    reaper_task.cancel()
    logger.info("Kage Protocol shutting down")


settings = get_settings()

app = FastAPI(title="The Kage Protocol", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "service": "kage-protocol"}

