# The Kage Protocol — Frontend

The admin dashboard for The Kage Protocol: a cyberpunk-styled command center for managing **Jutsus** (challenge definitions), watching **Shadow Clones** (running containers) in real time, and configuring **Chakra Control** (global spawn settings).

See the [root README](../README.md) for the full system, backend setup, and configuration.

## Pages

| Route | Page |
|---|---|
| `/login` | Admin sign-in |
| `/dashboard` | Live telemetry (clones, CPU, memory) with sparklines and the recent-activity feed |
| `/dashboard/jutsus` | Jutsu Library — manage challenges, pull images with live progress, spawn test clones |
| `/dashboard/clones` | Active Clones — live table plus a detail drawer with streaming logs, stats, port copy, TTL extension, and kill |
| `/dashboard/audit` | Audit Log — paginated, filterable by action, with whole-log summary counts |
| `/dashboard/settings` | Default TTL and host-port range |
| `/dashboard/docs` | In-app API reference and copy-ready integration snippets |

## Getting Started

### With Docker (default)

`docker compose up -d --build` from the repository root builds and starts the dashboard together with the backend, at `http://localhost:8082` (the container listens on 3000; Compose publishes it on 8082). The image is built from `frontend/Dockerfile` (Next.js standalone output, runs as a non-root user).

The backend URL is inlined into the browser bundle **at build time** from the `KAGE_PUBLIC_API_URL` Compose variable (default `http://localhost:8081`). Rebuild after changing it.

### Without Docker (development, hot reload)

Requires **Node.js 18.17+** and a running backend. The dev server uses port 3000, so it can run alongside the Compose dashboard on 8082.

```bash
npm install
cp .env.example .env
npm run dev
```

Then open `http://localhost:3000` and sign in with the admin credentials configured on the backend.

## Configuration

Set in `.env`:

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8081` | Backend URL, as reachable from the admin's browser |
| `NEXT_PUBLIC_SESSION_COOKIE_NAME` | `kage_session` | Must match the backend's `SESSION_COOKIE_NAME` |

The backend's `CORS_ORIGINS` must include this app's origin: `http://localhost:8082` for the Docker dashboard, `http://localhost:3000` for `npm run dev`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npx tsc --noEmit` | Type-check (runs in CI) |

`npm run lint` is defined, but ESLint isn't configured yet — running it starts Next.js's interactive ESLint setup.

## How It Talks to the Backend

- **Auth:** the backend sets an HTTP-only session cookie on login plus a readable `kage_csrf` cookie. `src/lib/api.ts` sends cookies on every request (`credentials: "include"`) and adds the `X-CSRF-Token` header to state-changing requests. A `401` redirects to `/login`.
- **Route guard:** `src/middleware.ts` redirects `/dashboard/*` to `/login` when no session cookie is present. It only checks that the cookie exists — the backend validates it on every API call.
- **Live data:** the Dashboard and Active Clones pages subscribe to `/api/admin/stream` (Server-Sent Events) through `useSnapshotStream`, falling back to polling if the stream can't connect. The badge in the page header shows which mode is active. Container logs (`useLogStream`) and image pulls also stream over SSE.
- **Same-site requirement:** the session cookie is `SameSite=Lax`, so serve the dashboard and API from the same site (e.g. `kage.example.com` and `api.kage.example.com`).

## Project Structure

```text
src/
  app/                      App Router pages (login, dashboard/*)
  components/
    ui/                     Primitives: button, card, dialog, drawer, table, sparkline, …
    clone-detail-drawer.tsx Active Clones detail panel
    pull-image-dialog.tsx   Streaming image-pull dialog
    dashboard-shell.tsx     Layout with the collapsible mobile sidebar
    icons.tsx               Dependency-free inline SVG icon set
  lib/
    api.ts                  Fetch wrapper (cookies, CSRF, error formatting)
    useSnapshotStream.ts    Live container/stats stream with polling fallback
    useLogStream.ts         Live container log stream
    integration-snippets.ts Snippets shown on the Documentation page
    types.ts                Shared API types
  middleware.ts             Session-cookie route guard (must live in src/ — Next.js ignores it at the project root)
```

`src/lib/integration-snippets.ts` mirrors the code blocks in `backend/INTEGRATION.md` — update both together.
