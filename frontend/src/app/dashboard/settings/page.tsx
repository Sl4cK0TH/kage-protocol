"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { GlobalSettings } from "@/lib/types";
import { Button, Input, Panel } from "@/components/ui";

export default function SettingsPage() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [form, setForm] = useState({
    default_ttl_minutes: "30",
    port_range_start: "30000",
    port_range_end: "40000"
  });

  useEffect(() => {
    const load = async () => {
      const data = await apiRequest<GlobalSettings>("/api/admin/settings");
      setSettings(data);
      setForm({
        default_ttl_minutes: String(data.default_ttl_minutes),
        port_range_start: String(data.port_range_start),
        port_range_end: String(data.port_range_end)
      });
    };

    load();
  }, []);

  const handleSave = async () => {
    const payload = {
      default_ttl_minutes: Number(form.default_ttl_minutes),
      port_range_start: Number(form.port_range_start),
      port_range_end: Number(form.port_range_end)
    };
    await apiRequest("/api/admin/settings", { method: "PUT", body: payload });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-white">Chakra Control</h2>
        <p className="text-sm text-slate-400">Tune the global spawn parameters.</p>
      </div>

      <Panel title="Global Settings">
        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label="Default TTL (minutes)"
            value={form.default_ttl_minutes}
            onChange={(event) => setForm({ ...form, default_ttl_minutes: event.target.value })}
          />
          <Input
            label="Port Range Start"
            value={form.port_range_start}
            onChange={(event) => setForm({ ...form, port_range_start: event.target.value })}
          />
          <Input
            label="Port Range End"
            value={form.port_range_end}
            onChange={(event) => setForm({ ...form, port_range_end: event.target.value })}
          />
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
        {settings ? null : <p className="text-sm text-slate-500 mt-4">Loading...</p>}
      </Panel>

      <Panel title="Official Documentation">
        <div className="space-y-4 text-sm text-slate-300">
          <p>
            The Kage Protocol exposes a single public spawn endpoint for CTFd or external frontends.
            All admin routes require the HTTP-only session cookie.
          </p>
          <Link className="text-neon hover:text-electric" href="/dashboard/docs">
            Open full documentation
          </Link>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-700/50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Spawn Endpoint</p>
              <p className="mt-2 font-mono text-xs text-neon">POST /api/spawn/{`{challenge_id}`}</p>
              <p className="mt-2 text-xs text-slate-400">Header: X-Kage-Key: &lt;api-key&gt;</p>
            </div>
            <div className="rounded-xl border border-slate-700/50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin API Base</p>
              <p className="mt-2 font-mono text-xs text-neon">/api/admin/*</p>
              <p className="mt-2 text-xs text-slate-400">Requires HTTP-only session cookie</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quick Example</p>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-ink/70 p-3 text-xs text-slate-200">
{`curl -X POST "$API_BASE/api/spawn/1" \
  -H "X-Kage-Key: $KAGE_API_KEY"`}
            </pre>
          </div>
          <div className="rounded-xl border border-slate-700/50 p-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">CTFd Snippet (Python)</p>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-ink/70 p-3 text-xs text-slate-200">
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
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">CTFd Handler Example</p>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-ink/70 p-3 text-xs text-slate-200">
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
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
