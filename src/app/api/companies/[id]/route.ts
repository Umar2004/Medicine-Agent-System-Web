import { eq } from "drizzle-orm";
import { companies, db } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { assertCompanyNameFree, findCompany } from "@/lib/companies";
import { invalidateCompanyCache } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { requireOwner } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { companySchema, emptyToNull } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Company");
  const user = await requireAuth(req);
  requireOwner(user, { meta: getRequestMeta(req), companyId: null });

  const company = await findCompany(id);
  if (!company) throw errors.notFound("Company");
  return ok(company);
});

export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Company");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  requireOwner(user, { meta, companyId: null });

  const before = await findCompany(id);
  if (!before) throw errors.notFound("Company");
  const input = await parseBody(req, companySchema);
  await assertCompanyNameFree(input.name, id);

  await db
    .update(companies)
    .set({
      name: input.name,
      address: emptyToNull(input.address),
      phone: emptyToNull(input.phone),
      email: emptyToNull(input.email),
      website: emptyToNull(input.website),
      taxId: emptyToNull(input.taxId),
      currency: input.currency.toUpperCase(),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, id));

  invalidateCompanyCache();
  auditLog({ user, companyId: id, actionType: ACTION_TYPES.COMPANY_UPDATED, entityName: "Company", entityId: id, oldValue: before, newValue: input, meta });
  return ok(await findCompany(id));
});
