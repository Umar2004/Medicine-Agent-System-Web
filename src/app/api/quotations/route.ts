import { and, asc, count, desc, eq, ilike, inArray, or, sql, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { customers, db, quotations } from "@/db";
import { errors, handler, isUuid, likePattern, ok, paginated, parseBody, parsePagination, parseSort } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { companyScope, requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES, BUSINESS_TIMEZONE, QUOTATION_STATUSES, type QuotationStatus } from "@/lib/constants";
import { createRevisionSnapshot } from "@/lib/documents";
import { nextQuotationNumber, NUMBER_CONSTRAINTS, withNumberRetry } from "@/lib/number-generator";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import {
  assertQuotationRefs,
  getQuotationDetail,
  insertQuotationItems,
  QUOTATION_READ_ROUTES,
  quotationHeaderValues,
  quotationListColumns,
  quotationListQuery,
} from "@/lib/quotations";
import { getRequestMeta } from "@/lib/request-meta";
import { createQuotationSchema, QUOTATION_SORT_FIELDS, type QuotationSortField } from "@/lib/validations";

const sortColumns: Record<QuotationSortField, AnyColumn | SQLWrapper> = {
  quotationNumber: quotations.quotationNumber,
  customerName: quotationListColumns.customerName,
  status: quotations.status,
  totalCnf: quotations.totalCnf,
  createdAt: quotations.createdAt,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?status=a,b&customerId=&dateFrom=&dateTo=&search=&sortBy=&sortDir=&page=&pageSize= */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, QUOTATION_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { sortBy, desc: isDesc } = parseSort(params, QUOTATION_SORT_FIELDS, "createdAt");
  const search = params.get("search")?.trim();
  const statuses = (params.get("status") ?? "")
    .split(",")
    .filter((s): s is QuotationStatus => (QUOTATION_STATUSES as readonly string[]).includes(s));
  const customerId = params.get("customerId");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (customerId && !isUuid(customerId)) throw errors.badRequest("Invalid customer");
  if ((dateFrom && !DATE_RE.test(dateFrom)) || (dateTo && !DATE_RE.test(dateTo))) {
    throw errors.badRequest("Dates must be YYYY-MM-DD");
  }
  const localDate = sql`(${quotations.createdAt} at time zone ${BUSINESS_TIMEZONE})::date`;

  const where = and(
    eq(quotations.isDeleted, false),
    companyScope(quotations.companyId, companyId),
    statuses.length ? inArray(quotations.status, statuses) : undefined,
    customerId ? eq(quotations.customerId, customerId) : undefined,
    dateFrom ? sql`${localDate} >= ${dateFrom}::date` : undefined,
    dateTo ? sql`${localDate} <= ${dateTo}::date` : undefined,
    search
      ? or(
          ilike(quotations.quotationNumber, likePattern(search)),
          ilike(customers.name, likePattern(search)),
          ilike(customers.businessName, likePattern(search)),
          ilike(customers.code, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    quotationListQuery()
      .where(where)
      .orderBy((isDesc ? desc : asc)(sortColumns[sortBy]), desc(quotations.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});

/** Create a quotation: status=draft, number QT-{customerCode}-{seq}, never touches inventory. */
export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_quotations", { meta, companyId });

  const input = await parseBody(req, createQuotationSchema);
  await assertQuotationRefs(companyId, input);
  const [customer] = await db
    .select({ code: customers.code })
    .from(customers)
    .where(eq(customers.id, input.customerId));

  const id = await withNumberRetry(NUMBER_CONSTRAINTS.quotation, () =>
    db.transaction(async (tx) => {
      const quotationNumber = await nextQuotationNumber(tx, companyId, customer.code);
      const [row] = await tx
        .insert(quotations)
        .values({
          companyId,
          quotationNumber,
          status: "draft",
          revisionNumber: 1,
          createdBy: user.id,
          ...quotationHeaderValues(input),
        })
        .returning({ id: quotations.id });
      await insertQuotationItems(tx, row.id, input.items);
      await createRevisionSnapshot(tx, "quotation", row.id, user.id, "Created");
      return row.id;
    }),
  );

  const detail = await getQuotationDetail(id, companyId);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.QUOTATION_CREATED,
    entityName: "Quotation",
    entityId: id,
    newValue: detail,
    meta,
  });
  return ok(detail, { status: 201 });
});
