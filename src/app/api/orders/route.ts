import { and, asc, count, desc, eq, ilike, inArray, or, sql, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { customers, db, orders } from "@/db";
import { errors, handler, isUuid, likePattern, ok, paginated, parseBody, parsePagination, parseSort } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { companyScope, requireCompany, resolveCompany } from "@/lib/company-context";
import {
  ACTION_TYPES,
  BUSINESS_TIMEZONE,
  ORDER_DOCUMENT_TYPES,
  ORDER_STATUSES,
  type OrderDocumentType,
  type OrderStatus,
} from "@/lib/constants";
import { createRevisionSnapshot } from "@/lib/documents";
import { nextProformaNumber, NUMBER_CONSTRAINTS, withNumberRetry } from "@/lib/number-generator";
import {
  assertOrderRefs,
  getOrderDetail,
  insertOrderItems,
  ORDER_READ_ROUTES,
  orderHeaderValues,
  orderListColumns,
  orderListQuery,
} from "@/lib/orders";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { createProformaSchema, ORDER_SORT_FIELDS, type OrderSortField } from "@/lib/validations";

const sortColumns: Record<OrderSortField, AnyColumn | SQLWrapper> = {
  orderNumber: orders.orderNumber,
  customerName: orderListColumns.customerName,
  status: orders.status,
  documentType: orders.documentType,
  totalCnf: orders.totalCnf,
  createdAt: orders.createdAt,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PIs and CIs only — quotations have their own endpoint (/api/quotations).
 * GET ?documentType=proforma_invoice|commercial_invoice&status=a,b&customerId=&dateFrom=&dateTo=&search=
 */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, ORDER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { sortBy, desc: isDesc } = parseSort(params, ORDER_SORT_FIELDS, "createdAt");
  const search = params.get("search")?.trim();
  const documentType = params.get("documentType");
  if (documentType && !(ORDER_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
    throw errors.badRequest("documentType must be proforma_invoice or commercial_invoice");
  }
  const statuses = (params.get("status") ?? "")
    .split(",")
    .filter((s): s is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(s));
  const customerId = params.get("customerId");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (customerId && !isUuid(customerId)) throw errors.badRequest("Invalid customer");
  if ((dateFrom && !DATE_RE.test(dateFrom)) || (dateTo && !DATE_RE.test(dateTo))) {
    throw errors.badRequest("Dates must be YYYY-MM-DD");
  }
  const localDate = sql`(${orders.createdAt} at time zone ${BUSINESS_TIMEZONE})::date`;

  const where = and(
    eq(orders.isDeleted, false),
    companyScope(orders.companyId, companyId),
    documentType ? eq(orders.documentType, documentType as OrderDocumentType) : undefined,
    statuses.length ? inArray(orders.status, statuses) : undefined,
    customerId ? eq(orders.customerId, customerId) : undefined,
    dateFrom ? sql`${localDate} >= ${dateFrom}::date` : undefined,
    dateTo ? sql`${localDate} <= ${dateTo}::date` : undefined,
    search
      ? or(
          ilike(orders.orderNumber, likePattern(search)),
          ilike(customers.name, likePattern(search)),
          ilike(customers.businessName, likePattern(search)),
          ilike(customers.code, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    orderListQuery()
      .where(where)
      .orderBy((isDesc ? desc : asc)(sortColumns[sortBy]), desc(orders.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});

/** Create a proforma invoice directly (no quotation): draft, PI-{customerCode}-{seq}, sections ON by default. */
export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_proforma_invoices", { meta, companyId });

  const input = await parseBody(req, createProformaSchema);
  await assertOrderRefs(companyId, input);
  const [customer] = await db
    .select({ code: customers.code })
    .from(customers)
    .where(eq(customers.id, input.customerId));

  const id = await withNumberRetry(NUMBER_CONSTRAINTS.proforma, () =>
    db.transaction(async (tx) => {
      const orderNumber = await nextProformaNumber(tx, companyId, customer.code);
      const [row] = await tx
        .insert(orders)
        .values({
          companyId,
          orderNumber,
          documentType: "proforma_invoice",
          status: "draft",
          revisionNumber: 1,
          convertedFromQuotationId: null,
          createdBy: user.id,
          ...orderHeaderValues(input),
        })
        .returning({ id: orders.id });
      await insertOrderItems(tx, row.id, input.items);
      await createRevisionSnapshot(tx, "proforma_invoice", row.id, user.id, "Created");
      return row.id;
    }),
  );

  const detail = await getOrderDetail(id, companyId);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PI_CREATED,
    entityName: "Order",
    entityId: id,
    newValue: detail,
    meta,
  });
  return ok(detail, { status: 201 });
});
