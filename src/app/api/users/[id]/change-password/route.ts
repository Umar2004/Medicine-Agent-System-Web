import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { hashPassword, invalidateAccountCache, requireAuth, setAuthCookies, verifyPassword } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { checkRateLimit, LOGIN_LIMIT, recordHit, resetRateLimit } from "@/lib/rate-limit";
import { issueRefreshToken, revokeAllUserTokens } from "@/lib/refresh-tokens";
import { getRequestMeta } from "@/lib/request-meta";
import { changePasswordSchema } from "@/lib/validations";

/** Self-service only. Signs out every other device; this one stays signed in with fresh tokens. */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "User");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  if (id !== user.id) throw errors.forbidden("You can only change your own password");

  const input = await parseBody(req, changePasswordSchema);
  const limitKey = `change-password:${user.id}`;
  const limit = checkRateLimit(limitKey, LOGIN_LIMIT.attempts);
  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    throw errors.tooManyRequests(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, id)).limit(1);
  if (!(await verifyPassword(input.currentPassword, row?.passwordHash ?? null))) {
    recordHit(limitKey, LOGIN_LIMIT.windowMs);
    throw errors.badRequest("Your current password is incorrect");
  }
  resetRateLimit(limitKey);

  const now = new Date();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), passwordChangedAt: now, updatedAt: now })
    .where(eq(users.id, id));
  await revokeAllUserTokens(id);

  const res = ok({ changed: true });
  await setAuthCookies(res, user, await issueRefreshToken(id, meta));
  invalidateAccountCache(id);
  auditLog({ user, companyId: null, actionType: ACTION_TYPES.PASSWORD_CHANGED, entityName: "User", entityId: id, meta });
  return res;
});
