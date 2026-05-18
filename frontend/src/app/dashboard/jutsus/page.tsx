"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { ChallengeConfig, DockerImage } from "@/lib/types";
import { Button, Input, Modal, Panel, Select } from "@/components/ui";

const emptyForm = {
  id: undefined as number | undefined,
  name: "",
  description: "",
  docker_image_name: "",
  internal_ports: "",
  ram_limit: "250m"
};

export default function JutsuPage() {
  const [items, setItems] = useState<ChallengeConfig[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const load = async () => {
    setLoading(true);
    try {
      const [jutsuData, imageData] = await Promise.all([
        apiRequest<ChallengeConfig[]>("/api/admin/jutsus"),
        apiRequest<DockerImage[]>("/api/admin/docker/images")
      ]);
      setItems(jutsuData);
      setImages(imageData);
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
      ram_limit: item.ram_limit
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name,
      description: form.description,
      docker_image_name: form.docker_image_name,
      internal_ports: form.internal_ports
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => !Number.isNaN(value)),
      ram_limit: form.ram_limit
    };

    if (form.id) {
      await apiRequest(`/api/admin/jutsus/${form.id}`, { method: "PUT", body: payload });
    } else {
      await apiRequest("/api/admin/jutsus", { method: "POST", body: payload });
    }
    setModalOpen(false);
    await load();
  };

  const handleDelete = async (id: number) => {
    await apiRequest(`/api/admin/jutsus/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-white">Jutsu Library</h2>
          <p className="text-sm text-slate-400">Craft and maintain your challenge roster.</p>
        </div>
        <Button onClick={openCreate}>New Jutsu</Button>
      </div>

      <Panel title="Stored Jutsus">
        <div className="space-y-3 text-sm">
          {loading ? <p className="text-slate-400">Loading...</p> : null}
          {!loading && !items.length ? <p className="text-slate-500">No jutsus created.</p> : null}
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-700/50 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-white font-medium">{item.name}</p>
                <p className="text-xs text-slate-400">{item.docker_image_name}</p>
                <p className="text-xs text-slate-500">Ports: {item.internal_ports.join(", ")}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => openEdit(item)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => handleDelete(item.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? "Edit Jutsu" : "New Jutsu"}>
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <Input
            label="Description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Docker Image</label>
            <Select
              value={form.docker_image_name}
              placeholder="Select image"
              onChange={(value) => setForm({ ...form, docker_image_name: value })}
              options={images.flatMap((image) =>
                image.tags.map((tag) => ({ label: tag, value: tag }))
              )}
            />
          </div>
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
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
