# The Kage Protocol

## Overview

The Kage Protocol is a production-grade CTF challenge infrastructure dashboard. It lets administrators define Docker-based challenges ("Jutsus"), spawn isolated containers ("Shadow Clones"), and manage lifecycle policies ("Chakra Control") from a cyberpunk command center UI.

## Use Case

- Define challenge images, internal ports, and RAM limits.
- Spawn containers on demand from an external platform (CTFd) using a protected API key.
- Monitor running containers, inspect logs, and force-kill instances.
- Automatically reap expired containers with a background task.

## Architecture

- Frontend: Next.js (App Router), React, Tailwind CSS
- Backend: FastAPI (Python)
- Database: SQLite (SQLModel)
- Infrastructure: Docker SDK (local Docker daemon via socket bind)

## Repository Layout

- backend/ - FastAPI API, Docker SDK integration, SQLite models
- frontend/ - Next.js admin dashboard
- docker-compose.yml - backend container + Docker socket mount

## Prerequisites

- Docker + Docker Compose
- Node.js 18+ (for frontend)
- Python 3.11+ (for local backend dev)

## Installation (Quick Start)

1) Configure the backend:

```bash
cp backend/.env.example backend/.env
```

2) Start the backend (Docker):

```bash
docker compose up --build
```

3) Configure the frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

4) Open the dashboard:

```text
http://localhost:3000
```

## Dependencies

Backend:
- fastapi
- uvicorn
- sqlmodel / sqlalchemy
- docker (Python SDK)
- itsdangerous

Frontend:
- next
- react
- tailwindcss
- typescript

## Commands

Backend:
- `docker compose up --build` - run backend in Docker
- `uvicorn app.main:app --reload` - run backend locally

Frontend (from frontend/):
- `npm run dev` - start the development server
- `npm run build` - build for production
- `npm run start` - run the production build

## Basic Configuration

Backend (.env):
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` - admin credentials
- `KAGE_API_KEY` - API key for public spawn endpoint
- `SESSION_SECRET` - cookie signing secret
- `CORS_ORIGINS` - comma-separated list of allowed origins
- `DB_URL` - SQLite URL
- `PUBLIC_HOST` - host returned to clients from spawn responses
- `SPAWN_RATE_LIMIT_COUNT` / `SPAWN_RATE_LIMIT_WINDOW_SECONDS` - rate limit config

Frontend (.env):
- `NEXT_PUBLIC_API_BASE` - FastAPI base URL
- `NEXT_PUBLIC_SESSION_COOKIE_NAME` - admin cookie name

## Security Notes

- All admin endpoints are protected with HTTP-only cookie sessions.
- The public spawn endpoint requires a static `X-Kage-Key` header.
- The backend mounts `/var/run/docker.sock` to control the host Docker daemon.

## Documentation

- Admin UI docs are available inside the dashboard under Chakra Control and Documentation.
- CTFd integration snippet: backend/CTFD_SNIPPET.md

## License

Add your license terms here.
