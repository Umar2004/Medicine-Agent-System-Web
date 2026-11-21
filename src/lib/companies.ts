import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { companies, db } from "@/db";
import { errors } from "@/lib/api";
import { env } from "@/lib/env";
import { signedUrl } from "@/lib/supabase-storage";

/** Browser-loadable logo URL: imported logos are public URLs on our own project, new ones are private paths. */
async function logoPreviewUrl(ref: string | null): Promise<string | null> {
  if (!ref) return null;
  if (!/^https?:\/\//i.test(ref)) return signedUrl(ref).catch(() => null);
  const supabase = env().SUPABASE_URL;
  return supabase && new URL(ref).host === new URL(supabase).host ? ref : null;
}

export async function listCompanies(id?: string) {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      address: companies.address,
      phone: companies.phone,
      email: companies.email,
      website: companies.website,
      taxId: companies.taxId,
      currency: companies.currency,
      logoUrl: companies.logoUrl,
      createdAt: companies.createdAt,
      userCount: sql<number>`(select count(*)::int from app.user_company_access a join app.users u on u.id = a.user_id
        where a.company_id = app.companies.id and u.is_deleted = false)`,
      customerCount: sql<number>`(select count(*)::int from app.customers c where c.company_id = app.companies.id and c.is_deleted = false)`,
      orderCount: sql<number>`(select count(*)::int from app.orders o where o.company_id = app.companies.id and o.is_deleted = false)`,
    })
    .from(companies)
    .where(and(eq(companies.isDeleted, false), id ? eq(companies.id, id) : undefined))
    .orderBy(companies.name);
  return Promise.all(
    rows.map(async ({ logoUrl, ...r }) => ({ ...r, hasLogo: !!logoUrl, logoPreviewUrl: await logoPreviewUrl(logoUrl) })),
  );
}

export async function findCompany(id: string) {
  const [row] = await listCompanies(id);
  return row ?? null;
}

export async function assertCompanyNameFree(name: string, exceptId?: string): Promise<void> {
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(sql`lower(${companies.name}) = lower(${name})`, eq(companies.isDeleted, false)))
    .limit(1);
  if (row && row.id !== exceptId) throw errors.conflict(`A company named “${name}” already exists`);
}
