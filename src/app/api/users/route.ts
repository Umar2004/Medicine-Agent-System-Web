import { and, asc, count, desc, eq, ilike, or, sql, type AnyColumn } from "drizzle-orm";
import { db, users } from "@/db";
import { errors, handler, likePattern, ok, paginated, parseBody, parsePagination, parseSort } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { hashPassword, requireAuth } from "@/lib/auth";
import { ACTION_TYPES, ROLES, USER_STATUSES } from "@/lib/constants";
import { isUniqueViolation } from "@/lib/number-generator";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import {
  actorCompanyIds,
  assertAssignableRole,
  assignCompanies,
  findUser,
  scopeCompanies,
  USER_READ_ROUTES,
  userColumns,
  visibleUsersWhere,
} from "@/lib/users";
import { emptyToNull, USER_SORT_FIELDS, userCreateSchema, type UserSortField } from "@/lib/validations";

const sortColumns: Record<UserSortField, AnyColumn> = {
  fullName: users.fullName,
  username: users.username,
  role: users.role,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  await requireAnyModule(user, USER_READ_ROUTES, { meta: getRequestMeta(req), companyId: null });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { sortBy, desc: isDesc } = parseSort(params, USER_SORT_FIELDS, "fullName");
  const search = params.get("search")?.trim();
  const role = ROLES.find((r) => r === params.get("role"));
  const status = USER_STATUSES.find((s) => s === params.get("status"));
  const scope = await actorCompanyIds(user);

  const where = and(
    eq(users.isDeleted, false),
    visibleUsersWhere(scope),
    role ? eq(users.role, role) : undefined,
    status ? eq(users.status, status) : undefined,
    search
      ? or(
          ilike(users.fullName, likePattern(search)),
          ilike(users.username, likePattern(search)),
          ilike(users.email, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select(userColumns)
      .from(users)
      .where(where)
      .orderBy((isDesc ? sql`${sortColumns[sortBy]} desc nulls last` : asc(sortColumns[sortBy])), desc(users.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ]);

  return paginated(rows.map((r) => scopeCompanies(r, scope)), total, page, pageSize);
});

export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_users", { meta, companyId: null });

  const input = await parseBody(req, userCreateSchema);
  assertAssignableRole(user, input.role);
  const scope = await actorCompanyIds(user);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${input.username})`)
    .limit(1);
  // Deleted users keep their username, so the audit trail stays unambiguous.
  if (existing) throw errors.conflict(`The username “${input.username}” is already taken`);

  const passwordHash = await hashPassword(input.password);
  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          username: input.username,
          passwordHash,
          fullName: input.fullName,
          email: emptyToNull(input.email),
          phone: emptyToNull(input.phone),
          role: input.role,
        })
        .returning({ id: users.id });
      await assignCompanies(tx, row.id, input, scope);
      return row.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw errors.conflict(`The username “${input.username}” is already taken`);
    throw err;
  }

  const created = await findUser(id, scope);
  auditLog({ user, companyId: null, actionType: ACTION_TYPES.USER_CREATED, entityName: "User", entityId: id, newValue: created, meta });
  return ok(created, { status: 201 });
});
