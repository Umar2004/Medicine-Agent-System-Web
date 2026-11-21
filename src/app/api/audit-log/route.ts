import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { companies, db, userLogs } from "@/db";
import { errors, handler, likePattern, paginated, parsePagination } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { resolveCompany } from "@/lib/company-context";
import { BUSINESS_TIMEZONE } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const localDay = sql`(${userLogs.createdAt} at time zone ${BUSINESS_TIMEZONE})::date`;

/**
 * Owner with no company selected sees everything. With a company selected (always, for other
 * roles): that company's events, plus company-less ones (logins, shared products and batches)
 * by people who belong to it.
 */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requirePermission(user, "view_audit_log", { meta: getRequestMeta(req), companyId });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const search = params.get("search")?.trim();
  const actionType = params.get("actionType")?.trim();
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if ((dateFrom && !DATE_RE.test(dateFrom)) || (dateTo && !DATE_RE.test(dateTo))) {
    throw errors.badRequest("Dates must be YYYY-MM-DD");
  }

  const where = and(
    companyId
      ? or(
          eq(userLogs.companyId, companyId),
          and(
            isNull(userLogs.companyId),
            sql`${userLogs.userId} in (select user_id from app.user_company_access where company_id = ${companyId}::uuid)`,
          ),
        )
      : undefined,
    actionType ? eq(userLogs.actionType, actionType) : undefined,
    dateFrom ? sql`${localDay} >= ${dateFrom}::date` : undefined,
    dateTo ? sql`${localDay} <= ${dateTo}::date` : undefined,
    search
      ? or(
          ilike(userLogs.username, likePattern(search)),
          ilike(userLogs.entityName, likePattern(search)),
          ilike(userLogs.entityId, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: userLogs.id,
        createdAt: userLogs.createdAt,
        username: userLogs.username,
        companyName: companies.name,
        actionType: userLogs.actionType,
        entityName: userLogs.entityName,
        entityId: userLogs.entityId,
        oldValue: userLogs.oldValue,
        newValue: userLogs.newValue,
        ipAddress: userLogs.ipAddress,
        userAgent: userLogs.userAgent,
        page: userLogs.page,
      })
      .from(userLogs)
      .leftJoin(companies, eq(companies.id, userLogs.companyId))
      .where(where)
      .orderBy(desc(userLogs.createdAt), desc(userLogs.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(userLogs).where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});
