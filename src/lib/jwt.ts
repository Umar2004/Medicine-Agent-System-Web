// Edge-safe JWT helpers (used by middleware.ts and API routes).
// Do not import Node-only modules here.
import { jwtVerify, SignJWT } from "jose";
import { ROLES, type Role } from "@/lib/constants";

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
  fullName: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be set (min 32 chars)");
  return new TextEncoder().encode(secret);
}

export function accessTokenDays(): number {
  const days = Number(process.env.JWT_ACCESS_TOKEN_DAYS ?? 7);
  return Number.isFinite(days) && days > 0 ? days : 7;
}

export async function signAccessToken(user: SessionUser): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + accessTokenDays() * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ username: user.username, role: user.role, fullName: user.fullName })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());
  return { token, expiresAt };
}

/**
 * Returns the session encoded in the token, or null if missing/invalid/expired.
 * `iat` (seconds) lets requireAuth reject tokens issued before a password change.
 */
export async function verifyAccessToken(
  token: string | undefined | null,
): Promise<(SessionUser & { iat?: number }) | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const { sub, username, role, fullName } = payload;
    if (
      typeof sub !== "string" ||
      typeof username !== "string" ||
      typeof fullName !== "string" ||
      typeof role !== "string" ||
      !(ROLES as readonly string[]).includes(role)
    ) {
      return null;
    }
    return { id: sub, username, role: role as Role, fullName, iat: typeof payload.iat === "number" ? payload.iat : undefined };
  } catch {
    return null;
  }
}
