import { and, asc, count, desc, eq, ilike, or, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { companies, customers, db } from "@/db";
import { errors, handler, likePattern, ok, paginated, parseBody, parsePagination, parseSort } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { companyScope, requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { assertCodeFree, CUSTOMER_READ_ROUTES, customerQuery, findCustomer, findSimilarCustomers } from "@/lib/customers";
import { formatNumber, isUniqueViolation, nextSequence, NUMBER_FORMATS, withNumberRetry } from "@/lib/number-generator";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { CUSTOMER_SORT_FIELDS, customerSchema, emptyToNull, type CustomerSortField } from "@/lib/validations";

const sortColumns: Record<CustomerSortField, AnyColumn | SQLWrapper> = {
  customerNumber: customers.customerNumber,
  code: customers.code,
  name: customers.name,
  businessName: customers.businessName,
  country: customers.country,
  createdAt: customers.createdAt,
};

export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, CUSTOMER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { sortBy, desc: isDesc } = parseSort(params, CUSTOMER_SORT_FIELDS, "customerNumber");
  const search = params.get("search")?.trim();

  const where = and(
    eq(customers.isDeleted, false),
    companyScope(customers.companyId, companyId),
    search
      ? or(
          ilike(customers.name, likePattern(search)),
          ilike(customers.businessName, likePattern(search)),
          ilike(customers.customerNumber, likePattern(search)),
          ilike(customers.code, likePattern(search)),
          ilike(customers.email, likePattern(search)),
          ilike(customers.country, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    customerQuery()
      .where(where)
      .orderBy((isDesc ? desc : asc)(sortColumns[sortBy]), asc(companies.name), asc(customers.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(customers).where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});

export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_customers", { meta, companyId });

  const input = await parseBody(req, customerSchema);
  await assertCodeFree(companyId, input.code);
  const businessName = emptyToNull(input.businessName);
  const similar = await findSimilarCustomers(companyId, input.name, businessName);

  const created = await withNumberRetry("customers_company_number_uq", async () => {
    const seq = await nextSequence(db, customers, customers.customerNumber, eq(customers.companyId, companyId));
    try {
      const [row] = await db
        .insert(customers)
        .values({
          companyId,
          customerNumber: formatNumber(NUMBER_FORMATS.customer, seq),
          code: input.code,
          name: input.name,
          businessName,
          contactPerson: emptyToNull(input.contactPerson),
          phone: emptyToNull(input.phone),
          email: emptyToNull(input.email),
          address: emptyToNull(input.address),
          city: emptyToNull(input.city),
          country: emptyToNull(input.country),
        })
        .returning({ id: customers.id });
      return row;
    } catch (err) {
      if (isUniqueViolation(err, "customers_company_code_uq")) {
        throw errors.conflict(`Code "${input.code}" is already in use.`);
      }
      throw err;
    }
  });

  const customer = await findCustomer(created.id);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.CUSTOMER_CREATED,
    entityName: "Customer",
    entityId: created.id,
    newValue: customer,
    meta,
  });
  return ok({ ...customer, similar }, { status: 201 });
});
