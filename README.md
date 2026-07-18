# The Kage Protocol

## Overview

The Kage Protocol is a production-grade CTF challenge infrastructure dashboard. It lets administrators define Docker-based challenges ("Jutsus"), spawn isolated containers ("Shadow Clones"), and manage lifecycle policies ("Chakra Control") from a cyberpunk command center UI.

**Platform-agnostic** — integrates with CTFd, TryHackMe (self-hosted), or any custom platform via a simple API.

## Use Case

- Define challenge images, internal ports, RAM/CPU limits.
- Spawn containers on demand from an external platform using a protected API key.
- Monitor running containers, inspect logs, and force-kill instances.
- Automatically reap expired containers with a background task (The Reaper).

## Architecture

- Frontend: Next.js (App Router), React, Tailwind CSS
- Backend: FastAPI (Python)
- Database: SQLite (SQLModel)
- Infrastructure: Docker SDK (via Docker socket proxy for security)

## Repository Layout

- backend/ - FastAPI API, Docker SDK integration, SQLite models
- frontend/ - Next.js admin dashboard
- docker-compose.yml - backend + Docker socket proxy

## Prerequisites

- Docker + Docker Compose
- Node.js 18+ (for frontend)
- Python 3.11+ (for local backend dev)

## Installation (Quick Start)

1) Generate your admin password hash:

```bash
pip install bcrypt
python backend/scripts/hash_password.py your_password_here
```

2) Configure the backend:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set ADMIN_PASSWORD_HASH, KAGE_API_KEY, SESSION_SECRET
```

3) Start the backend (Docker):

```bash
docker compose up --build
```

4) Configure and start the frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

5) Open the dashboard:

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
- bcrypt

Frontend:
- next
- react
- tailwindcss
- typescript

## Commands

Backend:
- `docker compose up --build` - run backend in Docker (recommended)
- `uvicorn app.main:app --reload` - run backend locally

Frontend (from frontend/):
- `npm run dev` - start the development server
- `npm run build` - build for production
- `npm run start` - run the production build

## Configuration

Backend (.env):

| Variable | Required | Description |
|---|---|---|
| `ADMIN_USERNAME` | ✅ | Admin login username |
| `ADMIN_PASSWORD_HASH` | ✅ | bcrypt hash of admin password |
| `KAGE_API_KEY` | ✅ | API key for public spawn endpoint |
| `SESSION_SECRET` | ✅ | Cookie signing secret |
| `CORS_ORIGINS` | | Comma-separated allowed origins |
| `DB_URL` | | SQLite URL (default: `sqlite:///./data/kage.db`) |
| `PUBLIC_HOST` | | Host returned in spawn responses |
| `CHALLENGE_NETWORK` | | Docker network for containers (default: `kage-challenges`) |
| `DEFAULT_CPU_LIMIT` | | CPU cores per container (default: `0.5`) |
| `LOG_LEVEL` | | Python log level (default: `INFO`) |
| `JSON_LOGS` | | Use JSON log format (default: `false`) |
| `SPAWN_RATE_LIMIT_COUNT` | | Max spawns per window (default: `30`) |
| `SPAWN_RATE_LIMIT_WINDOW_SECONDS` | | Rate limit window (default: `60`) |

Frontend (.env):
- `NEXT_PUBLIC_API_BASE` - FastAPI base URL
- `NEXT_PUBLIC_SESSION_COOKIE_NAME` - admin cookie name

## Security

- **Docker Socket Proxy**: The backend never mounts the raw Docker socket. A Tecnativa socket proxy restricts API access to only the endpoints Kage needs.
- **Password Hashing**: Admin password is stored as a bcrypt hash. Plaintext is never stored.
- **CSRF Protection**: Double-submit cookie pattern protects all state-mutating admin endpoints.
- **HTTP-only Cookies**: Session cookies are HttpOnly and SameSite=Lax.
- **API Key Auth**: Public spawn endpoint requires `X-Kage-Key` header.
- **Container Isolation**: Spawned containers run on a dedicated Docker network with CPU and RAM limits.
- **Rate Limiting**: Spawn requests are rate-limited per API key + client IP.
- **Audit Logging**: All admin and spawn actions are logged with timestamps and IP addresses.

## Platform Integration

See [backend/INTEGRATION.md](backend/INTEGRATION.md) for integration guides covering:
- CTFd (dynamic challenge handler)
- TryHackMe (self-hosted landing page)
- Generic webhook / curl

## License

Add your license terms here.
