const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Read the value of a cookie by name.
 * Used to retrieve the CSRF token set by the backend on login.
 */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? match.split("=")[1] : null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  // Attach CSRF token on state-mutating requests
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    const csrfToken = getCookie("kage_csrf");
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers,
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
