# Integration Guide — The Kage Protocol

The Kage Protocol exposes a small, platform-agnostic public API for starting and stopping challenge containers ("Shadow Clones"). This guide covers the API itself and integration with CTFd, TryHackMe, and any custom platform.

---

## How It Works

1. **Spawn.** Your platform calls `POST /api/spawn/{challenge_id}` when a player starts a challenge. Kage starts a container from that Jutsu and returns a `host`, a `port`, the `container_id`, and an `expires_at` timestamp.
2. **Connect.** Show the player `host:port`. Kage publishes the challenge's internal ports on free host ports within the range configured in **Settings**.
3. **Stop or expire.** Your platform can stop the clone with `DELETE /api/spawn/{container_id}` (for example when the player solves it or clicks *Stop*). Otherwise **the Reaper** removes it after `expires_at`. The Reaper runs every 60 seconds, so a clone can outlive its expiry by up to about a minute.

Admins can extend a running clone's TTL from **Active Clones** in the dashboard; the Reaper honors the new expiry.

**Store the `container_id`** from the spawn response (per team or player) — it's what you need to stop that clone later.

The `challenge_id` is the Jutsu's **ID**, shown on its card in the **Jutsu Library**.

---

## Public API Reference

### Authentication

Every public request needs the API key configured as `KAGE_API_KEY` on the backend:

```
X-Kage-Key: <your-api-key>
```

The API key only works on the public endpoints below — it is not accepted by the admin API.

### Spawn a Challenge

```
POST /api/spawn/{challenge_id}
X-Kage-Key: <your-api-key>
Content-Type: application/json
```

**Optional request body** — every field is optional and is recorded in the audit log so you can trace clones back to teams and players:

```json
{
  "platform": "ctfd",
  "team_id": "team-42",
  "player_id": "user-7"
}
```

**`200 OK` response:**

```json
{
  "container_id": "3f9a1c...e07b",
  "host": "ctf.example.com",
  "port": 31337,
  "port_map": { "80/tcp": 31337 },
  "expires_at": 1719100000
}
```

