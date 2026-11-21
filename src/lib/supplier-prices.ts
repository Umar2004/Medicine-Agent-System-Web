import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { likePattern } from "@/lib/api";
import { resolveCompany } from "@/lib/company-context";
import type { SessionUser } from "@/lib/jwt";
import { requireAnyPermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";

type Row = Record<string, unknown>;
const rowsOf = async <T extends Row>(q: SQL) => (await db.execute(q)) as unknown as T[];
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** CLAUDE.md §6: supplier price comparison = manage_suppliers or view_reports. Company-scoped. */
export async function requireSupplierPrices(req: NextRequest, user: SessionUser): Promise<string | null> {
  const companyId = await resolveCompany(req, user);
  await requireAnyPermission(user, ["manage_suppliers", "view_reports"], { meta: getRequestMeta(req), companyId });
  return companyId;
}

const inCompany = (companyId: string | null): SQL => (companyId ? sql`h.company_id = ${companyId}::uuid` : sql`true`);

/** One row per product with price records: the lowest current price per type. */
export async function listPriceSummaries(companyId: string | null, search: string | undefined, limit: number, offset: number) {
  const rows = await rowsOf(sql`
    with latest as (
      select distinct on (h.product_id, h.supplier_id, coalesce(h.price_type, ''))
             h.product_id, h.supplier_id, h.price_type, h.price_lkr, h.recorded_at
      from app.supplier_price_history h
      join app.suppliers s on s.id = h.supplier_id and s.is_deleted = false
      where h.price_lkr is not null and ${inCompany(companyId)}
      order by h.product_id, h.supplier_id, coalesce(h.price_type, ''), h.recorded_at desc
    )
    select p.id, p.product_number, p.brand_name, p.generic_name, p.unit, m.name as manufacturer_name,
           count(distinct l.supplier_id)::int as supplier_count,
           min(l.price_lkr) filter (where l.price_type = 'wholesale')::float8 as best_wholesale,
           min(l.price_lkr) filter (where l.price_type = 'retail')::float8 as best_retail,
           min(l.price_lkr) filter (where l.price_type is null)::float8 as best_other,
           max(l.recorded_at) as last_recorded_at,
           count(*) over ()::int as total
    from latest l
    join app.products p on p.id = l.product_id and p.is_deleted = false
    left join app.manufacturers m on m.id = p.manufacturer_id
    where ${
      search
        ? sql`(p.brand_name ilike ${likePattern(search)} or p.generic_name ilike ${likePattern(search)} or p.product_number ilike ${likePattern(search)})`
        : sql`true`
    }
    group by p.id, m.name
    order by p.brand_name, p.id
    limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    rows: rows.map((r) => ({
      productId: String(r.id),
      productNumber: String(r.product_number),
      brandName: String(r.brand_name),
      genericName: r.generic_name as string | null,
      unit: r.unit as string | null,
      manufacturerName: r.manufacturer_name as string | null,
      supplierCount: Number(r.supplier_count),
      bestWholesale: num(r.best_wholesale),
      bestRetail: num(r.best_retail),
      bestOther: num(r.best_other),
      lastRecordedAt: new Date(String(r.last_recorded_at)).toISOString(),
    })),
  };
}

/** Each supplier's current price for a product, per price type, cheapest first. */
export async function comparePrices(productId: string, companyId: string | null) {
  const rows = await rowsOf(sql`
    select * from (
      select h.supplier_id, s.name as supplier_name, c.name as company_name, h.price_type,
             h.price_lkr::float8 as price, h.recorded_at,
             lead(h.price_lkr) over w as previous_price,
             count(*) over (partition by h.supplier_id, coalesce(h.price_type, ''))::int as records,
             row_number() over w as rn
      from app.supplier_price_history h
      join app.suppliers s on s.id = h.supplier_id and s.is_deleted = false
      join app.companies c on c.id = h.company_id
      where h.product_id = ${productId}::uuid and h.price_lkr is not null and ${inCompany(companyId)}
      window w as (partition by h.supplier_id, coalesce(h.price_type, '') order by h.recorded_at desc, h.id desc)
    ) x
    where rn = 1
    order by coalesce(price_type, 'zzz'), price, supplier_name`);
  const lowest = new Map<string, number>();
  for (const r of rows) {
    const key = String(r.price_type);
    const price = Number(r.price);
    if (!lowest.has(key) || price < lowest.get(key)!) lowest.set(key, price);
  }
  return rows.map((r) => {
    const price = Number(r.price);
    return {
      supplierId: String(r.supplier_id),
      supplierName: String(r.supplier_name),
      companyName: String(r.company_name),
      priceType: r.price_type as string | null,
      priceLkr: price,
      previousPriceLkr: num(r.previous_price),
      recordedAt: new Date(String(r.recorded_at)).toISOString(),
      records: Number(r.records),
      isBest: price === lowest.get(String(r.price_type)),
    };
  });
}

/** Every recorded price, newest first. Includes deleted suppliers: it's history. */
export async function priceHistory(productId: string, companyId: string | null, limit: number, offset: number) {
  const rows = await rowsOf(sql`
    select h.id, h.price_lkr::float8 as price, h.price_type, h.recorded_at, h.notes,
           s.name as supplier_name, s.is_deleted as supplier_deleted, c.name as company_name,
           count(*) over ()::int as total
    from app.supplier_price_history h
    join app.suppliers s on s.id = h.supplier_id
    join app.companies c on c.id = h.company_id
    where h.product_id = ${productId}::uuid and ${inCompany(companyId)}
    order by h.recorded_at desc, h.id desc
    limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    rows: rows.map((r) => ({
      id: String(r.id),
      priceLkr: num(r.price),
      priceType: r.price_type as string | null,
      recordedAt: new Date(String(r.recorded_at)).toISOString(),
      notes: r.notes as string | null,
      supplierName: String(r.supplier_name),
      supplierDeleted: Boolean(r.supplier_deleted),
      companyName: String(r.company_name),
    })),
  };
}
