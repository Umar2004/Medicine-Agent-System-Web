import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { PAGINATION } from "@/lib/constants";
import type { ApiFailure, ApiSuccess, PaginatedResponse } from "@/types/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errors = {
  badRequest: (message: string, details?: unknown) => new ApiError(400, message, details),
  unauthorized: (message = "Not authenticated") => new ApiError(401, message),
  forbidden: (message = "You do not have permission to perform this action") => new ApiError(403, message),
  notFound: (entity = "Record") => new ApiError(404, `${entity} not found`),
  conflict: (message: string, details?: unknown) => new ApiError(409, message, details),
  tooManyRequests: (message: string) => new ApiError(429, message),
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(status: number, error: string, details?: unknown): NextResponse<ApiFailure> {
  return NextResponse.json({ success: false, error, ...(details === undefined ? {} : { details }) }, { status });
}

export function paginated<T>(
  data: T[],
  totalCount: number,
  page: number,
  pageSize: number,
): NextResponse<PaginatedResponse<T> & { success: true }> {
  return NextResponse.json({
    success: true,
    data,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  });
}

export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePagination(searchParams: URLSearchParams): Pagination {
  const rawPage = Number(searchParams.get("page"));
  const rawSize = Number(searchParams.get("pageSize"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : PAGINATION.defaultPage;
  const pageSize =
    Number.isInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, PAGINATION.maxPageSize) : PAGINATION.defaultPageSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw errors.badRequest("Request body must be valid JSON");
  }
  return schema.parse(json);
}

/** `?sortBy=&sortDir=` → a whitelisted field + direction. */
export function parseSort<F extends string>(
  searchParams: URLSearchParams,
  fields: readonly F[],
  fallback: F,
): { sortBy: F; desc: boolean } {
  const raw = searchParams.get("sortBy") ?? "";
  const sortBy = (fields as readonly string[]).includes(raw) ? (raw as F) : fallback;
  return { sortBy, desc: searchParams.get("sortDir") === "desc" };
}

/** Escapes % and _ so user input is matched literally in ILIKE. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

export function requireUuid(value: string, entity = "Record"): string {
  if (!isUuid(value)) throw errors.notFound(entity);
  return value;
}

type RouteContext<P> = { params: Promise<P> };

// PDF routes launch Chrome and will exceed this; anything else over it is worth a look.
const SLOW_REQUEST_MS = 1000;

/** Wraps a route handler with consistent error → JSON response mapping. */
export function handler<P = Record<string, never>>(
  fn: (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>,
): (req: NextRequest, ctx: RouteContext<P>) => Promise<Response> {
  return async (req, ctx) => {
    const started = performance.now();
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, err.message, err.details);
      if (err instanceof ZodError) {
        return fail(400, err.issues[0]?.message ?? "Invalid input", err.issues);
      }
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}`, err);
      return fail(500, "Something went wrong. Please try again.");
    } finally {
      const ms = performance.now() - started;
      if (ms > SLOW_REQUEST_MS) console.warn(`[api] slow ${req.method} ${req.nextUrl.pathname} ${ms.toFixed(0)}ms`);
    }
  };
}
