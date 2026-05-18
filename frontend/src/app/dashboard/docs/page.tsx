export default function DocsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl text-white">Official Documentation</h2>
        <p className="text-sm text-slate-400">Integration notes, endpoints, and examples.</p>
      </div>

      <section className="panel rounded-2xl p-6 space-y-4 text-sm text-slate-300">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Public Spawn Endpoint</p>
          <p className="mt-2 font-mono text-xs text-neon">POST /api/spawn/{`{challenge_id}`}</p>
          <p className="mt-2 text-xs text-slate-400">Header: X-Kage-Key: &lt;api-key&gt;</p>
          <p className="mt-2 text-xs text-slate-500">Response includes host, port, port_map, and expires_at.</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin API Base</p>
          <p className="mt-2 font-mono text-xs text-neon">/api/admin/*</p>
          <p className="mt-2 text-xs text-slate-400">Requires HTTP-only session cookie.</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Rate Limit</p>
          <p className="mt-2 text-xs text-slate-400">
            Spawn calls are rate-limited by API key and client IP. Configure with
            SPAWN_RATE_LIMIT_COUNT and SPAWN_RATE_LIMIT_WINDOW_SECONDS.
          </p>
        </div>
      </section>

      <section className="panel rounded-2xl p-6 space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">CTFd Integration Snippet</p>
        <pre className="whitespace-pre-wrap rounded-lg bg-ink/70 p-4 text-xs text-slate-200">
{`import os
import requests

API_BASE = os.getenv("KAGE_API_BASE", "http://localhost:8000")
KAGE_KEY = os.getenv("KAGE_API_KEY", "change-me")
CHALLENGE_ID = 1

response = requests.post(
    f"{API_BASE}/api/spawn/{CHALLENGE_ID}",
    headers={"X-Kage-Key": KAGE_KEY},
    timeout=10,
)
response.raise_for_status()
print(response.json())`}
        </pre>
      </section>

      <section className="panel rounded-2xl p-6 space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">CTFd Handler Example</p>
        <pre className="whitespace-pre-wrap rounded-lg bg-ink/70 p-4 text-xs text-slate-200">
{`def get_challenge_instance(team_id, challenge_id):
    api_base = "http://kage-protocol-backend:8000"
    api_key = "change-me"
    resp = requests.post(
        f"{api_base}/api/spawn/{challenge_id}",
        headers={"X-Kage-Key": api_key},
        timeout=10,
    )
    resp.raise_for_status()
    payload = resp.json()
    return f"{payload['host']}:{payload['port']}"`}
        </pre>
      </section>
    </div>
  );
}
