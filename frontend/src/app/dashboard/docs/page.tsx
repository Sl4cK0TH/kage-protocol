"use client";

import { useState } from "react";
import type React from "react";
import { API_BASE } from "@/lib/api";
import {
  INTEGRATION_PLATFORMS,
  INTEGRATION_SNIPPETS,
  type IntegrationPlatform
} from "@/lib/integration-snippets";
import { copyToClipboard } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

const GUIDE_URL = "https://github.com/Sl4cK0TH/kage-protocol/blob/master/backend/INTEGRATION.md";

const SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "api", label: "Public API" },
  { id: "snippets", label: "Integrations" },
  { id: "dashboard", label: "Dashboard" },
  { id: "configuration", label: "Configuration" },
  { id: "security", label: "Security" },
  { id: "troubleshooting", label: "Troubleshooting" }
];

const SPAWN_RESPONSE = `{
  "container_id": "3f9a1c...e07b",
  "host": "ctf.example.com",
  "port": 31337,
  "port_map": { "80/tcp": 31337 },
  "expires_at": 1719100000
}`;

const SPAWN_ERRORS: [string, string][] = [
  ["401", "Missing or invalid X-Kage-Key."],
  ["404", "No Jutsu with that challenge_id."],
  ["409", "Not enough free host ports in the configured range."],
  ["422", "Malformed request body."],
  ["429", "Rate limit exceeded."],
  ["500", "Docker couldn't start the container — usually an image that couldn't be pulled."]
];

const STOP_ERRORS: [string, string][] = [
  ["401", "Missing or invalid X-Kage-Key."],
  ["404", "No such container, already stopped or reaped, or not a Kage clone."],
  ["429", "Rate limit exceeded."]
];

const DASHBOARD_GUIDE: [string, string][] = [
  [
    "Dashboard",
    "Live clone, CPU, and memory telemetry with trend sparklines, plus the recent-activity feed. The Live / Polling badge shows whether the real-time stream is connected."
  ],
  [
    "Jutsu Library",
    "Create and edit challenges. Pull downloads a Jutsu's image with live progress; Spawn starts a test clone using the default TTL. Each card shows the ID platforms use as challenge_id."
  ],
  [
    "Active Clones",
    "Every running clone with its Jutsu, ports, and countdown. Click a row for live logs, per-clone CPU/memory, copyable addresses, TTL extension (+15/+30/+60 min), and kill."
  ],
  ["Audit Log", "Every admin, platform, and Reaper action — 50 per page, filterable by action, with whole-log counts."],
  ["Settings", "The default TTL for new clones (1–1440 minutes) and the host-port range clones are published on."]
];

const CONFIG: [string, string, string][] = [
  ["KAGE_API_KEY", "required", "The key platforms send as X-Kage-Key."],
  ["PUBLIC_HOST", "localhost", "Hostname returned to players in spawn responses."],
  ["CORS_ORIGINS", "http://localhost:3000", "Origins allowed to call the API — the dashboard, plus any browser-based landing page."],
  ["SPAWN_RATE_LIMIT_COUNT", "30", "Spawn (and, separately, stop) requests allowed per window, per key + client IP."],
  ["SPAWN_RATE_LIMIT_WINDOW_SECONDS", "60", "Rate-limit window."],
  ["AUDIT_RETENTION_DAYS", "90", "Audit entries older than this are deleted hourly; 0 keeps them forever."],
  ["COOKIE_SECURE", "false", "Set to true when the dashboard is served over HTTPS."]
];

const TROUBLESHOOTING: [string, string][] = [
  ["401 on every request", "The header must be exactly X-Kage-Key and match KAGE_API_KEY. Restart the backend after changing .env."],
  ["404 on spawn", "Wrong challenge_id — use the ID shown on the Jutsu's card."],
  ["409 No available ports", "The port range in Settings is too narrow or fully used. Widen it or stop clones."],
  ["429 during an event", "Server-side platforms send every spawn from one IP. Raise SPAWN_RATE_LIMIT_COUNT."],
  ["Slow first spawn, or 500", "The image was pulled during the request (or couldn't be). Pull it from the Jutsu Library first."],
  ["Players can't connect", "PUBLIC_HOST must be reachable by players, and the firewall must allow the port range."],
  ["A clone disappeared", "Its TTL expired and the Reaper removed it. Extend it from Active Clones or raise the default TTL."],
  ["Badge shows Polling", "A proxy or CDN is buffering the event stream. Disable response buffering for the stream endpoints."]
];

