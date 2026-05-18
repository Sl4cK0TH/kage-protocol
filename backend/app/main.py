import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import api_router
from app.core.config import get_settings
from app.db import init_db
from app.reaper import reaper_loop

settings = get_settings()

app = FastAPI(title="The Kage Protocol")

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


@app.on_event("startup")
async def on_startup() -> None:
    init_db()
    asyncio.create_task(reaper_loop())
