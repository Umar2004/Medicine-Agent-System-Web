import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { BUSINESS_TIMEZONE, NEAR_EXPIRY_MONTHS } from "@/lib/constants";
import { getPermissionKeys } from "@/lib/permissions";
import { resolveReportScope } from "@/lib/reports";

type Row = Record<string, unknown>;
const rowsOf = async <T extends Row>(q: SQL) => (await db.execute(q)) as unknown as T[];
const n = (v: unknown) => Number(v ?? 0);

const TODAY = sql`(now() at time zone ${BUSINESS_TIMEZONE})::date`;
const MONTH_START = sql`date_trunc('month', now() at time zone ${BUSINESS_TIMEZONE})::date`;
const local = (col: SQL) => sql`(${col} at time zone ${BUSINESS_TIMEZONE})::date`;
const EXP_DATE = sql`(case when b.exp ~ '^(0[1-9]|1[0-2])/[0-9]{4}$' then to_date(b.exp, 'MM/YYYY') end)`;

/**
 * KPIs + chart data (MASTER_PROMPT Phase 4). Stock figures are warehouse-wide; quotation and
 * sales figures follow the company scope (owner "All companies" / admin `scope=all` = combined).
 * Sales numbers only for users who can see reports or invoices.
 */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const [scope, keys] = await Promise.all([resolveReportScope(req, user), getPermissionKeys(user.role)]);
  const showSales = user.role === "owner" || keys.has("view_reports") || keys.has("manage_invoices");

  const inScope = (col: SQL): SQL =>
    scope.companyIds === null
      ? sql`true`
      : scope.companyIds.length === 0
        ? sql`false`
        : sql`${col} in (${sql.join(scope.companyIds.map((id) => sql`${id}::uuid`), sql`, `)})`;

  // Sales queries start together with the KPI queries (one round trip instead of two).
  const loadSales = async () => {
    const live = sql`v.is_deleted = false and v.status <> 'cancelled' and ${inScope(sql`v.company_id`)}`;
    const [[month], trend, top] = await Promise.all([
      rowsOf(sql`
        select coalesce(sum(v.total_amount_usd) filter (where ${local(sql`v.created_at`)} >= ${MONTH_START}), 0)::float8 as month_total,
               count(*) filter (where ${local(sql`v.created_at`)} >= ${MONTH_START})::int as month_invoices,
               coalesce(sum(v.total_amount_usd) filter (where ${local(sql`v.created_at`)} >= ${MONTH_START} - interval '1 month'
                 and ${local(sql`v.created_at`)} < ${MONTH_START}), 0)::float8 as prev_total
        from app.invoices v where ${live}`),
      rowsOf(sql`
        with months as (
          select generate_series(${MONTH_START} - interval '11 months', ${MONTH_START}, interval '1 month')::date as m)
        select to_char(m.m, 'YYYY-MM') as month, coalesce(sum(v.total_amount_usd), 0)::float8 as total
        from months m
        left join app.invoices v on date_trunc('month', ${local(sql`v.created_at`)})::date = m.m and ${live}
        group by m.m order by m.m`),
      rowsOf(sql`
        select p.id, p.brand_name, sum(ii.quantity)::int as quantity, sum(ii.line_total)::float8 as value
        from app.invoice_items ii
        join app.invoices v on v.id = ii.invoice_id
        join app.products p on p.id = ii.product_id
        where ${live} and ${local(sql`v.created_at`)} >= ${TODAY} - 90
        group by p.id order by value desc limit 5`),
    ]);
    return {
      monthTotal: n(month?.month_total),
      previousMonthTotal: n(month?.prev_total),
      monthInvoices: n(month?.month_invoices),
      trend: trend.map((r) => ({ month: String(r.month), total: n(r.total) })),
      topProducts: top.map((r) => ({ productId: String(r.id), brandName: String(r.brand_name), quantity: n(r.quantity), value: n(r.value) })),
    };
  };

  const [[orderKpis], [stockKpis], lowStock, nearExpiry, recent, sales] = await Promise.all([
    rowsOf(sql`
      select (select count(*)::int from app.quotations q
                where q.is_deleted = false and ${inScope(sql`q.company_id`)}
                  and ${local(sql`q.created_at`)} = ${TODAY}) as today_quotations,
             count(*) filter (where o.status in ('sent', 'negotiating'))::int as awaiting_confirmation,
             count(*) filter (where o.status = 'confirmed')::int as awaiting_batches,
             count(*) filter (where o.status = 'batch_assigned')::int as ready_to_invoice
      from app.orders o where o.is_deleted = false and ${inScope(sql`o.company_id`)}`),
    rowsOf(sql`
      select
        (select count(*)::int from (
           select p.id from app.products p
           left join app.product_batches b on b.product_id = p.id and b.is_deleted = false
           where p.is_deleted = false group by p.id, p.low_stock_threshold
           having coalesce(sum(b.stock_quantity), 0) < p.low_stock_threshold) x) as low_stock,
        (select count(*)::int from app.product_batches b where b.is_deleted = false and b.is_active and b.stock_quantity > 0
           and ${EXP_DATE} >= date_trunc('month', ${TODAY})
           and ${EXP_DATE} < date_trunc('month', ${TODAY}) + make_interval(months => ${NEAR_EXPIRY_MONTHS})) as near_expiry,
        (select count(*)::int from app.product_batches b where b.is_deleted = false and b.stock_quantity > 0
           and ${EXP_DATE} < date_trunc('month', ${TODAY})) as expired_with_stock`),
    rowsOf(sql`
      select p.id, p.brand_name, p.low_stock_threshold as threshold, coalesce(sum(b.stock_quantity), 0)::int as stock
      from app.products p
      left join app.product_batches b on b.product_id = p.id and b.is_deleted = false
      where p.is_deleted = false
      group by p.id
      -- Only products at or near their threshold, so one huge stock doesn't flatten the chart.
      having coalesce(sum(b.stock_quantity), 0) <= 3 * p.low_stock_threshold
      order by coalesce(sum(b.stock_quantity), 0)::float8 / greatest(p.low_stock_threshold, 1), p.brand_name
      limit 10`),
    rowsOf(sql`
      select b.id, b.batch_number, b.exp, b.stock_quantity, p.brand_name, p.id as product_id
      from app.product_batches b join app.products p on p.id = b.product_id
      where b.is_deleted = false and b.stock_quantity > 0
        and ${EXP_DATE} < date_trunc('month', ${TODAY}) + make_interval(months => ${NEAR_EXPIRY_MONTHS})
      order by ${EXP_DATE}, p.brand_name limit 6`),
    rowsOf(sql`
      select o.id, o.order_number, o.status, o.total_cnf::float8 as total, o.created_at,
             coalesce(nullif(c.business_name, ''), c.name) as customer
      from app.orders o join app.customers c on c.id = o.customer_id
      where o.is_deleted = false and ${inScope(sql`o.company_id`)}
      order by o.created_at desc limit 6`),
    showSales ? loadSales() : Promise.resolve(null),
  ]);

  return ok({
    scope: scope.label,
    kpis: {
      todayQuotations: n(orderKpis?.today_quotations),
      awaitingConfirmation: n(orderKpis?.awaiting_confirmation),
      awaitingBatches: n(orderKpis?.awaiting_batches),
      readyToInvoice: n(orderKpis?.ready_to_invoice),
      lowStock: n(stockKpis?.low_stock),
      nearExpiry: n(stockKpis?.near_expiry),
      expiredWithStock: n(stockKpis?.expired_with_stock),
    },
    sales,
    stockLevels: lowStock.map((r) => ({ productId: String(r.id), brandName: String(r.brand_name), stock: n(r.stock), threshold: n(r.threshold) })),
    nearExpiry: nearExpiry.map((r) => ({
      batchId: String(r.id),
      productId: String(r.product_id),
      batchNumber: String(r.batch_number),
      brandName: String(r.brand_name),
      exp: String(r.exp),
      stock: n(r.stock_quantity),
    })),
    recentOrders: recent.map((r) => ({
      id: String(r.id),
      orderNumber: String(r.order_number),
      status: String(r.status),
      total: n(r.total),
      customer: String(r.customer),
      createdAt: new Date(String(r.created_at)).toISOString(),
    })),
  });
});
