export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8081";

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

/**
 * Turn a FastAPI error body into a readable message. Validation errors (422)
 * carry `detail` as an array of `{ msg, loc }` objects rather than a string.
 */
function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (typeof item?.msg === "string" ? item.msg.replace(/^Value error, /, "") : null))
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  return "Request failed";
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await apiRequestWithHeaders<T>(path, options)).data;
}

/** Like `apiRequest`, but also returns the response headers (e.g. pagination totals). */
export async function apiRequestWithHeaders<T>(
  path: string,
  options: RequestOptions = {}
): Promise<{ data: T; headers: Headers }> {
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
    throw new Error(formatErrorDetail(payload.detail));
  }

  return { data: await response.json(), headers: response.headers };
}
