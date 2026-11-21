import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { invalidateAccountCache, requireAuth } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { revokeAllUserTokens } from "@/lib/refresh-tokens";
import { getRequestMeta } from "@/lib/request-meta";
import { actorCompanyIds, assertAssignableRole, assertCanManage, findUser, USER_READ_ROUTES } from "@/lib/users";
import { emptyToNull, userUpdateSchema } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "User");
  const user = await requireAuth(req);
  await requireAnyModule(user, USER_READ_ROUTES, { meta: getRequestMeta(req), companyId: null });

  const found = await findUser(id, await actorCompanyIds(user));
  if (!found) throw errors.notFound("User");
  return ok(found);
});

export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "User");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_users", { meta, companyId: null });

  const scope = await actorCompanyIds(user);
  const before = await findUser(id, scope);
  if (!before) throw errors.notFound("User");
  assertCanManage(user, before);

  const input = await parseBody(req, userUpdateSchema);
  if (input.role !== before.role) {
    if (before.role === "owner") throw errors.forbidden("An owner account keeps the owner role");
    assertAssignableRole(user, input.role);
  }

  await db
    .update(users)
    .set({
      fullName: input.fullName,
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      role: input.role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  const after = await findUser(id, scope);
  invalidateAccountCache(id);
  auditLog({ user, companyId: null, actionType: ACTION_TYPES.USER_UPDATED, entityName: "User", entityId: id, oldValue: before, newValue: after, meta });
  if (input.role !== before.role) {
    auditLog({
      user,
      companyId: null,
      actionType: ACTION_TYPES.USER_ROLE_CHANGED,
      entityName: "User",
      entityId: id,
      oldValue: { role: before.role },
      newValue: { role: input.role },
      meta,
    });
  }
  return ok(after);
});

export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "User");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_users", { meta, companyId: null });

  const before = await findUser(id, await actorCompanyIds(user));
  if (!before) throw errors.notFound("User");
  assertCanManage(user, before);

  await db.update(users).set({ isDeleted: true, status: "inactive", updatedAt: new Date() }).where(eq(users.id, id));
  await revokeAllUserTokens(id);

  invalidateAccountCache(id);
  auditLog({ user, companyId: null, actionType: ACTION_TYPES.USER_DELETED, entityName: "User", entityId: id, oldValue: before, meta });
  return ok({ id });
});
