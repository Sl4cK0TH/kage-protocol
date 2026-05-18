"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { ContainerInfo } from "@/lib/types";
import { Button, Modal, Panel } from "@/components/ui";

export default function CloneManagerPage() {
  const [items, setItems] = useState<ContainerInfo[]>([]);
  const [selectedLogs, setSelectedLogs] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  const load = async () => {
    const data = await apiRequest<ContainerInfo[]>("/api/admin/docker/containers");
    setItems(data);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogs = async (id: string) => {
    const data = await apiRequest<{ logs: string }>(`/api/admin/docker/containers/${id}/logs`);
    setSelectedLogs(data.logs);
    setLogsOpen(true);
  };

  const handleKill = async (id: string) => {
    await apiRequest(`/api/admin/docker/containers/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-white">Clone Manager</h2>
        <p className="text-sm text-slate-400">Monitor every shadow clone and reap on demand.</p>
      </div>

      <Panel title="Active Shadow Clones">
        <div className="space-y-3 text-sm">
          {!items.length ? <p className="text-slate-500">No active clones.</p> : null}
          {items.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 rounded-xl border border-slate-700/40 p-4 md:grid-cols-[1.6fr_1fr_1fr_1fr_160px] md:items-center"
            >
              <div>
                <p className="text-white font-medium">{item.name || item.id.slice(0, 12)}</p>
                <p className="text-xs text-slate-500">{item.image?.join(", ")}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ports</p>
                <p className="text-slate-200">
                  {Object.values(item.ports || {})
                    .flatMap((mapping) => mapping?.map((entry) => entry.HostPort) || [])
                    .join(", ") || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">TTL</p>
                <p className="text-neon">
                  {item.time_remaining_seconds !== undefined && item.time_remaining_seconds !== null
                    ? `${Math.floor(item.time_remaining_seconds / 60)}m`
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <p className="text-slate-200">{item.status}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => handleLogs(item.id)}>
                  Logs
                </Button>
                <Button variant="danger" onClick={() => handleKill(item.id)}>
                  KILL
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title="Container Logs">
        <pre className="text-xs text-slate-200 whitespace-pre-wrap max-h-96 overflow-y-auto">
          {selectedLogs || "No logs yet."}
        </pre>
      </Modal>
    </div>
  );
}
