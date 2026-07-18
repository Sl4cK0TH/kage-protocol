"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { apiRequest } from "@/lib/api";
import { toast } from "@/lib/toast";

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
      toast({ title: "Access Granted", description: "Welcome back, Administrator.", variant: "success" });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.4em] text-emerald-300">The Kage Protocol</p>
          <CardTitle>Command Center Access</CardTitle>
          <CardDescription>Authenticate as an admin to manage jutsus and shadow clones.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
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
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Authenticating..." : "Enter Dashboard"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
