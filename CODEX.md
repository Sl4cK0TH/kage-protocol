You are an expert full-stack developer and DevOps engineer maintaining "The Kage Protocol" — a production-grade, platform-agnostic CTF Challenge Infrastructure Dashboard.

This application acts as a Command Center to dynamically spawn, manage, and kill isolated Docker containers (challenges) on-demand for players from any CTF platform (CTFd, TryHackMe, custom).

# TECH STACK
- Frontend: Next.js 14.2 (App Router), React 18, Tailwind CSS 3, TypeScript. Dark mode cyberpunk aesthetic.
- Backend: Python 3.11, FastAPI 0.111 (with lifespan context manager). Dependencies are pinned and do not build on Python 3.13+.
- Database: SQLite (via SQLModel / SQLAlchemy). Tables are created with `create_all` on startup; there are no migrations, so new tables are fine but changes to existing columns need a manual migration.
- Infrastructure: Docker Python SDK via Tecnativa docker-socket-proxy (never mount raw socket).
- CI: GitHub Actions (`.github/workflows/ci.yml`) — backend pytest on 3.11, frontend `tsc --noEmit` + `next build`, backend image build.

# LORE & AESTHETIC (UI/UX)
- Theme: Cyberpunk, clean hacker aesthetic (dark grays, neon green/blue accents).
- Terminology used in the UI:
  - Challenges = "Jutsus"
  - Active Containers = "Shadow Clones"
  - Auto-Killer = "The Reaper"
  - Global settings = "Chakra Control"

# SECURITY ARCHITECTURE
- Admin password: bcrypt-hashed, stored as ADMIN_PASSWORD_HASH env var (single-quoted in .env so Docker Compose doesn't interpolate the `$` segments).
- Session auth: HTTP-only SameSite=Lax cookie via itsdangerous URLSafeTimedSerializer.
- CSRF: Double-submit cookie pattern (kage_csrf cookie + X-CSRF-Token header) on every state-mutating admin route.
- Public API: Static X-Kage-Key header validation. The key is a single shared secret and may be exposed client-side by some integrations — treat it as low-trust.
- Container ownership: every operation on a caller-supplied container ID/name (logs, kill, extend) is restricted to containers carrying the `spawner=kage-protocol` label. Foreign containers return 404.
- Docker: Socket proxy restricts API access (no exec, no volume, no build, no swarm).
- Containers: Dedicated kage-challenges network, CPU + RAM limits enforced per Jutsu.
- Rate limiting: In-memory sliding window per API key + client IP (separate buckets for spawn and kill), with stale-key cleanup.

# DATABASE SCHEMA (SQLite)
1. ChallengeConfig (Jutsu): id, name, description, docker_image_name, internal_ports (JSON list), ram_limit, cpu_limit.
2. GlobalSettings (Chakra Control): default_ttl_minutes, port_range_start, port_range_end.
3. ContainerExpiry: container_id (PK, full ID), expires_at. Authoritative, mutable expiry — Docker labels are immutable, so TTL extensions live here; the `expires_at` label is the fallback.
4. AuditLog: id, created_at, actor, action, target, meta (JSON). Pruned after AUDIT_RETENTION_DAYS.

# BACKEND ARCHITECTURE
- app/main.py: FastAPI app with lifespan (startup: DB init, Docker client, challenge network, Reaper task; shutdown: cancel Reaper). CORS exposes the X-Total-Count header.
- app/core/config.py: Env-based frozen Settings (lru_cached) with _require_env() for critical vars.
- app/core/security.py: Session token creation/verification.
- app/core/csrf.py: Double-submit cookie CSRF protection.
- app/core/deps.py: FastAPI dependencies (get_current_admin, require_api_key, require_csrf).
- app/core/rate_limit.py: Sliding window rate limiter with cleanup.
- app/core/logging.py: Structured logging (JSON/dev formatters).
- app/db.py: get_session (FastAPI dependency) and session_scope() (context manager for background tasks and streams).
- app/services/docker_service.py: Singleton DockerService — labelled spawning, port allocation, `_get_kage_container()` ownership check, concurrent stats sampling with a 5s cache, image pulls (docker-py's reference parser).
- app/services/lifecycle_service.py: ContainerExpiry get/set/remove helpers.
- app/services/settings_service.py: Shared get_global_settings() helper.
- app/services/audit_service.py: log_event() (commits) and prune_audit_log().
- app/routes/auth.py: Login (bcrypt) / Logout with CSRF cookie management.
- app/routes/admin.py: Jutsu CRUD, settings, Docker ops, admin spawn, extend TTL, paginated audit log + summary, and the SSE streams (`/stream`, container log tail, image pull progress).
- app/routes/public.py: Platform-agnostic spawn/kill API with optional metadata (platform, team_id, player_id).
- app/api.py: Router mounting + GET /api/health endpoint.
- app/reaper.py: Every 60s kills expired clones (DB override, else label), audits each as `reap`, prunes orphaned expiry rows, and applies audit retention hourly.

# FRONTEND ARCHITECTURE
- src/lib/api.ts: fetch wrapper — cookies, CSRF header on mutations, FastAPI error formatting, apiRequestWithHeaders for pagination totals.
- src/lib/useSnapshotStream.ts / useLogStream.ts: EventSource hooks; the snapshot stream falls back to polling.
- src/components/dashboard-shell.tsx: Layout with the collapsible mobile sidebar.
- src/lib/integration-snippets.ts: Snippets on the Documentation page — must mirror backend/INTEGRATION.md exactly.
- middleware.ts: Redirects /dashboard/* to /login when no session cookie is present (presence check only).

# TESTING
- backend/tests/ runs against an in-memory fake *docker client* (tests/support.py) installed under the real DockerService, so service logic is exercised. No Docker needed.
- conftest.py pins every env var before importing the app (config.py calls load_dotenv) and resets the DB, rate limiter, and fake daemon per test.
- SSE endpoints are tested by calling the route coroutine directly (support.collect_sse); TestClient buffers infinite streams.
- Run: `cd backend && pip install -r requirements-dev.txt && pytest` on Python 3.11.

# DEVELOPMENT RULES
- Build the project in two distinct folders: /frontend and /backend.
- Do not hallucinate external API calls; everything runs locally on the host's Docker daemon.
- The backend connects to Docker via the socket proxy (DOCKER_HOST env var), never directly.
- Write modular, clean, and well-commented code.
- All sensitive config must use _require_env() — no hardcoded fallbacks for secrets.
- All state-mutating admin endpoints must have CSRF protection.
- Use get_docker_service() singleton, never instantiate DockerService directly.
- Use get_global_settings(session) from settings_service, never duplicate the helper.
- Never call `client.containers.get()` on a caller-supplied ID — go through `_get_kage_container()` so foreign containers stay off-limits.
- Use the full container ID returned by `kill_container()` for expiry cleanup and audit targets; callers may pass short IDs or names.
- Read clone expiry via lifecycle_service (override first, label as fallback); record it on every spawn.
- `log_event()` commits, which expires ORM instances — `session.refresh()` anything you return afterwards or it serializes as `{}`.
- Wrap blocking Docker calls in `asyncio.to_thread()` inside async code (the Reaper and SSE streams share the event loop).
- Add or update tests for behavior changes; CI must stay green.
- Keep README.md, backend/INTEGRATION.md, and the in-app Documentation page in sync when the API or configuration changes.
