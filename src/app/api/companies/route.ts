import { companies, db } from "@/db";
import { handler, ok, parseBody } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { assertCompanyNameFree, findCompany, listCompanies } from "@/lib/companies";
import { getAccessibleCompanies, invalidateCompanyCache } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { requireOwner } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { companySchema, emptyToNull } from "@/lib/validations";

/** Companies the current user can switch to; `?full=1` is the owner's management list. */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  if (req.nextUrl.searchParams.get("full") === "1") {
    requireOwner(user, { meta: getRequestMeta(req), companyId: null });
    return ok(await listCompanies());
  }
  return ok(await getAccessibleCompanies(user));
});

export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  requireOwner(user, { meta, companyId: null });

  const input = await parseBody(req, companySchema);
  await assertCompanyNameFree(input.name);

  const [row] = await db
    .insert(companies)
    .values({
      name: input.name,
      address: emptyToNull(input.address),
      phone: emptyToNull(input.phone),
      email: emptyToNull(input.email),
      website: emptyToNull(input.website),
      taxId: emptyToNull(input.taxId),
      currency: input.currency.toUpperCase(),
    })
    .returning({ id: companies.id });

  const created = await findCompany(row.id);
  invalidateCompanyCache();
  auditLog({ user, companyId: row.id, actionType: ACTION_TYPES.COMPANY_CREATED, entityName: "Company", entityId: row.id, newValue: input, meta });
  return ok(created, { status: 201 });
});
