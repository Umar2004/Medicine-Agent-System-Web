import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { handler, ok, parseBody } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { invalidateAccountCache, requireAuth } from "@/lib/auth";
import { getAccessibleCompanies } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { getPermissionKeys, getVisibleRoutes } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { emptyToNull, userProfileSchema } from "@/lib/validations";

const profileColumns = { email: users.email, phone: users.phone, lastLoginAt: users.lastLoginAt };

/** Current session: user, profile, companies, permission keys and visible sidebar routes. */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const [companies, permissions, routes, [profile]] = await Promise.all([
    getAccessibleCompanies(user),
    getPermissionKeys(user.role),
    getVisibleRoutes(user.role),
    db.select(profileColumns).from(users).where(eq(users.id, user.id)).limit(1),
  ]);
  return ok({
    user,
    profile,
    companies,
    permissions: [...permissions],
    routes: [...routes],
  });
});

/** Own name and contact details (Settings). The role and username aren't self-editable. */
export const PUT = handler(async (req) => {
  const user = await requireAuth(req);
  const input = await parseBody(req, userProfileSchema);
  await db
    .update(users)
    .set({ fullName: input.fullName, email: emptyToNull(input.email), phone: emptyToNull(input.phone), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  invalidateAccountCache(user.id);
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.USER_UPDATED,
    entityName: "User",
    entityId: user.id,
    newValue: input,
    meta: getRequestMeta(req),
  });
  return ok({ updated: true });
});
