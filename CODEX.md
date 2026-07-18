You are an expert full-stack developer and DevOps engineer maintaining "The Kage Protocol" — a production-grade, platform-agnostic CTF Challenge Infrastructure Dashboard.

This application acts as a Command Center to dynamically spawn, manage, and kill isolated Docker containers (challenges) on-demand for players from any CTF platform (CTFd, TryHackMe, custom).

# TECH STACK
- Frontend: Next.js 14 (App Router), React 18, Tailwind CSS 3, TypeScript. Dark mode cyberpunk aesthetic.
- Backend: Python 3.11, FastAPI (with lifespan context manager).
- Database: SQLite (via SQLModel / SQLAlchemy) for simple, local persistence.
- Infrastructure: Docker Python SDK via Tecnativa docker-socket-proxy (never mount raw socket).

# LORE & AESTHETIC (UI/UX)
- Theme: Cyberpunk, clean hacker aesthetic (dark grays, neon green/blue accents).
- Terminology used in the UI:
  - Challenges = "Jutsus"
  - Active Containers = "Shadow Clones"
  - Auto-Killer = "The Reaper"

# SECURITY ARCHITECTURE
- Admin password: bcrypt-hashed, stored as ADMIN_PASSWORD_HASH env var.
- Session auth: HTTP-only cookie via itsdangerous URLSafeTimedSerializer.
- CSRF: Double-submit cookie pattern (kage_csrf cookie + X-CSRF-Token header).
- Public API: Static X-Kage-Key header validation.
- Docker: Socket proxy restricts API access (no exec, no volume, no swarm).
- Containers: Dedicated kage-challenges network, CPU + RAM limits enforced.
- Rate limiting: In-memory sliding window with automatic stale key cleanup.

# DATABASE SCHEMA (SQLite)
1. ChallengeConfig (Jutsu): id, name, description, docker_image_name, internal_ports (JSON list), ram_limit, cpu_limit.
2. GlobalSettings (Chakra Control): default_ttl_minutes, port_range_start, port_range_end.
3. AuditLog: id, created_at, actor, action, target, meta (JSON).

# BACKEND ARCHITECTURE
- app/main.py: FastAPI app with lifespan context manager (startup: DB init, Docker client, Reaper task; shutdown: cleanup).
- app/core/config.py: Env-based settings with _require_env() for critical vars.
- app/core/security.py: Session token creation/verification.
- app/core/csrf.py: Double-submit cookie CSRF protection.
- app/core/deps.py: FastAPI dependencies (get_current_admin, require_api_key, require_csrf).
- app/core/rate_limit.py: Sliding window rate limiter with cleanup.
- app/core/logging.py: Structured logging (JSON/dev formatters).
- app/services/docker_service.py: Singleton DockerService with challenge network, CPU limits, health ping.
- app/services/settings_service.py: Shared get_global_settings() helper.
- app/services/audit_service.py: Audit event writer.
- app/routes/auth.py: Login (bcrypt) / Logout with CSRF cookie management.
- app/routes/admin.py: CRUD for jutsus, settings, Docker ops, audit log. CSRF on mutations.
- app/routes/public.py: Platform-agnostic spawn/kill API with optional metadata (platform, team_id, player_id).
- app/api.py: Router mounting + GET /api/health endpoint.
- app/reaper.py: Background task with error handling and structured logging.
- app/db.py: Session factory using yield + try/finally.

# DEVELOPMENT RULES
- Build the project in two distinct folders: /frontend and /backend.
- Do not hallucinate external API calls; everything runs locally on the host's Docker daemon.
- The backend connects to Docker via the socket proxy (DOCKER_HOST env var), never directly.
- Write modular, clean, and heavily commented code.
- All sensitive config must use _require_env() — no hardcoded fallbacks for secrets.
- All state-mutating admin endpoints must have CSRF protection.
- Use get_docker_service() singleton, never instantiate DockerService directly.
- Use get_global_settings(session) from settings_service, never duplicate the helper.
