import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, refreshTokens } from "@/db";
import { env } from "@/lib/env";
import type { RequestMeta } from "@/lib/request-meta";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newPlainToken(): string {
  return randomBytes(48).toString("base64url");
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env().JWT_REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export async function issueRefreshToken(userId: string, meta: RequestMeta): Promise<IssuedRefreshToken> {
  const token = newPlainToken();
  const expiresAt = refreshExpiry();
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });
  return { token, expiresAt };
}

export type RotationResult =
  | { status: "rotated"; userId: string; token: string; expiresAt: Date }
  | { status: "invalid" }
  | { status: "breach"; userId: string };

/**
 * Atomic rotation with breach detection: presenting a token that was already
 * revoked (or losing a concurrent race to revoke it) revokes ALL of the user's tokens.
 */
export async function rotateRefreshToken(plain: string, meta: RequestMeta): Promise<RotationResult> {
  const tokenHash = hashToken(plain);
  const [existing] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
  if (!existing) return { status: "invalid" };

  if (existing.revokedAt) {
    await revokeAllUserTokens(existing.userId);
    return { status: "breach", userId: existing.userId };
  }
  if (existing.expiresAt.getTime() <= Date.now()) return { status: "invalid" };

  const result = await db.transaction(async (tx) => {
    const revoked = await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, existing.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    if (revoked.length === 0) return null; // someone else rotated it first

    const token = newPlainToken();
    const expiresAt = refreshExpiry();
    const [created] = await tx
      .insert(refreshTokens)
      .values({
        userId: existing.userId,
        tokenHash: hashToken(token),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      })
      .returning({ id: refreshTokens.id });
    await tx.update(refreshTokens).set({ replacedById: created.id }).where(eq(refreshTokens.id, existing.id));
    return { token, expiresAt };
  });

  if (!result) {
    await revokeAllUserTokens(existing.userId);
    return { status: "breach", userId: existing.userId };
  }
  return { status: "rotated", userId: existing.userId, ...result };
}

export async function revokeRefreshToken(plain: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, hashToken(plain)), isNull(refreshTokens.revokedAt)));
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
