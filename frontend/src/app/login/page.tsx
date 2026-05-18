"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { apiRequest } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: { username, password }
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="panel w-full max-w-md p-8 rounded-2xl animate-in">
        <p className="font-display uppercase tracking-[0.3em] text-xs text-neon">The Kage Protocol</p>
        <h1 className="font-display text-3xl mt-3 text-white">Command Center Access</h1>
        <p className="text-sm text-slate-400 mt-2">
          Authenticate as an admin to manage jutsus and shadow clones.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Input
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Zor0ark"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
          {error ? <p className="text-sm text-ember">{error}</p> : null}
          <Button type="submit" disabled={loading} full>
            {loading ? "Authenticating..." : "Enter Dashboard"}
          </Button>
        </form>
      </div>
    </main>
  );
}
