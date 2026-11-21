import type { NextRequest } from "next/server";

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
  page: string | null;
}

export function getRequestMeta(req: NextRequest): RequestMeta {
  const forwarded = req.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  return {
    ipAddress,
    userAgent: req.headers.get("user-agent"),
    page: req.headers.get("x-page") ?? req.nextUrl.pathname,
  };
}
