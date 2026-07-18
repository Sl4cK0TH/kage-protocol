"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { GlobalSettings } from "@/lib/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton } from "@/components/ui";
import { toast } from "@/lib/toast";

export default function SettingsPage() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [form, setForm] = useState({
    default_ttl_minutes: "30",
    port_range_start: "30000",
    port_range_end: "40000"
  });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiRequest<GlobalSettings>("/api/admin/settings");
        setSettings(data);
        setForm({
          default_ttl_minutes: String(data.default_ttl_minutes),
          port_range_start: String(data.port_range_start),
          port_range_end: String(data.port_range_end)
        });
      } catch (error) {
        toast({
          title: "Settings Load Failed",
          description: error instanceof Error ? error.message : "Unable to fetch settings.",
          variant: "destructive"
        });
      }
    };

    load();
  }, []);

  const handleSave = async () => {
    const payload = {
      default_ttl_minutes: Number(form.default_ttl_minutes),
      port_range_start: Number(form.port_range_start),
      port_range_end: Number(form.port_range_end)
    };
    try {
      await apiRequest("/api/admin/settings", { method: "PUT", body: payload });
      toast({ title: "Settings Updated", description: "Chakra control synchronized.", variant: "success" });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Unable to save settings.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-white">Chakra Control</h2>
        <p className="text-sm text-zinc-500">Tune the global spawn parameters.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Global Settings</CardTitle>
          <CardDescription>Defaults applied to every spawned clone.</CardDescription>
        </CardHeader>
        <CardContent>
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
          {settings ? null : <Skeleton className="mt-4 h-4 w-40" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Official Documentation</CardTitle>
          <CardDescription>Quick integration references and links.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-zinc-300">
          <p>
            The Kage Protocol exposes a public spawn endpoint for CTFd, TryHackMe, or any external platform.
            All admin routes require the HTTP-only session cookie.
          </p>
          <Link className="text-emerald-300 hover:text-emerald-200" href="/dashboard/docs">
            Open full documentation
          </Link>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-900 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Spawn Endpoint</p>
              <p className="mt-2 font-mono text-xs text-emerald-300">POST /api/spawn/{`{challenge_id}`}</p>
              <p className="mt-2 text-xs text-zinc-500">Header: X-Kage-Key: &lt;api-key&gt;</p>
            </div>
            <div className="rounded-xl border border-zinc-900 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Admin API Base</p>
              <p className="mt-2 font-mono text-xs text-emerald-300">/api/admin/*</p>
              <p className="mt-2 text-xs text-zinc-500">Requires HTTP-only session cookie</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
