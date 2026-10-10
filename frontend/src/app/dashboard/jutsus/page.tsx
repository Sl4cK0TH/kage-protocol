"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { ChallengeConfig, DockerImage } from "@/lib/types";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton
} from "@/components/ui";
import { toast } from "@/lib/toast";
import { useSnapshotStream } from "@/lib/useSnapshotStream";
import { PageHeader } from "@/components/page-header";
import { IconDownload, IconEdit, IconJutsu, IconPlay, IconPlus, IconTrash } from "@/components/icons";
import { PullImageDialog } from "@/components/pull-image-dialog";

const emptyForm = {
  id: undefined as number | undefined,
  name: "",
  description: "",
  docker_image_name: "",
  internal_ports: "",
  ram_limit: "256m",
  cpu_limit: "0.5"
};
type FormState = typeof emptyForm;
type FieldErrors = Partial<Record<keyof FormState, string>>;

/** Client-side mirror of the backend's validation rules, for inline feedback. */
function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Name is required.";
  else if (name.length > 128) errors.name = "Name must be 128 characters or fewer.";

  if (!form.docker_image_name.trim()) errors.docker_image_name = "Docker image is required.";

  const tokens = form.internal_ports.split(",").map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) errors.internal_ports = "Add at least one port.";
  else if (tokens.some((t) => !/^\d+$/.test(t) || Number(t) < 1 || Number(t) > 65535))
    errors.internal_ports = "Use whole numbers from 1 to 65535, separated by commas.";

  if (!/^\d+[bkmgBKMG]?$/.test(form.ram_limit.trim())) errors.ram_limit = "Use a size like 256m or 1g.";

  const cpu = Number(form.cpu_limit);
  if (!form.cpu_limit.trim() || Number.isNaN(cpu) || cpu <= 0 || cpu > 16)
    errors.cpu_limit = "Use a number of cores greater than 0 and at most 16.";
  return errors;
}

