import { and, asc, count, desc, eq, ilike, or, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { companies, db, suppliers } from "@/db";
import { handler, likePattern, ok, paginated, parseBody, parsePagination, parseSort } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { companyScope, requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { formatNumber, nextSequence, NUMBER_FORMATS, withNumberRetry } from "@/lib/number-generator";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { findSupplier, SUPPLIER_READ_ROUTES, supplierQuery } from "@/lib/suppliers";
import { emptyToNull, SUPPLIER_SORT_FIELDS, supplierSchema, type SupplierSortField } from "@/lib/validations";

const sortColumns: Record<SupplierSortField, AnyColumn | SQLWrapper> = {
  supplierNumber: suppliers.supplierNumber,
  name: suppliers.name,
  city: suppliers.city,
  country: suppliers.country,
  createdAt: suppliers.createdAt,
};

export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, SUPPLIER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { sortBy, desc: isDesc } = parseSort(params, SUPPLIER_SORT_FIELDS, "supplierNumber");
  const search = params.get("search")?.trim();

  const where = and(
    eq(suppliers.isDeleted, false),
    companyScope(suppliers.companyId, companyId),
    search
      ? or(
          ilike(suppliers.name, likePattern(search)),
          ilike(suppliers.supplierNumber, likePattern(search)),
          ilike(suppliers.contactPerson, likePattern(search)),
          ilike(suppliers.email, likePattern(search)),
          ilike(suppliers.city, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    supplierQuery()
      .where(where)
      .orderBy((isDesc ? desc : asc)(sortColumns[sortBy]), asc(companies.name), asc(suppliers.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(suppliers).where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});

export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_suppliers", { meta, companyId });

  const input = await parseBody(req, supplierSchema);

  const created = await withNumberRetry("suppliers_company_number_uq", async () => {
    const seq = await nextSequence(db, suppliers, suppliers.supplierNumber, eq(suppliers.companyId, companyId));
    const [row] = await db
      .insert(suppliers)
      .values({
        companyId,
        supplierNumber: formatNumber(NUMBER_FORMATS.supplier, seq),
        name: input.name,
        contactPerson: emptyToNull(input.contactPerson),
        phone: emptyToNull(input.phone),
        contactNumber: emptyToNull(input.contactNumber),
        email: emptyToNull(input.email),
        address: emptyToNull(input.address),
        city: emptyToNull(input.city),
        country: emptyToNull(input.country),
      })
      .returning({ id: suppliers.id });
    return row;
  });

  const supplier = await findSupplier(created.id);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.SUPPLIER_CREATED,
    entityName: "Supplier",
    entityId: created.id,
    newValue: supplier,
    meta,
  });
  return ok(supplier, { status: 201 });
});
