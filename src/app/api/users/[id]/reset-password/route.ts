import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { hashPassword, invalidateAccountCache, requireAuth } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions";
import { loginKey, resetRateLimit } from "@/lib/rate-limit";
import { revokeAllUserTokens } from "@/lib/refresh-tokens";
import { getRequestMeta } from "@/lib/request-meta";
import { actorCompanyIds, assertCanManage, findUser } from "@/lib/users";
import { resetPasswordSchema } from "@/lib/validations";

/** Admin reset: signs the user out everywhere and clears any login lockout. */
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "User");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_users", { meta, companyId: null });

  const target = await findUser(id, await actorCompanyIds(user));
  if (!target) throw errors.notFound("User");
  assertCanManage(user, target);

  const input = await parseBody(req, resetPasswordSchema);
  const now = new Date();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), passwordChangedAt: now, updatedAt: now })
    .where(eq(users.id, id));
  await revokeAllUserTokens(id);
  resetRateLimit(loginKey(target.username));

  invalidateAccountCache(id);
  auditLog({ user, companyId: null, actionType: ACTION_TYPES.PASSWORD_RESET, entityName: "User", entityId: id, newValue: { username: target.username }, meta });
  return ok({ reset: true });
});