export default function JutsuPage() {
  const [items, setItems] = useState<ChallengeConfig[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [spawningId, setSpawningId] = useState<number | null>(null);
  const [pullImage, setPullImage] = useState<string | null>(null);

  // Live clone counts per Jutsu, from the same stream the Clones page uses.
  const { snapshot } = useSnapshotStream();
  const runningByJutsu = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of snapshot?.containers ?? []) {
      if (c.challenge_id != null) counts.set(c.challenge_id, (counts.get(c.challenge_id) ?? 0) + 1);
    }
    return counts;
  }, [snapshot]);

  const errors = validate(form);
  const showError = (field: keyof FormState) => ((touched[field] || submitted) && errors[field]) || null;
  const imageTags = useMemo(() => images.flatMap((image) => image.tags).sort(), [images]);

  const load = async () => {
    try {
      const [jutsuData, imageData] = await Promise.all([
        apiRequest<ChallengeConfig[]>("/api/admin/jutsus"),
        apiRequest<DockerImage[]>("/api/admin/docker/images")
      ]);
      setItems(jutsuData);
      setImages(imageData);
    } catch (error) {
      toast({
        title: "Couldn't load jutsus",
        description: error instanceof Error ? error.message : "Unable to fetch jutsus.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openForm = (item?: ChallengeConfig) => {
    setForm(
      item
        ? {
            id: item.id,
            name: item.name,
            description: item.description ?? "",
            docker_image_name: item.docker_image_name,
            internal_ports: item.internal_ports.join(", "),
            ram_limit: item.ram_limit,
            cpu_limit: String(item.cpu_limit)
          }
        : { ...emptyForm }
    );
    setTouched({});
    setSubmitted(false);
    setModalOpen(true);
  };

  const field = (key: keyof FormState) => ({
    value: String(form[key] ?? ""),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }),
    onBlur: () => setTouched((t) => ({ ...t, [key]: true })),
    error: showError(key)
  });

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      docker_image_name: form.docker_image_name.trim(),
      internal_ports: form.internal_ports.split(",").map((t) => Number(t.trim())).filter(Boolean),
      ram_limit: form.ram_limit.trim(),
      cpu_limit: Number(form.cpu_limit)
    };

    try {
      if (form.id) {
        await apiRequest(`/api/admin/jutsus/${form.id}`, { method: "PUT", body: payload });
        toast({ title: "Jutsu updated", description: `${payload.name} saved.`, variant: "success" });
      } else {
        await apiRequest("/api/admin/jutsus", { method: "POST", body: payload });
        toast({ title: "Jutsu created", description: `${payload.name} is ready to spawn.`, variant: "success" });
      }
      setModalOpen(false);
      await load();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unable to save jutsu.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/admin/jutsus/${deleteTarget.id}`, { method: "DELETE" });
      toast({ title: "Jutsu deleted", description: `${deleteTarget.name} was removed.` });
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unable to delete jutsu.",
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSpawn = async (item: ChallengeConfig) => {
    setSpawningId(item.id);
    try {
      const res = await apiRequest<{ host: string; port: number }>(`/api/admin/spawn/${item.id}`, { method: "POST" });
      toast({ title: "Clone spawned", description: `${item.name} is up at ${res.host}:${res.port}.`, variant: "success" });
    } catch (error) {
      toast({
        title: "Spawn failed",
        description: error instanceof Error ? error.message : "Unable to spawn container.",
        variant: "destructive"
      });
    } finally {
      setSpawningId(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Jutsu Library"
        description="Challenge definitions players can spawn on demand."
        actions={
          <Button onClick={() => openForm()}>
            <IconPlus className="h-4 w-4" aria-hidden="true" />
            New Jutsu
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-800 px-6 py-14 text-center">
          <IconJutsu className="h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-4 text-zinc-200">No jutsus yet</p>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            A jutsu defines a challenge: its Docker image, the ports players connect to, and resource limits.
          </p>
          <Button className="mt-5" onClick={() => openForm()}>
            <IconPlus className="h-4 w-4" aria-hidden="true" />
            Create your first Jutsu
          </Button>
        </div>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const running = runningByJutsu.get(item.id) ?? 0;
            return (
              <li key={item.id}>
                <Card className="flex h-full flex-col">
                  <CardHeader className="space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="min-w-0 break-words">{item.name}</CardTitle>
                      {running ? (
                        <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
                          {running} running
                        </span>
                      ) : null}
                    </div>
                    <p className="font-mono text-xs text-muted">{item.docker_image_name}</p>
                    {item.description ? <CardDescription className="line-clamp-2">{item.description}</CardDescription> : null}
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <dt className="text-zinc-400">Ports</dt>
                      <dd className="text-right font-mono text-zinc-200">{item.internal_ports.join(", ")}</dd>
                      <dt className="text-zinc-400">RAM</dt>
                      <dd className="text-right font-mono text-zinc-200">{item.ram_limit}</dd>
                      <dt className="text-zinc-400">CPU</dt>
                      <dd className="text-right font-mono text-zinc-200">
                        {item.cpu_limit} core{item.cpu_limit === 1 ? "" : "s"}
                      </dd>
                      <dt className="text-zinc-400">Challenge ID</dt>
                      <dd className="text-right font-mono text-zinc-200">{item.id}</dd>
                    </dl>
                  </CardContent>
                  <CardFooter className="mt-auto flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => handleSpawn(item)} loading={spawningId === item.id}>
                      {spawningId === item.id ? null : <IconPlay className="h-3.5 w-3.5" aria-hidden="true" />}
                      Spawn
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPullImage(item.docker_image_name)}>
                      <IconDownload className="h-3.5 w-3.5" aria-hidden="true" />
                      Pull
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openForm(item)}>
                      <IconEdit className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </Button>
                    {/* Icon-only keeps the actions on one row; the accessible name and
                        tooltip still say exactly what it deletes. */}
                    <Button
                      size="sm"
                      variant="danger"
                      className="ml-auto w-8 px-0"
                      onClick={() => setDeleteTarget({ id: item.id, name: item.name })}
                      aria-label={`Delete ${item.name}`}
                      title="Delete jutsu"
                    >
                      <IconTrash className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => !saving && setModalOpen(open)}>
        <DialogContent className="mx-auto max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Jutsu" : "New Jutsu"}</DialogTitle>
            <DialogDescription>Players get their own isolated container from this definition.</DialogDescription>
          </DialogHeader>
          <form className="mt-5 space-y-4" onSubmit={handleSave} noValidate>
            <Input label="Name" placeholder="e.g. Web 101 — Login Bypass" autoFocus {...field("name")} />
            <Input label="Description" placeholder="Optional — shown on the card" {...field("description")} />
            <Input
              label="Docker image"
              mono
              placeholder="registry/image:tag"
              list="local-images"
              autoComplete="off"
              spellCheck={false}
              hint={
                imageTags.length
                  ? "Pick a local image or type any reference — pull it from the card after saving."
                  : "Type an image reference — pull it from the card after saving."
              }
              {...field("docker_image_name")}
            />
            <datalist id="local-images">
              {imageTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
            <Input
              label="Internal ports"
              mono
              inputMode="numeric"
              placeholder="e.g. 80, 8080"
              hint="Ports the challenge listens on inside the container, comma-separated."
              {...field("internal_ports")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="RAM limit" mono placeholder="256m" hint="e.g. 128m, 1g" {...field("ram_limit")} />
              <Input
                label="CPU limit (cores)"
                mono
                inputMode="decimal"
                placeholder="0.5"
                hint="Up to 16"
                {...field("cpu_limit")}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {form.id ? "Save changes" : "Create Jutsu"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <PullImageDialog
        image={pullImage}
        open={pullImage !== null}
        onOpenChange={(open) => {
          if (!open) setPullImage(null);
        }}
        onComplete={load}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete this jutsu?"
        description={`"${deleteTarget?.name}" will be removed from the library. Running clones keep running until they expire.`}
        confirmLabel="Delete jutsu"
        variant="destructive"
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
}