export default function DocsPage() {
  const [active, setActive] = useState<IntegrationPlatform>("Generic");
  const snippet = INTEGRATION_SNIPPETS[active];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <PageHeader title="Documentation" description="Connect your CTF platform and operate the command center." />
        <nav className="flex flex-wrap gap-2" aria-label="Documentation sections">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400 transition hover:border-emerald-500/40 hover:text-emerald-200"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </div>

      <Section id="how-it-works" title="How it works">
        <ol className="space-y-3 text-sm text-zinc-300">
          <Step n={1} title="Spawn">
            Your platform calls <Code>POST /api/spawn/{"{challenge_id}"}</Code> when a player starts a challenge. Kage
            returns a host, port, container_id, and expiry.
          </Step>
          <Step n={2} title="Connect">
            Show the player <Code>host:port</Code>. Store the <Code>container_id</Code> — you need it to stop the clone.
          </Step>
          <Step n={3} title="Stop or expire">
            Stop it with <Code>DELETE /api/spawn/{"{container_id}"}</Code>, or let the Reaper remove it after its TTL.
            The Reaper checks every 60 seconds, and honors extensions made from Active Clones.
          </Step>
        </ol>
        <p className="text-xs text-muted">
          This dashboard talks to the backend at <Code>{API_BASE}</Code>. Platforms may need a different address, such
          as an internal Docker hostname.
        </p>
      </Section>

      <Section id="api" title="Public API">
        <p className="text-sm text-zinc-400">
          Every request needs the <Code>X-Kage-Key: &lt;api-key&gt;</Code> header. The key only works on these two
          endpoints — it isn&apos;t accepted by the admin API.
        </p>

        <Endpoint method="POST" path="/api/spawn/{challenge_id}" summary="Start a clone of a Jutsu.">
          <p className="text-xs text-muted">
            Optional JSON body, recorded in the audit log:{" "}
            <Code>{`{ "platform": "ctfd", "team_id": "team-42", "player_id": "user-7" }`}</Code>
          </p>
          <CodeBlock code={SPAWN_RESPONSE} label="200 response" />
          <ul className="space-y-1 text-xs text-muted">
            <li>
              <Code>port</Code> is the host port for the Jutsu&apos;s first internal port; <Code>port_map</Code> lists
              them all.
            </li>
            <li>
              <Code>expires_at</Code> is a Unix timestamp (seconds), based on the default TTL in Settings.
            </li>
          </ul>
          <StatusTable rows={SPAWN_ERRORS} label="Spawn status codes" />
        </Endpoint>

        <Endpoint method="DELETE" path="/api/spawn/{container_id}" summary="Stop a clone early.">
          <p className="text-xs text-muted">
            Accepts the container_id from the spawn response (a short ID or container name also works). Only Kage
            clones can be stopped. Returns <Code>{`{ "status": "success", "message": "Challenge terminated." }`}</Code>
          </p>
          <StatusTable rows={STOP_ERRORS} label="Stop status codes" />
        </Endpoint>

        <p className="text-xs text-muted">
          Both endpoints are rate-limited per API key + client IP, with separate limits for spawning and stopping.{" "}
          <Code>GET /api/health</Code> (no key needed) reports Docker and database connectivity.
        </p>
      </Section>

      <Section id="snippets" title="Integration snippets">
        <div className="flex flex-wrap gap-2" role="tablist">
          {INTEGRATION_PLATFORMS.map((platform) => (
            <button
              key={platform}
              role="tab"
              aria-selected={active === platform}
              onClick={() => setActive(platform)}
              className={`rounded-lg border px-4 py-2 text-xs font-medium transition ${
                active === platform
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-emerald-200"
              }`}
            >
              {platform}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-zinc-200">{snippet.label}</p>
            <p className="text-xs text-muted">{snippet.description}</p>
          </div>
          <CodeBlock code={snippet.code} label={snippet.language} />
          {snippet.warning ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <strong>Security:</strong> {snippet.warning}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          The full guide — including multi-port challenges and rate-limit sizing — is in{" "}
          <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200">
            backend/INTEGRATION.md
          </a>
          .
        </p>
      </Section>

      <Section id="dashboard" title="Operating the dashboard">
        <dl className="grid gap-4 md:grid-cols-2">
          {DASHBOARD_GUIDE.map(([page, text]) => (
            <div key={page} className="rounded-lg border border-zinc-900 bg-zinc-900/30 p-4">
              <dt className="text-sm text-zinc-100">{page}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted">{text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="configuration" title="Configuration">
        <p className="text-sm text-zinc-400">
          Set in <Code>backend/.env</Code>; restart the backend to apply changes. The full list is in the README.
        </p>
        <div tabIndex={0} role="region" aria-label="Configuration variables" className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variable</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Purpose</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CONFIG.map(([name, fallback, purpose]) => (
                <TableRow key={name}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-emerald-300">{name}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-zinc-400">{fallback}</TableCell>
                  <TableCell className="text-xs text-zinc-400">{purpose}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section id="security" title="Security">
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-400">
          <li>
            The API key is one shared secret for every integration. Keep it server-side — anything that embeds it in a
            browser page makes it public.
          </li>
          <li>
            Logs, stop, and TTL changes only work on containers Kage spawned; any other container ID or name returns
            404.
          </li>
          <li>
            To rotate the key, change <Code>KAGE_API_KEY</Code> and restart the backend — every integration needs the
            new key at once.
          </li>
          <li>Serve the dashboard and API over HTTPS, with COOKIE_SECURE=true, on the same site.</li>
        </ul>
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <dl className="divide-y divide-zinc-900">
          {TROUBLESHOOTING.map(([symptom, fix]) => (
            <div key={symptom} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="text-sm text-zinc-200">{symptom}</dt>
              <dd className="text-xs leading-relaxed text-muted">{fix}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4 rounded-xl border border-zinc-900 bg-zinc-950/70 p-6">
      <h2 className="font-display text-lg font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 text-xs text-emerald-300">
        {n}
      </span>
      <div>
        <p className="text-zinc-100">{title}</p>
        <p className="text-zinc-400">{children}</p>
      </div>
    </li>
  );
}

function Endpoint({
  method,
  path,
  summary,
  children
}: {
  method: string;
  path: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-300">{method}</span>
        <span className="font-mono text-sm text-zinc-100">{path}</span>
      </div>
      <p className="text-sm text-zinc-400">{summary}</p>
      {children}
    </div>
  );
}

function StatusTable({ rows, label }: { rows: [string, string][]; label: string }) {
  return (
    <div tabIndex={0} role="region" aria-label={label} className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Status</TableHead>
            <TableHead>Meaning</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([code, meaning]) => (
            <TableRow key={code}>
              <TableCell className="font-mono text-xs text-amber-300">{code}</TableCell>
              <TableCell className="text-xs text-zinc-400">{meaning}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const copy = async () => {
    const ok = await copyToClipboard(code);
    toast({
      title: ok ? "Copied" : "Copy failed",
      description: ok ? "Snippet copied to clipboard." : "Clipboard unavailable.",
      variant: ok ? "success" : "destructive"
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-1.5">
        <span className="font-mono text-xs text-muted">{label}</span>
        <Button size="sm" variant="ghost" className="h-8 px-3" onClick={copy} aria-label={`Copy ${label} snippet`}>
          Copy
        </Button>
      </div>
      <pre tabIndex={0} aria-label={`${label} code`} className="overflow-x-auto p-4 text-xs leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-emerald-200">{children}</code>;
}
