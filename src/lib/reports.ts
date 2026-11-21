import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { errors } from "@/lib/api";
import { getAccessibleCompanies, resolveCompany } from "@/lib/company-context";
import { BUSINESS_TIMEZONE, NEAR_EXPIRY_MONTHS } from "@/lib/constants";
import type { SessionUser } from "@/lib/jwt";

// CLAUDE.md §11: 6 report types, 5-min cache, Excel/PDF export, owner cross-company view,
// time-series bucketing. Inventory/expiry are warehouse-wide (shared); sales are per company.

export const REPORT_TYPES = ["inventory", "expiry", "orders", "customers", "manufacturers", "invoice-value"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ValueKind = "text" | "number" | "usd" | "lkr" | "date";

export interface ReportResult {
  type: ReportType;
  title: string;
  subtitle: string;
  generatedAt: string;
  summary: { label: string; value: number | string; kind: ValueKind }[];
  chart: { kind: "bar" | "line"; title: string; categories: string[]; series: { name: string; kind: ValueKind; data: number[]; /** Drawn as a dashed neutral reference, not a colored series. */ reference?: boolean }[] } | null;
  columns: { key: string; header: string; kind: ValueKind }[];
  rows: Record<string, string | number | null>[];
}

export interface ReportParams {
  dateFrom: string;
  dateTo: string;
  months: number;
}

export interface ReportScope {
  /** null = every company (owner "All companies"). */
  companyIds: string[] | null;
  label: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(new Date());
}

export function parseReportParams(searchParams: URLSearchParams): ReportParams {
  const to = searchParams.get("dateTo") || today();
  const fromDefault = new Date(`${to}T00:00:00Z`);
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 89);
  const from = searchParams.get("dateFrom") || fromDefault.toISOString().slice(0, 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw errors.badRequest("Dates must be YYYY-MM-DD");
  if (from > to) throw errors.badRequest("'From' date must be before 'To' date");
  const months = Math.min(24, Math.max(1, Number(searchParams.get("months")) || NEAR_EXPIRY_MONTHS));
  return { dateFrom: from, dateTo: to, months };
}

/**
 * Owner: selected company or all. Admin may ask for `scope=all` = their assigned companies
 * combined (accepted default). Everyone else: the resolved company.
 */
export async function resolveReportScope(req: NextRequest, user: SessionUser): Promise<ReportScope> {
  const wantAll = req.nextUrl.searchParams.get("scope") === "all";
  if (user.role === "admin" && wantAll) {
    const companies = await getAccessibleCompanies(user);
    return { companyIds: companies.map((c) => c.id), label: `${companies.length} assigned companies` };
  }
  const companyId = await resolveCompany(req, user);
  if (!companyId) return { companyIds: null, label: "All companies" };
  const companies = await getAccessibleCompanies(user);
  return { companyIds: [companyId], label: companies.find((c) => c.id === companyId)?.name ?? "Company" };
}

function inScope(column: SQL, scope: ReportScope): SQL {
  if (scope.companyIds === null) return sql`true`;
  if (scope.companyIds.length === 0) return sql`false`;
  return sql`${column} in (${sql.join(scope.companyIds.map((id) => sql`${id}::uuid`), sql`, `)})`;
}

const localDate = (column: SQL) => sql`(${column} at time zone ${BUSINESS_TIMEZONE})::date`;
const inRange = (column: SQL, p: ReportParams) =>
  sql`${localDate(column)} between ${p.dateFrom}::date and ${p.dateTo}::date`;

/** Bucket size from the range length: ≤ 31 days → day, ≤ 180 → week, else month. */
function bucketFor(p: ReportParams): "day" | "week" | "month" {
  const days = (Date.parse(p.dateTo) - Date.parse(p.dateFrom)) / 86_400_000 + 1;
  return days <= 31 ? "day" : days <= 180 ? "week" : "month";
}

/** Every bucket in the range, so empty periods still show as 0. */
function bucketSeries(p: ReportParams, bucket: "day" | "week" | "month"): SQL {
  return sql`select generate_series(date_trunc(${bucket}, ${p.dateFrom}::date), date_trunc(${bucket}, ${p.dateTo}::date), ${`1 ${bucket}`}::interval)::date as bucket`;
}

function bucketLabel(d: string, bucket: "day" | "week" | "month"): string {
  const date = new Date(`${d}T00:00:00Z`);
  if (bucket === "month") return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

async function rowsOf<T extends Row>(query: SQL): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

const ACTIVE_BATCH = sql`b.is_deleted = false`;
const EXP_DATE = sql`(case when b.exp ~ '^(0[1-9]|1[0-2])/[0-9]{4}$' then to_date(b.exp, 'MM/YYYY') end)`;
const THIS_MONTH = sql`date_trunc('month', now() at time zone ${BUSINESS_TIMEZONE})::date`;

// ---------------------------------------------------------------- inventory

async function inventory(): Promise<Omit<ReportResult, "type" | "generatedAt" | "subtitle">> {
  const rows = await rowsOf(sql`
    select p.product_number, p.brand_name, p.generic_name, m.name as manufacturer, p.unit, p.low_stock_threshold,
           count(b.id)::int as batches,
           coalesce(sum(b.stock_quantity), 0)::int as total_stock,
           coalesce(sum(b.stock_quantity * coalesce(b.cost_price, 0)), 0)::float8 as stock_value
    from app.products p
    left join app.manufacturers m on m.id = p.manufacturer_id
    left join app.product_batches b on b.product_id = p.id and ${ACTIVE_BATCH}
    where p.is_deleted = false
    group by p.id, m.name
    order by p.brand_name`);
  const mapped = rows.map((r) => {
    const stock = n(r.total_stock);
    const threshold = n(r.low_stock_threshold);
    return {
      productNumber: s(r.product_number),
      brandName: s(r.brand_name),
      genericName: s(r.generic_name),
      manufacturer: s(r.manufacturer),
      unit: s(r.unit),
      batches: n(r.batches),
      totalStock: stock,
      threshold,
      status: stock === 0 ? "Out of stock" : stock < threshold ? "Low stock" : "OK",
      stockValue: n(r.stock_value),
    };
  });
  const top = [...mapped].sort((a, b) => b.totalStock - a.totalStock).slice(0, 15);
  return {
    title: "Inventory report",
    summary: [
      { label: "Products", value: mapped.length, kind: "number" },
      { label: "Units in stock", value: mapped.reduce((t, r) => t + r.totalStock, 0), kind: "number" },
      { label: "Low / out of stock", value: mapped.filter((r) => r.status !== "OK").length, kind: "number" },
      { label: "Stock value (cost)", value: mapped.reduce((t, r) => t + r.stockValue, 0), kind: "lkr" },
    ],
    chart: {
      kind: "bar",
      title: "Stock by product (top 15)",
      categories: top.map((r) => r.brandName ?? ""),
      series: [
        { name: "Stock", kind: "number", data: top.map((r) => r.totalStock) },
        { name: "Low-stock threshold", kind: "number", data: top.map((r) => r.threshold), reference: true },
      ],
    },
    columns: [
      { key: "productNumber", header: "Number", kind: "text" },
      { key: "brandName", header: "Brand name", kind: "text" },
      { key: "genericName", header: "Generic name", kind: "text" },
      { key: "manufacturer", header: "Manufacturer", kind: "text" },
      { key: "unit", header: "Unit", kind: "text" },
      { key: "batches", header: "Batches", kind: "number" },
      { key: "totalStock", header: "Total stock", kind: "number" },
      { key: "threshold", header: "Threshold", kind: "number" },
      { key: "status", header: "Status", kind: "text" },
      { key: "stockValue", header: "Value (LKR)", kind: "lkr" },
    ],
    rows: mapped,
  };
}

// ---------------------------------------------------------------- expiry

async function expiry(p: ReportParams): Promise<Omit<ReportResult, "type" | "generatedAt" | "subtitle">> {
  const rows = await rowsOf(sql`
    select b.batch_number, p.brand_name, p.product_number, b.mfd, b.exp, b.stock_quantity,
           b.cost_price::float8 as cost_price, s.name as supplier,
           ${EXP_DATE} < ${THIS_MONTH} as expired,
           to_char(${EXP_DATE}, 'YYYY-MM') as exp_month
    from app.product_batches b
    join app.products p on p.id = b.product_id
    left join app.suppliers s on s.id = b.supplier_id
    where ${ACTIVE_BATCH} and b.stock_quantity > 0
      and ${EXP_DATE} < ${THIS_MONTH} + make_interval(months => ${p.months})
    order by ${EXP_DATE}, p.brand_name`);
  const mapped = rows.map((r) => ({
    batchNumber: s(r.batch_number),
    product: s(r.brand_name),
    productNumber: s(r.product_number),
    mfd: s(r.mfd),
    exp: s(r.exp),
    status: r.expired ? "Expired" : "Near expiry",
    stock: n(r.stock_quantity),
    costPrice: r.cost_price === null ? null : n(r.cost_price),
    value: n(r.stock_quantity) * n(r.cost_price),
    supplier: s(r.supplier),
    expMonth: s(r.exp_month) ?? "",
  }));
  const byMonth = new Map<string, number>();
  for (const r of mapped) byMonth.set(r.expMonth, (byMonth.get(r.expMonth) ?? 0) + r.stock);
  const months = [...byMonth.keys()].sort();
  return {
    title: "Expiry report",
    summary: [
      { label: "Expired batches (with stock)", value: mapped.filter((r) => r.status === "Expired").length, kind: "number" },
      { label: `Expiring within ${p.months} months`, value: mapped.filter((r) => r.status !== "Expired").length, kind: "number" },
      { label: "Units at risk", value: mapped.reduce((t, r) => t + r.stock, 0), kind: "number" },
      { label: "Value at risk (cost)", value: mapped.reduce((t, r) => t + r.value, 0), kind: "lkr" },
    ],
    chart: {
      kind: "bar",
      title: "Units by expiry month",
      categories: months.map((m) => bucketLabel(`${m}-01`, "month")),
      series: [{ name: "Units", kind: "number", data: months.map((m) => byMonth.get(m) ?? 0) }],
    },
    columns: [
      { key: "batchNumber", header: "Batch", kind: "text" },
      { key: "product", header: "Product", kind: "text" },
      { key: "mfd", header: "MFD", kind: "text" },
      { key: "exp", header: "EXP", kind: "text" },
      { key: "status", header: "Status", kind: "text" },
      { key: "stock", header: "Stock", kind: "number" },
      { key: "costPrice", header: "Cost (LKR)", kind: "lkr" },
      { key: "value", header: "Value (LKR)", kind: "lkr" },
      { key: "supplier", header: "Supplier", kind: "text" },
    ],
    rows: mapped.map((r) => ({
      batchNumber: r.batchNumber,
      product: r.product,
      mfd: r.mfd,
      exp: r.exp,
      status: r.status,
      stock: r.stock,
      costPrice: r.costPrice,
      value: r.value,
      supplier: r.supplier,
    })),
  };
}

// ---------------------------------------------------------------- orders

async function ordersReport(p: ReportParams, scope: ReportScope): Promise<Omit<ReportResult, "type" | "generatedAt" | "subtitle">> {
  const where = sql`o.is_deleted = false and ${inScope(sql`o.company_id`, scope)} and ${inRange(sql`o.created_at`, p)}`;
  const rows = await rowsOf(sql`
    select o.order_number, o.created_at, c.name as company, coalesce(nullif(cu.business_name, ''), cu.name) as customer,
           o.document_type, o.status, o.total_cnf::float8 as total_cnf,
           (select count(*)::int from app.order_items i where i.order_id = o.id) as lines
    from app.orders o
    join app.customers cu on cu.id = o.customer_id
    join app.companies c on c.id = o.company_id
    where ${where}
    order by o.created_at desc`);
  const bucket = bucketFor(p);
  const series = await rowsOf(sql`
    with buckets as (${bucketSeries(p, bucket)})
    select to_char(bk.bucket, 'YYYY-MM-DD') as bucket,
           count(o.id)::int as orders,
           coalesce(sum(o.total_cnf) filter (where o.status <> 'cancelled'), 0)::float8 as value
    from buckets bk
    left join app.orders o on date_trunc(${bucket}, ${localDate(sql`o.created_at`)})::date = bk.bucket and ${where}
    group by bk.bucket order by bk.bucket`);
  const live = rows.filter((r) => r.status !== "cancelled");
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  return {
    title: "Orders & sales report",
    summary: [
      { label: "Orders", value: rows.length, kind: "number" },
      { label: "Value (excl. cancelled)", value: live.reduce((t, r) => t + n(r.total_cnf), 0), kind: "usd" },
      {
        label: "Open (draft → confirmed)",
        value: ["draft", "sent", "negotiating", "confirmed"].reduce((t, st) => t + count(st), 0),
        kind: "number",
      },
      { label: "Invoiced / completed", value: count("invoiced") + count("completed"), kind: "number" },
    ],
    chart: {
      kind: "line",
      title: `C&F value per ${bucket} (excl. cancelled)`,
      categories: series.map((r) => bucketLabel(String(r.bucket), bucket)),
      series: [{ name: "C&F value (USD)", kind: "usd", data: series.map((r) => n(r.value)) }],
    },
    columns: [
      { key: "orderNumber", header: "Number", kind: "text" },
      { key: "date", header: "Date", kind: "date" },
      ...(scope.companyIds?.length === 1 ? [] : [{ key: "company", header: "Company", kind: "text" as const }]),
      { key: "customer", header: "Customer", kind: "text" },
      { key: "documentType", header: "Type", kind: "text" },
      { key: "status", header: "Status", kind: "text" },
      { key: "lines", header: "Lines", kind: "number" },
      { key: "totalCnf", header: "C&F total (USD)", kind: "usd" },
    ],
    rows: rows.map((r) => ({
      orderNumber: s(r.order_number),
      date: new Date(String(r.created_at)).toISOString(),
      company: s(r.company),
      customer: s(r.customer),
      documentType: r.document_type === "commercial_invoice" ? "INV" : "PI",
      status: String(r.status).replace("_", " "),
      lines: n(r.lines),
      totalCnf: n(r.total_cnf),
    })),
  };
}

// ---------------------------------------------------------------- customers

async function customersReport(p: ReportParams, scope: ReportScope): Promise<Omit<ReportResult, "type" | "generatedAt" | "subtitle">> {
  const rows = await rowsOf(sql`
    select cu.customer_number, cu.code, coalesce(nullif(cu.business_name, ''), cu.name) as customer, cu.country,
           co.name as company,
           (select count(*)::int from app.orders o where o.customer_id = cu.id and o.is_deleted = false
              and ${inRange(sql`o.created_at`, p)}) as quotations,
           (select count(*)::int from app.invoices v join app.orders o on o.id = v.order_id
              where o.customer_id = cu.id and v.status <> 'cancelled' and v.is_deleted = false
              and ${inRange(sql`v.created_at`, p)}) as invoices,
           (select coalesce(sum(v.total_amount_usd), 0)::float8 from app.invoices v join app.orders o on o.id = v.order_id
              where o.customer_id = cu.id and v.status <> 'cancelled' and v.is_deleted = false
              and ${inRange(sql`v.created_at`, p)}) as invoiced,
           (select max(o.created_at) from app.orders o where o.customer_id = cu.id and o.is_deleted = false) as last_order
    from app.customers cu
    join app.companies co on co.id = cu.company_id
    where cu.is_deleted = false and ${inScope(sql`cu.company_id`, scope)}
    order by invoiced desc, customer`);
  const mapped = rows.map((r) => ({
    customerNumber: s(r.customer_number),
    code: s(r.code),
    customer: s(r.customer),
    company: s(r.company),
    country: s(r.country),
    quotations: n(r.quotations),
    invoices: n(r.invoices),
    invoiced: n(r.invoiced),
    lastOrder: r.last_order ? new Date(String(r.last_order)).toISOString() : null,
  }));
  const top = mapped.filter((r) => r.invoiced > 0).slice(0, 10);
  return {
    title: "Customer report",
    summary: [
      { label: "Customers", value: mapped.length, kind: "number" },
      { label: "Active in period", value: mapped.filter((r) => r.quotations > 0 || r.invoices > 0).length, kind: "number" },
      { label: "Invoiced in period", value: mapped.reduce((t, r) => t + r.invoiced, 0), kind: "usd" },
    ],
    chart: {
      kind: "bar",
      title: "Top customers by invoiced value",
      categories: top.map((r) => r.customer ?? ""),
      series: [{ name: "Invoiced (USD)", kind: "usd", data: top.map((r) => r.invoiced) }],
    },
    columns: [
      { key: "customerNumber", header: "Number", kind: "text" },
      { key: "code", header: "Code", kind: "text" },
      { key: "customer", header: "Customer", kind: "text" },
      ...(scope.companyIds?.length === 1 ? [] : [{ key: "company", header: "Company", kind: "text" as const }]),
      { key: "country", header: "Country", kind: "text" },
      { key: "quotations", header: "Quotations", kind: "number" },
      { key: "invoices", header: "Invoices", kind: "number" },
      { key: "invoiced", header: "Invoiced (USD)", kind: "usd" },
      { key: "lastOrder", header: "Last order", kind: "date" },
    ],
    rows: mapped,
  };
}

// ---------------------------------------------------------------- manufacturers

async function manufacturersReport(p: ReportParams, scope: ReportScope): Promise<Omit<ReportResult, "type" | "generatedAt" | "subtitle">> {
  const rows = await rowsOf(sql`
    select m.manufacturer_number, m.name, m.country,
           (select count(*)::int from app.products p where p.manufacturer_id = m.id and p.is_deleted = false) as products,
           (select coalesce(sum(b.stock_quantity), 0)::int from app.product_batches b join app.products p on p.id = b.product_id
              where p.manufacturer_id = m.id and p.is_deleted = false and ${ACTIVE_BATCH}) as stock,
           coalesce(sales.units, 0)::int as units_sold,
           coalesce(sales.value, 0)::float8 as sales
    from app.manufacturers m
    left join lateral (
      select sum(ii.quantity) as units, sum(ii.line_total) as value
      from app.invoice_items ii
      join app.invoices v on v.id = ii.invoice_id
      join app.products p on p.id = ii.product_id
      where p.manufacturer_id = m.id and v.status <> 'cancelled' and v.is_deleted = false
        and ${inScope(sql`v.company_id`, scope)} and ${inRange(sql`v.created_at`, p)}
    ) sales on true
    where m.is_deleted = false
    order by sales desc, m.name`);
  const mapped = rows.map((r) => ({
    manufacturerNumber: s(r.manufacturer_number),
    name: s(r.name),
    country: s(r.country),
    products: n(r.products),
    stock: n(r.stock),
    unitsSold: n(r.units_sold),
    sales: n(r.sales),
  }));
  const top = mapped.slice(0, 10);
  return {
    title: "Manufacturer report",
    summary: [
      { label: "Manufacturers", value: mapped.length, kind: "number" },
      { label: "Units sold in period", value: mapped.reduce((t, r) => t + r.unitsSold, 0), kind: "number" },
      { label: "Sales in period (goods)", value: mapped.reduce((t, r) => t + r.sales, 0), kind: "usd" },
    ],
    chart: {
      kind: "bar",
      title: "Sales by manufacturer",
      categories: top.map((r) => r.name ?? ""),
      series: [{ name: "Sales (USD)", kind: "usd", data: top.map((r) => r.sales) }],
    },
    columns: [
      { key: "manufacturerNumber", header: "Number", kind: "text" },
      { key: "name", header: "Manufacturer", kind: "text" },
      { key: "country", header: "Country", kind: "text" },
      { key: "products", header: "Products", kind: "number" },
      { key: "stock", header: "Stock (all batches)", kind: "number" },
      { key: "unitsSold", header: "Units sold", kind: "number" },
      { key: "sales", header: "Sales (USD)", kind: "usd" },
    ],
    rows: mapped,
  };
}

// ---------------------------------------------------------------- invoice value

async function invoiceValue(p: ReportParams, scope: ReportScope): Promise<Omit<ReportResult, "type" | "generatedAt" | "subtitle">> {
  const where = sql`v.is_deleted = false and ${inScope(sql`v.company_id`, scope)} and ${inRange(sql`v.created_at`, p)}`;
  const rows = await rowsOf(sql`
    select v.invoice_number, v.created_at, v.status, v.total_amount_usd::float8 as amount, c.name as company,
           coalesce(nullif(cu.business_name, ''), cu.name, v.consignee_name) as customer, o.order_number
    from app.invoices v
    join app.companies c on c.id = v.company_id
    left join app.orders o on o.id = v.order_id
    left join app.customers cu on cu.id = o.customer_id
    where ${where}
    order by v.created_at desc`);
  const bucket = bucketFor(p);
  const series = await rowsOf(sql`
    with buckets as (${bucketSeries(p, bucket)})
    select to_char(bk.bucket, 'YYYY-MM-DD') as bucket,
           count(v.id)::int as invoices,
           coalesce(sum(v.total_amount_usd), 0)::float8 as value
    from buckets bk
    left join app.invoices v on date_trunc(${bucket}, ${localDate(sql`v.created_at`)})::date = bk.bucket
      and ${where} and v.status <> 'cancelled'
    group by bk.bucket order by bk.bucket`);
  const live = rows.filter((r) => r.status !== "cancelled");
  const total = live.reduce((t, r) => t + n(r.amount), 0);
  return {
    title: "Invoice value report",
    summary: [
      { label: "Invoices (excl. cancelled)", value: live.length, kind: "number" },
      { label: "Total value (C&F)", value: total, kind: "usd" },
      { label: "Average invoice", value: live.length ? total / live.length : 0, kind: "usd" },
      { label: "Cancelled", value: rows.length - live.length, kind: "number" },
    ],
    chart: {
      kind: "line",
      title: `Invoice value per ${bucket} (excl. cancelled)`,
      categories: series.map((r) => bucketLabel(String(r.bucket), bucket)),
      series: [{ name: "Value (USD)", kind: "usd", data: series.map((r) => n(r.value)) }],
    },
    columns: [
      { key: "invoiceNumber", header: "Invoice", kind: "text" },
      { key: "date", header: "Date", kind: "date" },
      ...(scope.companyIds?.length === 1 ? [] : [{ key: "company", header: "Company", kind: "text" as const }]),
      { key: "customer", header: "Customer", kind: "text" },
      { key: "orderNumber", header: "Order", kind: "text" },
      { key: "status", header: "Status", kind: "text" },
      { key: "amount", header: "Amount (USD)", kind: "usd" },
    ],
    rows: rows.map((r) => ({
      invoiceNumber: s(r.invoice_number),
      date: new Date(String(r.created_at)).toISOString(),
      company: s(r.company),
      customer: s(r.customer),
      orderNumber: s(r.order_number),
      status: s(r.status),
      amount: n(r.amount),
    })),
  };
}

// ---------------------------------------------------------------- runner + cache

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; result: ReportResult }>();

export async function runReport(
  type: ReportType,
  params: ReportParams,
  scope: ReportScope,
  refresh = false,
): Promise<{ result: ReportResult; cached: boolean }> {
  // Key only on what each report actually uses, so equivalent requests share a cache entry.
  const shared = type === "inventory" || type === "expiry";
  const key = JSON.stringify([
    type,
    shared ? null : scope.companyIds,
    type === "expiry" ? params.months : null,
    shared ? null : [params.dateFrom, params.dateTo],
  ]);
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return { result: hit.result, cached: true };

  const body =
    type === "inventory"
      ? await inventory()
      : type === "expiry"
        ? await expiry(params)
        : type === "orders"
          ? await ordersReport(params, scope)
          : type === "customers"
            ? await customersReport(params, scope)
            : type === "manufacturers"
              ? await manufacturersReport(params, scope)
              : await invoiceValue(params, scope);

  const period = `${params.dateFrom} to ${params.dateTo}`;
  const subtitle =
    type === "inventory"
      ? "Shared warehouse — all companies"
      : type === "expiry"
        ? `Shared warehouse — expired or expiring within ${params.months} months`
        : `${scope.label} · ${period}${type === "manufacturers" ? " (stock is warehouse-wide)" : ""}`;

  const result: ReportResult = { ...body, type, subtitle, generatedAt: new Date().toISOString() };
  cache.set(key, { at: Date.now(), result });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return { result, cached: false };
}
