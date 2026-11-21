import { db, roleFunctionPermissions } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import type { PermissionKey, Role } from "@/lib/constants";

/**
 * Which roles hold each action permission (live Roles-page grants; owner holds everything).
 * Any signed-in user may read it — it only names roles — so pipeline pages can say
 * "waiting for Warehouse Staff" instead of leaving people at a dead end.
 */
export const GET = handler(async (req) => {
  await requireAuth(req);
  const rows = await db
    .select({ role: roleFunctionPermissions.role, key: roleFunctionPermissions.permissionKey })
    .from(roleFunctionPermissions);
  const holders: Partial<Record<PermissionKey, Role[]>> = {};
  for (const r of rows) (holders[r.key] ??= []).push(r.role);
  return ok(holders);
});
