"use client";

import { COMPANY_HEADER } from "@/lib/constants";
import { useCompanyStore } from "@/stores/company-store";
import type { ApiResponse, PaginatedResponse } from "@/types/api";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type QueryValue = string | number | boolean | null | undefined;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// One refresh at a time; concurrent 401s wait for the same attempt.
let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

function requestHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const companyId = useCompanyStore.getState().companyId;
  if (companyId) headers.set(COMPANY_HEADER, companyId);
  if (typeof window !== "undefined") headers.set("x-page", window.location.pathname);
  return headers;
}

async function request(path: string, init: RequestInit, retried = false): Promise<Response> {
  const headers = requestHeaders(init.headers);
  const res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  const isAuthRoute = path.startsWith("/api/auth/login") || path.startsWith("/api/auth/refresh");
  if (res.status === 401 && !retried && !isAuthRoute) {
    if (await refreshSession()) return request(path, init, true);
    redirectToLogin();
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiClientError(res.status, res.ok ? "Invalid server response" : `Request failed (${res.status})`);
  }
  const typed = body as ApiResponse<unknown>;
  if (!res.ok || typed.success === false) {
    const message = typed.success === false ? typed.error : `Request failed (${res.status})`;
    throw new ApiClientError(res.status, message, typed.success === false ? typed.details : undefined);
  }
  return body as T;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
}

/** Typed API helpers. `get/post/put/del` unwrap `{ success, data }` → data. */
export const api = {
  async get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    const res = await request(buildUrl(path, query), { method: "GET" });
    return (await parse<{ data: T }>(res)).data;
  },
  async list<T>(path: string, query?: Record<string, QueryValue>): Promise<PaginatedResponse<T>> {
    const res = await request(buildUrl(path, query), { method: "GET" });
    return parse<PaginatedResponse<T>>(res);
  },
  async post<T>(path: string, body?: unknown): Promise<T> {
    return (await parse<{ data: T }>(await request(path, jsonInit("POST", body)))).data;
  },
  async put<T>(path: string, body?: unknown): Promise<T> {
    return (await parse<{ data: T }>(await request(path, jsonInit("PUT", body)))).data;
  },
  /** multipart/form-data POST (browser sets the boundary). */
  async upload<T>(path: string, body: FormData): Promise<T> {
    return (await parse<{ data: T }>(await request(path, { method: "POST", body }))).data;
  },
  /**
   * Fetches a file (PDF/XLSX) with the usual auth + company headers.
   * `open: true` shows it in a new tab (PDF), otherwise saves it.
   */
  async download(path: string, query?: Record<string, QueryValue>, options: { open?: boolean } = {}): Promise<void> {
    // Open the tab synchronously (inside the click) so popup blockers allow it.
    const tab = options.open ? window.open("", "_blank") : null;
    const res = await request(buildUrl(path, query), { method: "GET" });
    if (!res.ok) {
      tab?.close();
      await parse(res); // throws ApiClientError with the server message
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (tab) {
      tab.location.href = url;
    } else {
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "download";
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  /**
   * Fire-and-forget GET that warms the server (e.g. renders a PDF on hover) so the real request is fast.
   * No auth refresh/redirect and errors are ignored — the real request handles those.
   */
  prefetch(path: string): void {
    void fetch(path, { headers: requestHeaders(), credentials: "same-origin" })
      .then((res) => res.arrayBuffer()) // read the body so the browser can cache it
      .catch(() => undefined);
  },
  async del<T>(path: string): Promise<T> {
    return (await parse<{ data: T }>(await request(path, { method: "DELETE" }))).data;
  },
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
