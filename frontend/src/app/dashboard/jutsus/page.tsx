"use client";

import { useEffect, useState } from "react";
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
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton
} from "@/components/ui";
import { toast } from "@/lib/toast";

const emptyForm = {
  id: undefined as number | undefined,
  name: "",
  description: "",
  docker_image_name: "",
  internal_ports: "",
  ram_limit: "250m",
  cpu_limit: "0.5"
};

export default function JutsuPage() {
  const [items, setItems] = useState<ChallengeConfig[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [jutsuData, imageData] = await Promise.all([
        apiRequest<ChallengeConfig[]>("/api/admin/jutsus"),
        apiRequest<DockerImage[]>("/api/admin/docker/images")
      ]);
      setItems(jutsuData);
      setImages(imageData);
    } catch (error) {
      toast({
        title: "Load Failed",
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

  const openCreate = () => {
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (item: ChallengeConfig) => {
    setForm({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      docker_image_name: item.docker_image_name,
      internal_ports: item.internal_ports.join(","),
      ram_limit: item.ram_limit,
      cpu_limit: String(item.cpu_limit)
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description,
      docker_image_name: form.docker_image_name,
      internal_ports: form.internal_ports
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => !Number.isNaN(value)),
      ram_limit: form.ram_limit,
      cpu_limit: Number(form.cpu_limit) || 0.5
    };

    try {
      if (form.id) {
        await apiRequest(`/api/admin/jutsus/${form.id}`, { method: "PUT", body: payload });
        toast({ title: "Jutsu Updated", description: `${payload.name} refreshed.`, variant: "success" });
      } else {
        await apiRequest("/api/admin/jutsus", { method: "POST", body: payload });
        toast({ title: "Jutsu Created", description: `${payload.name} added.`, variant: "success" });
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await apiRequest(`/api/admin/jutsus/${deleteTarget.id}`, { method: "DELETE" });
    toast({ title: "Jutsu Deleted", description: `${deleteTarget.name} removed.`, variant: "destructive" });
    setDeleteTarget(null);
    await load();
  };

  const handleSpawn = async (id: number, name: string) => {
    try {
      await apiRequest(`/api/admin/spawn/${id}`, { method: "POST" });
      toast({ title: "Clone Spawned", description: `${name} dispatched.`, variant: "success" });
    } catch (error) {
      toast({
        title: "Spawn Failed",
        description: error instanceof Error ? error.message : "Unable to spawn container.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-white">Jutsu Library</h2>
          <p className="text-sm text-zinc-500">Craft and maintain your challenge roster.</p>
        </div>
        <Button onClick={openCreate}>New Jutsu</Button>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="flex h-full flex-col">
              <CardHeader className="space-y-2">
                <div>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>{item.docker_image_name}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>RAM Limit</span>
                  <span className="text-zinc-200">{item.ram_limit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>CPU Limit</span>
                  <span className="text-zinc-200">{item.cpu_limit} core(s)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Port/s</span>
                  <span className="text-zinc-200">{item.internal_ports.join(", ")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>ID</span>
                  <span className="text-zinc-200">{item.id}</span>
                </div>
              </CardContent>
              <CardFooter className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" onClick={() => handleSpawn(item.id, item.name)}>
                  Spawn Clone
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteTarget({ id: item.id, name: item.name })}>
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
          {!items.length ? <p className="text-zinc-500">No jutsus created.</p> : null}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Jutsu" : "New Jutsu"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <Input
              label="Description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <label className="block space-y-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
              <span>Docker Image</span>
              <select
                className="w-full rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100"
                value={form.docker_image_name}
                onChange={(event) => setForm({ ...form, docker_image_name: event.target.value })}
              >
                <option value="">Select image</option>
                {images.flatMap((image) =>
                  image.tags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))
                )}
              </select>
            </label>
            <Input
              label="Internal Ports (comma separated)"
              value={form.internal_ports}
              onChange={(event) => setForm({ ...form, internal_ports: event.target.value })}
            />
            <Input
              label="RAM Limit"
              value={form.ram_limit}
              onChange={(event) => setForm({ ...form, ram_limit: event.target.value })}
            />
            <Input
              label="CPU Limit (cores)"
              value={form.cpu_limit}
              onChange={(event) => setForm({ ...form, cpu_limit: event.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Jutsu"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
