/**
 * Copy-ready integration snippets shown on the in-app Documentation page.
 *
 * These mirror the code blocks in backend/INTEGRATION.md exactly — keep the
 * two in sync when either changes.
 */

export const INTEGRATION_PLATFORMS = ["Generic", "CTFd", "TryHackMe"] as const;
export type IntegrationPlatform = (typeof INTEGRATION_PLATFORMS)[number];

export interface IntegrationSnippet {
  label: string;
  language: string;
  description: string;
  code: string;
  /** Shown as a caution beneath the snippet. */
  warning?: string;
}

export const INTEGRATION_SNIPPETS: Record<IntegrationPlatform, IntegrationSnippet> = {
  Generic: {
    label: "curl / Any Platform",
    language: "bash",
    description: "Spawn and stop clones from any platform that can make HTTP requests. Keep the key in environment variables.",
    code: String.raw`export KAGE_API_BASE=https://your-kage-host.com
export KAGE_API_KEY=your-api-key

# Spawn
curl -sS -X POST "$KAGE_API_BASE/api/spawn/1" \
  -H "X-Kage-Key: $KAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"platform": "custom", "team_id": "team-1", "player_id": "player-42"}'

# Stop
curl -sS -X DELETE "$KAGE_API_BASE/api/spawn/<container_id>" \
  -H "X-Kage-Key: $KAGE_API_KEY"`
  },
  CTFd: {
    label: "CTFd (server-side)",
    language: "python",
    description:
      "Call Kage from the CTFd server — e.g. a plugin or custom challenge type — so the key never reaches players. Persist each team's container_id so you can stop it later.",
    code: String.raw`import os

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
        resp.raise_for_status()`
  },
  TryHackMe: {
    label: "TryHackMe landing page",
    language: "html",
    description:
      "A minimal page your THM room can link to. It calls Kage straight from the browser, so its origin must be listed in CORS_ORIGINS.",
    code: `<button id="start-btn">Start Challenge</button>
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
      \`Connect to: \${data.host}:\${data.port}\`;
  });
</script>`,
    warning:
      "This page runs in the player's browser, so the API key is visible in its source. Anyone who has it can spawn clones and stop any Kage clone (never other containers). Use it only for private workshops, or put a small server-side proxy in front of Kage for public events."
  }
};
