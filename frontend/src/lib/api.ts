const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(payload.detail || "Request failed");
  }

  return response.json();
}
