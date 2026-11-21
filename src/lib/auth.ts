import "server-only";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/db";
import { errors } from "@/lib/api";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/constants";
import { env } from "@/lib/env";
import { signAccessToken, verifyAccessToken, type SessionUser } from "@/lib/jwt";
import type { IssuedRefreshToken } from "@/lib/refresh-tokens";
import { ttlCache } from "@/lib/ttl-cache";

export type { SessionUser } from "@/lib/jwt";

const BCRYPT_ROUNDS = 12;
// Compared against when a username doesn't exist, so response time doesn't leak which usernames are valid.
const DUMMY_HASH = "$2b$12$8Olzz/HB.5rDGS/WmVLINuZnJWMt/Agl4H8FuT8l.89V6YhzxC8qe";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return hash !== null && ok;
}

function cookieBase() {
  return { httpOnly: true, secure: env().NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
}

export async function setAuthCookies(
  res: NextResponse,
  user: SessionUser,
  refresh: IssuedRefreshToken,
): Promise<void> {
  const access = await signAccessToken(user);
  res.cookies.set(ACCESS_COOKIE, access.token, { ...cookieBase(), expires: access.expiresAt });
  res.cookies.set(REFRESH_COOKIE, refresh.token, { ...cookieBase(), expires: refresh.expiresAt });
}

export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, "", { ...cookieBase(), maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...cookieBase(), maxAge: 0 });
}

interface ActiveAccount {
  user: SessionUser;
  passwordChangedAt: Date | null;
}

// requireAuth runs on every API call; caching the "still active?" lookup saves a DB round trip
// per request. Only active accounts are cached. Every route that changes a user's status, role,
// name, password or deletion calls invalidateAccountCache(), so changes still apply immediately.
const accountCache = ttlCache<ActiveAccount>("active-account", 15_000);

export function invalidateAccountCache(userId?: string): void {
  if (userId) accountCache.delete(userId);
  else accountCache.clear();
}

async function loadActiveAccount(userId: string): Promise<ActiveAccount | null> {
  const cached = accountCache.get(userId);
  if (cached) return cached;
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      fullName: users.fullName,
      passwordChangedAt: users.passwordChangedAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isDeleted, false), eq(users.status, "active")))
    .limit(1);
  if (!row) return null;
  const { passwordChangedAt, ...user } = row;
  const account: ActiveAccount = { user: user satisfies SessionUser, passwordChangedAt };
  accountCache.set(userId, account);
  return account;
}

/** Loads an active, non-deleted user as a SessionUser (fresh role from DB). */
export async function loadActiveUser(userId: string): Promise<SessionUser | null> {
  return (await loadActiveAccount(userId))?.user ?? null;
}

function readAccessToken(req: NextRequest): string | undefined {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.cookies.get(ACCESS_COOKIE)?.value;
}

/** Session from the JWT only (no DB hit). Use for logout/audit where staleness is fine. */
export async function peekSession(req: NextRequest): Promise<SessionUser | null> {
  return verifyAccessToken(readAccessToken(req));
}

/**
 * Verifies the access token AND that the user is still active, so deactivation, role
 * changes and password changes take effect immediately rather than when the token expires.
 */
export async function requireAuth(req: NextRequest): Promise<SessionUser> {
  const claims = await verifyAccessToken(readAccessToken(req));
  if (!claims) throw errors.unauthorized();
  const account = await loadActiveAccount(claims.id);
  if (!account) throw errors.unauthorized("Your account is no longer active");
  if (account.passwordChangedAt) {
    // iat is whole seconds; a token issued in the same second as the change still passes,
    // which is what lets change-password hand back a fresh token in the same request.
    const changedAt = Math.floor(account.passwordChangedAt.getTime() / 1000);
    if (claims.iat === undefined || claims.iat < changedAt) {
      throw errors.unauthorized("Password was changed. Please log in again.");
    }
  }
  return account.user;
}
