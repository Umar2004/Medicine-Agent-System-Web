import { NextResponse, type NextRequest } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { fail, handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { clearAuthCookies, loadActiveUser, setAuthCookies, type SessionUser } from "@/lib/auth";
import { ACTION_TYPES, REFRESH_COOKIE } from "@/lib/constants";
import { revokeAllUserTokens, rotateRefreshToken, type IssuedRefreshToken } from "@/lib/refresh-tokens";
import { getRequestMeta } from "@/lib/request-meta";

type RefreshOutcome = { ok: true; user: SessionUser; refresh: IssuedRefreshToken } | { ok: false };

async function refresh(req: NextRequest): Promise<RefreshOutcome> {
  const meta = getRequestMeta(req);
  const plain = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!plain) return { ok: false };

  const result = await rotateRefreshToken(plain, meta);

  if (result.status === "breach") {
    const [row] = await db.select({ username: users.username }).from(users).where(eq(users.id, result.userId)).limit(1);
    auditLog({
      user: { id: result.userId, username: row?.username ?? "" },
      companyId: null,
      actionType: ACTION_TYPES.LOGIN_FAILED,
      entityName: "RefreshToken",
      newValue: { reason: "refresh_token_reuse_detected", action: "all_sessions_revoked" },
      meta,
    });
    return { ok: false };
  }
  if (result.status !== "rotated") return { ok: false };

  const user = await loadActiveUser(result.userId);
  if (!user) {
    await revokeAllUserTokens(result.userId);
    return { ok: false };
  }

  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.TOKEN_REFRESHED,
    entityName: "User",
    entityId: user.id,
    meta,
  });
  return { ok: true, user, refresh: { token: result.token, expiresAt: result.expiresAt } };
}

/** Client-side refresh (api-client retries once after a 401). */
export const POST = handler(async (req) => {
  const outcome = await refresh(req);
  if (!outcome.ok) {
    const res = fail(401, "Session expired. Please sign in again.");
    clearAuthCookies(res);
    return res;
  }
  const res = ok({ user: outcome.user });
  await setAuthCookies(res, outcome.user, outcome.refresh);
  return res;
});

/** Page navigation refresh: middleware redirects here when the access token has expired. */
export const GET = handler(async (req) => {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const outcome = await refresh(req);
  if (!outcome.ok) {
    const res = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url));
    clearAuthCookies(res);
    return res;
  }
  const res = NextResponse.redirect(new URL(next, req.url));
  await setAuthCookies(res, outcome.user, outcome.refresh);
  return res;
});

/** Only allow same-site relative paths to avoid open redirects. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
