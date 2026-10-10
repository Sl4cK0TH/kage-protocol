"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { GlobalSettings } from "@/lib/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { toast } from "@/lib/toast";

type Form = { default_ttl_minutes: string; port_range_start: string; port_range_end: string };
type Errors = Partial<Record<keyof Form, string>>;

const toForm = (s: GlobalSettings): Form => ({
  default_ttl_minutes: String(s.default_ttl_minutes),
  port_range_start: String(s.port_range_start),
  port_range_end: String(s.port_range_end)
});

/** Mirrors the backend rules, including the start ≤ end cross-check. */
function validate(form: Form): Errors {
  const errors: Errors = {};
  const isInt = (v: string) => /^\d+$/.test(v.trim());
  const ttl = Number(form.default_ttl_minutes);
  if (!isInt(form.default_ttl_minutes) || ttl < 1 || ttl > 1440)
    errors.default_ttl_minutes = "Enter whole minutes from 1 to 1440 (24 hours).";
  const start = Number(form.port_range_start);
  const end = Number(form.port_range_end);
  if (!isInt(form.port_range_start) || start < 1024 || start > 65535)
    errors.port_range_start = "Enter a port from 1024 to 65535.";
  if (!isInt(form.port_range_end) || end < 1024 || end > 65535) errors.port_range_end = "Enter a port from 1024 to 65535.";
  if (!errors.port_range_start && !errors.port_range_end && start > end)
    errors.port_range_end = "The end port must be at least the start port.";
  return errors;
}

export default function SettingsPage() {
  const [saved, setSaved] = useState<GlobalSettings | null>(null);
  const [form, setForm] = useState<Form>({ default_ttl_minutes: "", port_range_start: "", port_range_end: "" });
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<GlobalSettings>("/api/admin/settings")
      .then((data) => {
        setSaved(data);
        setForm(toForm(data));
      })
      .catch((error) =>
        toast({
          title: "Couldn't load settings",
          description: error instanceof Error ? error.message : "Unable to fetch settings.",
          variant: "destructive"
        })
      );
  }, []);

  const errors = validate(form);
  const valid = Object.keys(errors).length === 0;
  const dirty = saved !== null && JSON.stringify(toForm(saved)) !== JSON.stringify(form);
  const capacity = valid ? Number(form.port_range_end) - Number(form.port_range_start) + 1 : null;

  const field = (key: keyof Form) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }),
    onBlur: () => setTouched((t) => ({ ...t, [key]: true })),
    error: touched[key] ? errors[key] : null,
    mono: true,
    inputMode: "numeric" as const
  });

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched({ default_ttl_minutes: true, port_range_start: true, port_range_end: true });
    if (!valid) return;
    setSaving(true);
    try {
      const updated = await apiRequest<GlobalSettings>("/api/admin/settings", {
        method: "PUT",
        body: {
          default_ttl_minutes: Number(form.default_ttl_minutes),
          port_range_start: Number(form.port_range_start),
          port_range_end: Number(form.port_range_end)
        }
      });
      setSaved(updated);
      setForm(toForm(updated));
      setTouched({});
      toast({ title: "Settings saved", description: "New clones will use these values.", variant: "success" });
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unable to save settings.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Chakra Control" description="Global defaults applied when clones are spawned." />

      <Card>
        <CardHeader>
          <CardTitle>Spawn defaults</CardTitle>
          <CardDescription>Changes apply to clones spawned from now on; running clones keep their current expiry.</CardDescription>
        </CardHeader>
        <CardContent>
          {saved === null ? (
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSave} noValidate>
              <div className="grid gap-4 md:grid-cols-3">
                <Input label="Default TTL (minutes)" hint="How long a clone lives before the Reaper removes it." {...field("default_ttl_minutes")} />
                <Input label="Port range start" hint="Lowest host port clones are published on." {...field("port_range_start")} />
                <Input label="Port range end" hint="Highest host port; open this range in your firewall." {...field("port_range_end")} />
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-400" aria-live="polite">
                  {capacity !== null ? (
                    <>
                      <span className="font-mono text-zinc-200">{capacity.toLocaleString()}</span> host ports available for clones
                    </>
                  ) : (
                    "Fix the highlighted fields to save."
                  )}
                </p>
                <div className="flex gap-2">
                  {dirty ? (
                    <Button type="button" variant="ghost" onClick={() => saved && (setForm(toForm(saved)), setTouched({}))} disabled={saving}>
                      Discard
                    </Button>
                  ) : null}
                  <Button type="submit" loading={saving} disabled={!dirty}>
                    {dirty ? "Save changes" : "Saved"}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-zinc-400">
        Looking for API endpoints and integration snippets? See the{" "}
        <Link href="/dashboard/docs" className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200">
          Documentation
        </Link>
        .
      </p>
    </div>
  );
}
