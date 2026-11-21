import { and, asc, eq, inArray } from "drizzle-orm";
import { dashboardModules, db, roleFunctionPermissions, rolePermissions } from "@/db";
import { errors, handler, ok, parseBody } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { ACTION_TYPES, ROLES, type Role } from "@/lib/constants";
import { OWNER_ONLY_ROUTES } from "@/lib/navigation";
import { invalidatePermissionCache, requireOwner } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { permissionsUpdateSchema } from "@/lib/validations";

const EDITABLE_ROLES = ROLES.filter((r) => r !== "owner");

async function readMatrix() {
  const [modules, fnRows, moduleRows] = await Promise.all([
    db.select().from(dashboardModules).where(eq(dashboardModules.isActive, true)).orderBy(asc(dashboardModules.sortOrder)),
    db.select({ role: roleFunctionPermissions.role, key: roleFunctionPermissions.permissionKey }).from(roleFunctionPermissions),
    db.select({ role: rolePermissions.role, moduleId: rolePermissions.moduleId }).from(rolePermissions),
  ]);
  const routeOf = new Map(modules.map((m) => [m.id, m.route]));
  return {
    modules: modules
      .filter((m): m is typeof m & { route: string } => !!m.route)
      .map((m) => ({
        id: m.id,
        title: m.title,
        route: m.route,
        isDefault: m.isDefault,
        ownerOnly: OWNER_ONLY_ROUTES.includes(m.route),
      })),
    roles: EDITABLE_ROLES.map((role) => ({
      role,
      permissions: fnRows.filter((r) => r.role === role).map((r) => r.key),
      routes: moduleRows
        .filter((r) => r.role === role)
        .map((r) => routeOf.get(r.moduleId))
        .filter((r): r is string => !!r && !OWNER_ONLY_ROUTES.includes(r)),
    })),
  };
}

export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  requireOwner(user, { meta: getRequestMeta(req), companyId: null });
  return ok(await readMatrix());
});

/** Replaces both permission types for the roles sent. Owner-only and always-visible pages can't be granted. */
export const PUT = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  requireOwner(user, { meta, companyId: null });

  const input = await parseBody(req, permissionsUpdateSchema);
  const before = await readMatrix();
  const moduleByRoute = new Map(before.modules.map((m) => [m.route, m]));

  for (const entry of input.roles) {
    for (const route of entry.routes) {
      const mod = moduleByRoute.get(route);
      if (!mod) throw errors.badRequest(`Unknown page: ${route}`);
      if (mod.ownerOnly) throw errors.badRequest(`${mod.title} is available to the owner only`);
    }
  }

  const editableModuleIds = before.modules.filter((m) => !m.isDefault && !m.ownerOnly).map((m) => m.id);

  await db.transaction(async (tx) => {
    for (const entry of input.roles) {
      const role = entry.role as Role;
      await tx.delete(roleFunctionPermissions).where(eq(roleFunctionPermissions.role, role));
      // Only the pages this matrix edits; rows for always-visible pages stay as they are.
      if (editableModuleIds.length) {
        await tx.delete(rolePermissions).where(and(eq(rolePermissions.role, role), inArray(rolePermissions.moduleId, editableModuleIds)));
      }
      const keys = [...new Set(entry.permissions)];
      if (keys.length) {
        await tx.insert(roleFunctionPermissions).values(keys.map((permissionKey) => ({ role, permissionKey })));
      }
      const moduleIds = [...new Set(entry.routes)]
        .map((r) => moduleByRoute.get(r))
        .filter((m) => !!m && !m.isDefault)
        .map((m) => m!.id);
      if (moduleIds.length) {
        await tx.insert(rolePermissions).values(moduleIds.map((moduleId) => ({ role, moduleId })));
      }
    }
  });
  invalidatePermissionCache();

  const after = await readMatrix();
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.PERMISSIONS_UPDATED,
    entityName: "Permissions",
    oldValue: Object.fromEntries(before.roles.map(({ role, ...r }) => [role, r])),
    newValue: Object.fromEntries(after.roles.map(({ role, ...r }) => [role, r])),
    meta,
  });
  return ok(after);
});
