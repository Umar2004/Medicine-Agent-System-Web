import { and, eq, sql } from "drizzle-orm";
import { db, users } from "@/db";
import { errors, handler, ok, parseBody } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { setAuthCookies, verifyPassword } from "@/lib/auth";
import { getAccessibleCompanies } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { checkRateLimit, LOGIN_LIMIT, loginKey, recordHit, resetRateLimit } from "@/lib/rate-limit";
import { issueRefreshToken } from "@/lib/refresh-tokens";
import { getRequestMeta } from "@/lib/request-meta";
import { loginSchema } from "@/lib/validations";

export const POST = handler(async (req) => {
  const meta = getRequestMeta(req);
  const { username, password } = await parseBody(req, loginSchema);
  const limitKey = loginKey(username);

  const limit = checkRateLimit(limitKey, LOGIN_LIMIT.attempts);
  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    throw errors.tooManyRequests(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.username}) = lower(${username})`, eq(users.isDeleted, false)))
    .limit(1);

  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !passwordOk) {
    recordHit(limitKey, LOGIN_LIMIT.windowMs);
    auditLog({
      user: user ? { id: user.id, username: user.username } : null,
      username,
      companyId: null,
      actionType: ACTION_TYPES.LOGIN_FAILED,
      entityName: "User",
      newValue: { reason: "invalid_credentials" },
      meta,
    });
    throw errors.unauthorized("Invalid username or password");
  }

  if (user.status !== "active") {
    auditLog({
      user: { id: user.id, username: user.username },
      companyId: null,
      actionType: ACTION_TYPES.LOGIN_FAILED,
      entityName: "User",
      entityId: user.id,
      newValue: { reason: "inactive" },
      meta,
    });
    throw errors.forbidden("Your account has been deactivated. Contact an administrator.");
  }

  resetRateLimit(limitKey);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const session = { id: user.id, username: user.username, role: user.role, fullName: user.fullName };
  const refresh = await issueRefreshToken(user.id, meta);
  const companies = await getAccessibleCompanies(session);

  const res = ok({ user: session, companies });
  await setAuthCookies(res, session, refresh);

  auditLog({
    user: session,
    companyId: null,
    actionType: ACTION_TYPES.LOGIN,
    entityName: "User",
    entityId: user.id,
    meta,
  });
  return res;
});
