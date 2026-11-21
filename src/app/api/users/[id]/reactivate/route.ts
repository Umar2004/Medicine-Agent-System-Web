import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { errors, handler, ok, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { invalidateAccountCache, requireAuth } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { actorCompanyIds, assertCanManage, findUser } from "@/lib/users";

export const POST = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "User");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_users", { meta, companyId: null });

  const scope = await actorCompanyIds(user);
  const target = await findUser(id, scope);
  if (!target) throw errors.notFound("User");
  assertCanManage(user, target);

  await db.update(users).set({ status: "active", updatedAt: new Date() }).where(eq(users.id, id));

  invalidateAccountCache(id);
  auditLog({ user, companyId: null, actionType: ACTION_TYPES.USER_REACTIVATED, entityName: "User", entityId: id, newValue: { username: target.username }, meta });
  return ok(await findUser(id, scope));
});