| Field | Description |
|---|---|
| `container_id` | Full container ID. Keep it to stop the clone later. |
| `host` | Hostname players connect to (the backend's `PUBLIC_HOST`). |
| `port` | Host port for the Jutsu's **first** internal port. |
| `port_map` | Every internal port (`"<port>/tcp"`) mapped to its host port — use this for multi-port challenges. |
| `expires_at` | Unix timestamp (seconds) when the clone becomes eligible for reaping, based on the default TTL in **Settings**. |

**Errors:**

| Status | Meaning |
|---|---|
| `401` | Missing or invalid `X-Kage-Key`. |
| `404` | No Jutsu with that `challenge_id`. |
| `409` | Not enough free host ports in the configured range. Widen the range in **Settings** or stop some clones. |
| `422` | Malformed request body. |
| `429` | Rate limit exceeded (see [Rate Limiting](#rate-limiting)). |
| `500` | Docker failed to start the container — most often an image that couldn't be pulled. |

> If the Jutsu's image isn't on the host yet, Docker pulls it during the spawn request, so the first spawn can be slow or time out. Pull images ahead of time with the **Pull** button in the Jutsu Library.

### Stop a Challenge

```
DELETE /api/spawn/{container_id}
X-Kage-Key: <your-api-key>
```

Use the `container_id` from the spawn response. A short container ID or the container's name also works.

**`200 OK` response:**

```json
{ "status": "success", "message": "Challenge terminated." }
```

**Errors:**

| Status | Meaning |
|---|---|
| `401` | Missing or invalid `X-Kage-Key`. |
| `404` | No such container, it was already stopped or reaped, or it isn't a Kage clone. |
| `429` | Rate limit exceeded. |

Only containers that Kage spawned can be stopped. Requests naming any other container on the host get a `404`.

### Quick Test

With the backend running and at least one Jutsu created, `backend/scripts/spawn_test.sh` spawns a clone and prints the response (requires `jq`):

```bash
API_BASE=http://localhost:8000 KAGE_KEY=your-api-key CHALLENGE_ID=1 bash backend/scripts/spawn_test.sh
```

---

## CTFd Integration

Call Kage **from the CTFd server** — for example from a CTFd plugin or a custom challenge type — so the API key never reaches players' browsers. Keep the key in the server's environment, not in code.

```python
import os

import requests

KAGE_API_BASE = os.environ["KAGE_API_BASE"]  # e.g. http://kage-backend:8000
KAGE_API_KEY = os.environ["KAGE_API_KEY"]


def start_instance(challenge_id: int, team_id: str) -> dict:
    """Spawn a clone for a team. Persist the returned container_id."""
    resp = requests.post(
        f"{KAGE_API_BASE}/api/spawn/{challenge_id}",
        headers={"X-Kage-Key": KAGE_API_KEY},
        json={"platform": "ctfd", "team_id": str(team_id)},
        timeout=60,  # the first spawn of an image may include a pull
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "container_id": data["container_id"],
        "connection": f"{data['host']}:{data['port']}",
        "expires_at": data["expires_at"],
    }


def stop_instance(container_id: str) -> None:
    """Stop a team's clone early (e.g. on solve). Already-gone clones are fine."""
    resp = requests.delete(
        f"{KAGE_API_BASE}/api/spawn/{container_id}",
        headers={"X-Kage-Key": KAGE_API_KEY},
        timeout=10,
    )
    if resp.status_code != 404:
        resp.raise_for_status()
```

> All spawns from a server-side integration come from the CTFd server's IP, so the rate limit applies to your whole event at once. Raise `SPAWN_RATE_LIMIT_COUNT` to cover the burst of teams starting simultaneously.

---

## TryHackMe Integration

TryHackMe doesn't expose a spawner API — it manages its own VMs. Kage runs alongside it as an **independent challenge spawner** that your room links to.

### Option 1: Room Description Link

Point players from the room's task description to a landing page you host:

```markdown
## Start the Challenge

Visit [https://your-domain.com/start?challenge=1](https://your-domain.com/start?challenge=1)
to spawn your challenge instance. You'll receive a HOST:PORT to connect to.
```

Ideally that page calls a small backend of yours, which in turn calls Kage with the key (the same pattern as the CTFd example).

### Option 2: Self-Hosted Landing Page

The simplest possible page calls Kage directly from the browser:

```html
<button id="start-btn">Start Challenge</button>
<p id="result"></p>

<script>
  document.getElementById("start-btn").addEventListener("click", async () => {
    const res = await fetch("https://your-kage-host.com/api/spawn/1", {
      method: "POST",
      headers: {
        "X-Kage-Key": "your-api-key",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ platform: "tryhackme" })
    });
    const data = await res.json();
    document.getElementById("result").textContent =
      `Connect to: ${data.host}:${data.port}`;
  });
</script>
```

> [!WARNING]
> This script runs in the player's browser, so **the API key is visible in the page source**. Only use it for private workshops or trusted audiences — see [Security Notes](#security-notes). A browser-based page also needs its origin added to `CORS_ORIGINS`.

### Option 3: curl / CLI (for workshops)

```bash
curl -sS -X POST "$KAGE_API_BASE/api/spawn/1" \
  -H "X-Kage-Key: $KAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"platform": "tryhackme", "player_id": "student-01"}' | jq
```

---

## Generic Integration

Any platform that can make HTTP requests can integrate. Keep the key in environment variables rather than in scripts:

```bash
export KAGE_API_BASE=https://your-kage-host.com
export KAGE_API_KEY=your-api-key

# Spawn
curl -sS -X POST "$KAGE_API_BASE/api/spawn/1" \
  -H "X-Kage-Key: $KAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"platform": "custom", "team_id": "team-1", "player_id": "player-42"}'

# Stop
curl -sS -X DELETE "$KAGE_API_BASE/api/spawn/<container_id>" \
  -H "X-Kage-Key: $KAGE_API_KEY"
```

---

## Rate Limiting

Public requests are rate-limited per **API key + client IP**, with separate limits for spawning and stopping. Each allows `SPAWN_RATE_LIMIT_COUNT` requests (default **30**) per `SPAWN_RATE_LIMIT_WINDOW_SECONDS` (default **60**). Exceeding a limit returns `429 Too Many Requests`.

- **Server-side integrations** send everything from one IP, so the limit is effectively event-wide — size it for your peak.
- **Behind a reverse proxy**, all clients share the proxy's IP unless uvicorn trusts the proxy's `X-Forwarded-For` header (`--forwarded-allow-ips`).
- Limits are kept in memory: they reset when the backend restarts.

---

## Security Notes

- **The API key is a single shared secret** for every integration. Anyone who has it can spawn clones (bounded by the rate limit and port range) and stop any Kage clone. It can't touch other containers on the host, and it doesn't grant access to the admin API.
- **Keep the key server-side.** Any page or app that embeds it (like the TryHackMe Option 2 snippet) makes it public.
- **Rotating the key:** change `KAGE_API_KEY` in `backend/.env` and restart the backend (`docker compose up -d`). Every integration needs the new key at the same time.
- **Use HTTPS** in production so the key isn't sent in plaintext.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `401` on every request | Header must be exactly `X-Kage-Key`, and the value must match `KAGE_API_KEY`. Restart the backend after changing `.env`. |
| `404` on spawn | Wrong `challenge_id` — check the ID on the Jutsu's card. |
| `409 No available ports` | The port range in **Settings** is too narrow or fully used. Widen it or stop clones. |
| `429` during an event | Raise `SPAWN_RATE_LIMIT_COUNT` — see [Rate Limiting](#rate-limiting). |
| First spawn is slow, or returns `500` | The image wasn't on the host and was pulled during the request (or couldn't be). Pull it from the Jutsu Library first. |
| Players can't connect to `host:port` | `PUBLIC_HOST` must be an address players can reach, and the host's firewall must allow the configured port range. |
| A clone disappeared | Its TTL expired and the Reaper removed it. Extend it from **Active Clones**, or raise the default TTL in **Settings**. |
