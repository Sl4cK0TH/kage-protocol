# Integration Guide — The Kage Protocol

The Kage Protocol exposes a platform-agnostic public API for spawning and killing challenge containers. This guide covers integration with CTFd, TryHackMe (self-hosted), and any custom platform.

---

## Public API Reference

### Spawn a Challenge

```
POST /api/spawn/{challenge_id}
Header: X-Kage-Key: <your-api-key>
Content-Type: application/json
```

**Optional request body:**
```json
{
  "platform": "ctfd",
  "team_id": "team-42",
  "player_id": "user-7"
}
```

**Response:**
```json
{
  "container_id": "abc123...",
  "host": "your-host.com",
  "port": 31337,
  "port_map": {"80/tcp": 31337},
  "expires_at": 1719100000
}
```

### Stop a Challenge

```
DELETE /api/spawn/{container_id}
Header: X-Kage-Key: <your-api-key>
```

---

## CTFd Integration

Use CTFd's dynamic challenge type or a plugin to call the Kage API when a player starts a challenge.

### Python Snippet (requests)

```python
import os
import requests

API_BASE = os.getenv("KAGE_API_BASE", "http://localhost:8000")
KAGE_KEY = os.getenv("KAGE_API_KEY", "change-me")
CHALLENGE_ID = 1

response = requests.post(
    f"{API_BASE}/api/spawn/{CHALLENGE_ID}",
    headers={"X-Kage-Key": KAGE_KEY},
    json={"platform": "ctfd", "team_id": "my-team"},
    timeout=10,
)
response.raise_for_status()
data = response.json()
print(f"Connect to: {data['host']}:{data['port']}")
```

### CTFd Dynamic Challenge Handler

```python
def get_challenge_instance(team_id, challenge_id):
    api_base = "http://kage-protocol-backend:8000"
    api_key = "change-me"
    resp = requests.post(
        f"{api_base}/api/spawn/{challenge_id}",
        headers={"X-Kage-Key": api_key},
        json={"platform": "ctfd", "team_id": str(team_id)},
        timeout=10,
    )
    resp.raise_for_status()
    payload = resp.json()
    return f"{payload['host']}:{payload['port']}"
```

---

## TryHackMe (Self-Hosted) Integration

TryHackMe doesn't expose a public spawner API — their platform manages VMs internally. The Kage Protocol serves as your **independent challenge spawner** alongside THM.

### Option 1: Room Description Link

In your THM room task description, direct players to a hosted landing page:

```markdown
## Start the Challenge

Visit [https://your-domain.com/start?challenge=1](https://your-domain.com/start?challenge=1)
to spawn your challenge instance. You'll receive a HOST:PORT to connect to.
```

### Option 2: Self-Hosted Landing Page

Create a simple web page that calls the Kage API on button click:

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

### Option 3: curl / CLI (for workshops)

```bash
curl -sS -X POST "https://your-kage-host.com/api/spawn/1" \
  -H "X-Kage-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"platform": "tryhackme", "player_id": "student-01"}' | jq
```

---

## Generic Webhook Integration

Any platform can integrate with Kage by calling the spawn/kill endpoints. The optional `platform`, `team_id`, and `player_id` fields in the request body are recorded in the audit log for tracking.

### Spawn

```bash
curl -X POST "http://localhost:8000/api/spawn/1" \
  -H "X-Kage-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"platform": "custom", "team_id": "team-1", "player_id": "player-42"}'
```

### Kill

```bash
curl -X DELETE "http://localhost:8000/api/spawn/<container_id>" \
  -H "X-Kage-Key: your-api-key"
```

---

## Rate Limiting

Spawn and kill requests are rate-limited per API key + client IP. Defaults:
- **30 requests** per **60-second** window

Configure via environment variables:
- `SPAWN_RATE_LIMIT_COUNT`
- `SPAWN_RATE_LIMIT_WINDOW_SECONDS`

Exceeding the limit returns `HTTP 429 Too Many Requests`.
