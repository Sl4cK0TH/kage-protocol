"use client";

import { useState } from "react";

const platforms = ["Generic", "CTFd", "TryHackMe"] as const;
type Platform = typeof platforms[number];

const snippets: Record<Platform, { label: string; code: string }> = {
  Generic: {
    label: "curl / Any Platform",
    code: `curl -X POST "http://localhost:8000/api/spawn/1" \\
  -H "X-Kage-Key: your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{"platform": "custom", "team_id": "team-1"}' | jq`,
  },
  CTFd: {
    label: "CTFd Dynamic Handler",
    code: `import os, requests

API_BASE = os.getenv("KAGE_API_BASE", "http://localhost:8000")
KAGE_KEY = os.getenv("KAGE_API_KEY", "change-me")

def get_challenge_instance(team_id, challenge_id):
    resp = requests.post(
        f"{API_BASE}/api/spawn/{challenge_id}",
        headers={"X-Kage-Key": KAGE_KEY},
        json={"platform": "ctfd", "team_id": str(team_id)},
        timeout=10,
    )
    resp.raise_for_status()
    payload = resp.json()
    return f"{payload['host']}:{payload['port']}"`,
  },
  TryHackMe: {
    label: "TryHackMe Self-Hosted",
    code: `<!-- Landing page for THM room link -->
<button id="start-btn">Start Challenge</button>
<p id="result"></p>

<script>
document.getElementById("start-btn")
  .addEventListener("click", async () => {
    const res = await fetch(
      "https://your-kage-host.com/api/spawn/1",
      {
        method: "POST",
        headers: {
          "X-Kage-Key": "your-api-key",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ platform: "tryhackme" })
      }
    );
    const data = await res.json();
    document.getElementById("result").textContent =
      "Connect to: " + data.host + ":" + data.port;
  });
</script>`,
  },
};

export default function DocsPage() {
  const [active, setActive] = useState<Platform>("Generic");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl text-white">Official Documentation</h2>
        <p className="text-sm text-zinc-500">Integration notes, endpoints, and platform-specific examples.</p>
      </div>

      {/* API Reference */}
      <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-6 space-y-4 text-sm text-zinc-300">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Public Spawn Endpoint</p>
          <p className="mt-2 font-mono text-xs text-emerald-300">POST /api/spawn/{`{challenge_id}`}</p>
          <p className="mt-2 text-xs text-zinc-500">Header: X-Kage-Key: &lt;api-key&gt;</p>
          <p className="mt-2 text-xs text-zinc-500">
            Optional JSON body: {`{ "platform": "ctfd|tryhackme|custom", "team_id": "...", "player_id": "..." }`}
          </p>
          <p className="mt-2 text-xs text-zinc-500">Response includes host, port, port_map, and expires_at.</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Public Kill Endpoint</p>
          <p className="mt-2 font-mono text-xs text-emerald-300">DELETE /api/spawn/{`{container_id}`}</p>
          <p className="mt-2 text-xs text-zinc-500">Header: X-Kage-Key: &lt;api-key&gt;</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Admin API Base</p>
          <p className="mt-2 font-mono text-xs text-emerald-300">/api/admin/*</p>
          <p className="mt-2 text-xs text-zinc-500">Requires HTTP-only session cookie + CSRF token header.</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Health Check</p>
          <p className="mt-2 font-mono text-xs text-emerald-300">GET /api/health</p>
          <p className="mt-2 text-xs text-zinc-500">Returns Docker and database connectivity status.</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Rate Limit</p>
          <p className="mt-2 text-xs text-zinc-500">
            Spawn calls are rate-limited by API key and client IP. Configure with
            SPAWN_RATE_LIMIT_COUNT and SPAWN_RATE_LIMIT_WINDOW_SECONDS.
          </p>
        </div>
      </div>

      {/* Platform Tabs */}
      <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-6 space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Integration Snippets</p>
        <div className="flex gap-2">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setActive(p)}
              className={`rounded-lg px-4 py-2 text-xs font-medium transition ${
                active === p
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                  : "text-zinc-400 hover:text-emerald-200 hover:bg-zinc-900 border border-zinc-800"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="text-sm text-zinc-400">{snippets[active].label}</p>
        <pre className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-4 text-xs text-zinc-200 border border-zinc-800">
          {snippets[active].code}
        </pre>
      </div>

      {/* TryHackMe specific note */}
      <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-6 space-y-3 text-sm text-zinc-300">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">TryHackMe Note</p>
        <p>
          TryHackMe doesn&apos;t expose a public spawner API — their platform manages VMs internally.
          The Kage Protocol serves as your <strong className="text-emerald-300">independent challenge spawner</strong> alongside THM.
        </p>
        <p className="text-zinc-500 text-xs">
          Options: Link to a self-hosted landing page from your THM room description, or provide a direct curl command for CLI-based workshops.
        </p>
      </div>
    </div>
  );
}
