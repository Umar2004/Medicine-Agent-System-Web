import "server-only";
import { and, eq, inArray, ne, notExists, or, exists, sql, type SQL } from "drizzle-orm";
import { companies, db, userCompanyAccess, users, type Transaction } from "@/db";
import { errors } from "@/lib/api";
import { getAccessibleCompanies } from "@/lib/company-context";
import { assignableRoles, canManageRole, type Role } from "@/lib/constants";
import type { SessionUser } from "@/lib/jwt";
import type { CompanyAssignmentInput } from "@/lib/validations";

export const USER_READ_ROUTES = ["/users"];

interface UserCompany {
  id: string;
  name: string;
  isDefault: boolean;
}

/** Never includes the password hash, so rows are safe to return and to audit. */
export const userColumns = {
  id: users.id,
  username: users.username,
  fullName: users.fullName,
  email: users.email,
  phone: users.phone,
  role: users.role,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  companies: sql<UserCompany[]>`coalesce((
    select json_agg(json_build_object('id', c.id, 'name', c.name, 'isDefault', a.is_default) order by c.name)
    from app.user_company_access a join app.companies c on c.id = a.company_id
    where a.user_id = app.users.id and c.is_deleted = false), '[]'::json)`, // written out: Drizzle drops the table name from ${users.id} here
};

/** Companies the actor may hand out; null = all (owner). */
export async function actorCompanyIds(actor: SessionUser): Promise<string[] | null> {
  if (actor.role === "owner") return null;
  return (await getAccessibleCompanies(actor)).map((c) => c.id);
}

/**
 * Non-owners see users in their own companies (plus unassigned ones they can pick up),
 * never owner accounts.
 */
export function visibleUsersWhere(scope: string[] | null): SQL | undefined {
  if (scope === null) return undefined;
  const access = (where?: SQL) =>
    db
      .select({ one: sql`1` })
      .from(userCompanyAccess)
      .where(and(eq(userCompanyAccess.userId, users.id), where));
  return and(
    ne(users.role, "owner"),
    or(
      notExists(access()),
      scope.length ? exists(access(inArray(userCompanyAccess.companyId, scope))) : sql`false`,
    ),
  );
}

/** Hides the names of companies the actor has no access to. */
export function scopeCompanies<T extends { companies: UserCompany[] }>(row: T, scope: string[] | null): T {
  return scope === null ? row : { ...row, companies: row.companies.filter((c) => scope.includes(c.id)) };
}

export async function findUser(id: string, scope: string[] | null = null) {
  const [row] = await db
    .select(userColumns)
    .from(users)
    .where(and(eq(users.id, id), eq(users.isDeleted, false), visibleUsersWhere(scope)))
    .limit(1);
  return row ? scopeCompanies(row, scope) : null;
}

export type ManagedUserRow = NonNullable<Awaited<ReturnType<typeof findUser>>>;

/** Own account goes through Settings, so nobody can lock themselves out from the Users page. */
export function assertCanManage(actor: SessionUser, target: { id: string; role: Role }): void {
  if (target.id === actor.id) throw errors.forbidden("Use Settings to change your own account");
  if (!canManageRole(actor.role, target.role)) throw errors.forbidden("You can only manage users below your own role");
}

export function assertAssignableRole(actor: SessionUser, role: Role): void {
  if (!assignableRoles(actor.role).includes(role)) throw errors.forbidden("You cannot assign this role");
}

/** Replaces the assignments the actor controls; those in companies they can't see are left alone. */
export async function assignCompanies(
  tx: Transaction,
  userId: string,
  input: CompanyAssignmentInput,
  scope: string[] | null,
): Promise<void> {
  const ids = [...new Set(input.companyIds)];
  if (scope && ids.some((id) => !scope.includes(id))) {
    throw errors.forbidden("You can only assign companies you have access to");
  }
  const found = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(inArray(companies.id, ids), eq(companies.isDeleted, false)));
  if (found.length !== ids.length) throw errors.badRequest("Selected company does not exist");

  await tx
    .delete(userCompanyAccess)
    .where(and(eq(userCompanyAccess.userId, userId), scope ? inArray(userCompanyAccess.companyId, scope) : undefined));
  await tx.insert(userCompanyAccess).values(ids.map((companyId) => ({ userId, companyId, isDefault: false })));

  const [kept] = await tx
    .select({ id: userCompanyAccess.id })
    .from(userCompanyAccess)
    .where(and(eq(userCompanyAccess.userId, userId), eq(userCompanyAccess.isDefault, true)))
    .limit(1);
  if (input.defaultCompanyId || !kept) {
    await tx.update(userCompanyAccess).set({ isDefault: false }).where(eq(userCompanyAccess.userId, userId));
    await tx
      .update(userCompanyAccess)
      .set({ isDefault: true })
      .where(and(eq(userCompanyAccess.userId, userId), eq(userCompanyAccess.companyId, input.defaultCompanyId || ids[0])));
  }
}
