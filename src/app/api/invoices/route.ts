import { and, asc, count, desc, eq, ilike, or, sql, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { customers, db, invoices, orders } from "@/db";
import { errors, handler, isUuid, likePattern, paginated, parsePagination, parseSort } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { companyScope, resolveCompany } from "@/lib/company-context";
import { BUSINESS_TIMEZONE, INVOICE_STATUSES, type InvoiceStatus } from "@/lib/constants";
import { INVOICE_READ_ROUTES, invoiceListColumns, invoiceListQuery } from "@/lib/invoices";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { INVOICE_SORT_FIELDS, type InvoiceSortField } from "@/lib/validations";

// Invoices are created by finalizing an order (POST /api/orders/[id]/finalize).

const sortColumns: Record<InvoiceSortField, AnyColumn | SQLWrapper> = {
  invoiceNumber: invoices.createdAt, // "13/SFL/08/2026" does not sort as text; creation order does
  customerName: invoiceListColumns.customerName,
  status: invoices.status,
  totalAmountUsd: invoices.totalAmountUsd,
  createdAt: invoices.createdAt,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, INVOICE_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { sortBy, desc: isDesc } = parseSort(params, INVOICE_SORT_FIELDS, "createdAt");
  const search = params.get("search")?.trim();
  const status = params.get("status");
  const customerId = params.get("customerId");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (customerId && !isUuid(customerId)) throw errors.badRequest("Invalid customer");
  if ((dateFrom && !DATE_RE.test(dateFrom)) || (dateTo && !DATE_RE.test(dateTo))) {
    throw errors.badRequest("Dates must be YYYY-MM-DD");
  }
  const localDate = sql`(${invoices.createdAt} at time zone ${BUSINESS_TIMEZONE})::date`;

  const where = and(
    eq(invoices.isDeleted, false),
    companyScope(invoices.companyId, companyId),
    status && (INVOICE_STATUSES as readonly string[]).includes(status) ? eq(invoices.status, status as InvoiceStatus) : undefined,
    customerId ? eq(orders.customerId, customerId) : undefined,
    dateFrom ? sql`${localDate} >= ${dateFrom}::date` : undefined,
    dateTo ? sql`${localDate} <= ${dateTo}::date` : undefined,
    search
      ? or(
          ilike(invoices.invoiceNumber, likePattern(search)),
          ilike(orders.orderNumber, likePattern(search)),
          ilike(customers.name, likePattern(search)),
          ilike(customers.businessName, likePattern(search)),
          ilike(invoices.consigneeName, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    invoiceListQuery()
      .where(where)
      .orderBy((isDesc ? desc : asc)(sortColumns[sortBy]), desc(invoices.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(invoices)
      .leftJoin(orders, eq(orders.id, invoices.orderId))
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});
