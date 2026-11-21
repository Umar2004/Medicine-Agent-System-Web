import "server-only";
import { and, eq, or } from "drizzle-orm";
import { dashboardModules, db, roleFunctionPermissions, rolePermissions } from "@/db";
import { errors } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { ACTION_TYPES, PERMISSION_KEYS, type PermissionKey, type Role } from "@/lib/constants";
import type { SessionUser } from "@/lib/jwt";
import { NAV_ITEMS, OWNER_ONLY_ROUTES } from "@/lib/navigation";
import type { RequestMeta } from "@/lib/request-meta";
import { ttlCache } from "@/lib/ttl-cache";

// Small TTL cache — permissions change rarely. Call invalidatePermissionCache() after edits.
// Shared via globalThis (ttlCache) so the Roles page's invalidation reaches every route bundle.
const keyCache = ttlCache<Set<PermissionKey>>("permission-keys", 60_000);
const moduleCache = ttlCache<Set<string>>("visible-routes", 60_000);

export function invalidatePermissionCache(): void {
  keyCache.clear();
  moduleCache.clear();
}

export async function getPermissionKeys(role: Role): Promise<Set<PermissionKey>> {
  if (role === "owner") return new Set(PERMISSION_KEYS);
  const hit = keyCache.get(role);
  if (hit) return hit;
  const rows = await db
    .select({ key: roleFunctionPermissions.permissionKey })
    .from(roleFunctionPermissions)
    .where(eq(roleFunctionPermissions.role, role));
  const keys = new Set(rows.map((r) => r.key));
  keyCache.set(role, keys);
  return keys;
}

/** Sidebar routes visible to a role. Owner sees all; default modules are visible to everyone. */
export async function getVisibleRoutes(role: Role): Promise<Set<string>> {
  if (role === "owner") return new Set(NAV_ITEMS.map((i) => i.route));
  const hit = moduleCache.get(role);
  if (hit) return hit;
  const rows = await db
    .selectDistinct({ route: dashboardModules.route })
    .from(dashboardModules)
    .leftJoin(
      rolePermissions,
      and(eq(rolePermissions.moduleId, dashboardModules.id), eq(rolePermissions.role, role)),
    )
    .where(
      and(
        eq(dashboardModules.isActive, true),
        or(eq(dashboardModules.isDefault, true), eq(rolePermissions.role, role)),
      ),
    );
  const routes = new Set(
    rows.map((r) => r.route).filter((r): r is string => !!r && !OWNER_ONLY_ROUTES.includes(r)),
  );
  moduleCache.set(role, routes);
  return routes;
}

interface DenyContext {
  meta: RequestMeta;
  companyId: string | null;
}

function deny(user: SessionUser, ctx: DenyContext, what: string): never {
  auditLog({
    user,
    companyId: ctx.companyId,
    actionType: ACTION_TYPES.PERMISSION_DENIED,
    entityName: what,
    meta: ctx.meta,
  });
  throw errors.forbidden();
}

/** Write access: owner always; others need the FunctionKey permission. */
export async function requirePermission(user: SessionUser, key: PermissionKey, ctx: DenyContext): Promise<void> {
  if (user.role === "owner") return;
  const keys = await getPermissionKeys(user.role);
  if (!keys.has(key)) deny(user, ctx, `permission:${key}`);
}

/** For actions several permissions unlock (e.g. supplier prices: manage_suppliers or view_reports). */
export async function requireAnyPermission(user: SessionUser, keys: PermissionKey[], ctx: DenyContext): Promise<void> {
  if (user.role === "owner") return;
  const held = await getPermissionKeys(user.role);
  if (!keys.some((k) => held.has(k))) deny(user, ctx, `permission:${keys.join("|")}`);
}

/**
 * Read access: granted by sidebar visibility (CLAUDE.md §6). Pass every page whose
 * workflow needs this data (e.g. products are read from the quotation wizard too).
 */
export async function requireAnyModule(user: SessionUser, routes: string[], ctx: DenyContext): Promise<void> {
  if (user.role === "owner") return;
  const visible = await getVisibleRoutes(user.role);
  if (!routes.some((r) => visible.has(r))) deny(user, ctx, `module:${routes.join("|")}`);
}

export function requireOwner(user: SessionUser, ctx: DenyContext): void {
  if (user.role !== "owner") deny(user, ctx, "owner-only");
}
