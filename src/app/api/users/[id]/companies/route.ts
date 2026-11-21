import { db } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { invalidateCompanyCache } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { actorCompanyIds, assertCanManage, assignCompanies, findUser } from "@/lib/users";
import { companyAssignmentSchema } from "@/lib/validations";

export const PUT = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "User");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_users", { meta, companyId: null });

  const scope = await actorCompanyIds(user);
  const before = await findUser(id, scope);
  if (!before) throw errors.notFound("User");
  assertCanManage(user, before);
  if (before.role === "owner") throw errors.badRequest("Owner accounts have access to every company");

  const input = await parseBody(req, companyAssignmentSchema);
  await db.transaction((tx) => assignCompanies(tx, id, input, scope));
  invalidateCompanyCache();

  const after = await findUser(id, scope);
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.USER_UPDATED,
    entityName: "User",
    entityId: id,
    oldValue: { companies: before.companies },
    newValue: { companies: after?.companies },
    meta,
  });
  return ok(after);
});
