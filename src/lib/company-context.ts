import "server-only";
import { and, asc, eq, type AnyColumn, type SQL } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { companies, db, userCompanyAccess } from "@/db";
import { errors, isUuid } from "@/lib/api";
import { COMPANY_COOKIE, COMPANY_HEADER } from "@/lib/constants";
import type { SessionUser } from "@/lib/jwt";
import { invalidateCompanyProfiles } from "@/lib/company-profile";
import { ttlCache } from "@/lib/ttl-cache";

export interface CompanySummary {
  id: string;
  name: string;
  isDefault: boolean;
}

// Resolved on nearly every API call, so cached briefly (saves a DB round trip per request).
// Keyed by user id, or "owner" for the all-companies list. Company create/update/delete and
// user company-assignment changes call invalidateCompanyCache(), so edits apply immediately.
const companyCache = ttlCache<CompanySummary[]>("accessible-companies", 30_000);

export function invalidateCompanyCache(): void {
  companyCache.clear();
  invalidateCompanyProfiles(); // PDF letterhead (name, address, logo)
}

/** Companies the user may access. Owner → every company. */
export async function getAccessibleCompanies(user: SessionUser): Promise<CompanySummary[]> {
  const key = user.role === "owner" ? "owner" : user.id;
  const cached = companyCache.get(key);
  if (cached) return cached;
  const rows = await loadAccessibleCompanies(user);
  companyCache.set(key, rows);
  return rows;
}

async function loadAccessibleCompanies(user: SessionUser): Promise<CompanySummary[]> {
  if (user.role === "owner") {
    const rows = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.isDeleted, false))
      .orderBy(asc(companies.name));
    return rows.map((r) => ({ ...r, isDefault: false }));
  }
  return db
    .select({ id: companies.id, name: companies.name, isDefault: userCompanyAccess.isDefault })
    .from(userCompanyAccess)
    .innerJoin(companies, eq(companies.id, userCompanyAccess.companyId))
    .where(and(eq(userCompanyAccess.userId, user.id), eq(companies.isDeleted, false)))
    .orderBy(asc(companies.name));
}

function requestedCompanyId(req: NextRequest): string | null {
  const value = req.headers.get(COMPANY_HEADER) ?? req.cookies.get(COMPANY_COOKIE)?.value ?? null;
  if (!value) return null;
  if (!isUuid(value)) throw errors.badRequest("Invalid company id");
  return value;
}

/**
 * Resolves the active company for a request (CLAUDE.md §6 Company Context).
 *
 * - owner: the requested company, or null = "All companies" (read-only aggregate mode)
 * - others: validated against user_company_access; single-company or default
 *   assignment is auto-resolved. Never null for non-owners.
 */
export async function resolveCompany(req: NextRequest, user: SessionUser): Promise<string | null> {
  const requested = requestedCompanyId(req);

  if (user.role === "owner") {
    if (!requested) return null;
    const all = await getAccessibleCompanies(user);
    if (!all.some((c) => c.id === requested)) throw errors.notFound("Company");
    return requested;
  }

  const accessible = await getAccessibleCompanies(user);
  if (accessible.length === 0) throw errors.forbidden("You are not assigned to any company");
  if (requested) {
    if (!accessible.some((c) => c.id === requested)) throw errors.forbidden("You do not have access to this company");
    return requested;
  }
  if (accessible.length === 1) return accessible[0].id;
  const fallback = accessible.find((c) => c.isDefault);
  if (fallback) return fallback.id;
  throw errors.badRequest("Select a company first");
}

/** WHERE clause for company-scoped reads; null (owner "All companies") = no filter. */
export function companyScope(column: AnyColumn, companyId: string | null): SQL | undefined {
  return companyId ? eq(column, companyId) : undefined;
}

/** For creates/edits of company-scoped data: owner in "All companies" mode must pick one. */
export async function requireCompany(req: NextRequest, user: SessionUser): Promise<string> {
  const companyId = await resolveCompany(req, user);
  if (!companyId) throw errors.badRequest("Select a company before creating or editing records");
  return companyId;
}
