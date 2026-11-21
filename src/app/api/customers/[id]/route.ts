import { and, count, eq, inArray } from "drizzle-orm";
import { customers, db, orders, quotations } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { assertCodeFree, CUSTOMER_READ_ROUTES, findCustomer, findSimilarCustomers } from "@/lib/customers";
import { isUniqueViolation } from "@/lib/number-generator";
import { ORDER_OPEN_STATUSES } from "@/lib/orders";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { QUOTATION_OPEN_STATUSES } from "@/lib/quotations";
import { getRequestMeta } from "@/lib/request-meta";
import { customerSchema, emptyToNull } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Customer");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, CUSTOMER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const customer = await findCustomer(id, companyId);
  if (!customer) throw errors.notFound("Customer");
  return ok(customer);
});

export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Customer");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_customers", { meta, companyId });

  const before = await findCustomer(id, companyId);
  if (!before) throw errors.notFound("Customer");

  const input = await parseBody(req, customerSchema);
  await assertCodeFree(companyId, input.code, id);
  const businessName = emptyToNull(input.businessName);
  const similar = await findSimilarCustomers(companyId, input.name, businessName, id);

  try {
    await db
      .update(customers)
      .set({
        code: input.code,
        name: input.name,
        businessName,
        contactPerson: emptyToNull(input.contactPerson),
        phone: emptyToNull(input.phone),
        email: emptyToNull(input.email),
        address: emptyToNull(input.address),
        city: emptyToNull(input.city),
        country: emptyToNull(input.country),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id));
  } catch (err) {
    if (isUniqueViolation(err, "customers_company_code_uq")) {
      throw errors.conflict(`Code "${input.code}" is already in use.`);
    }
    throw err;
  }

  const after = await findCustomer(id);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.CUSTOMER_UPDATED,
    entityName: "Customer",
    entityId: id,
    oldValue: before,
    newValue: after,
    meta,
  });
  return ok({ ...after, similar });
});

export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Customer");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_customers", { meta, companyId });

  const before = await findCustomer(id, companyId);
  if (!before) throw errors.notFound("Customer");

  // Closed orders stay as history; open ones must be finished or cancelled first.
  const [{ open }] = await db
    .select({ open: count() })
    .from(orders)
    .where(
      and(
        eq(orders.customerId, id),
        eq(orders.isDeleted, false),
        inArray(orders.status, ORDER_OPEN_STATUSES),
      ),
    );
  const [{ openQuotes }] = await db
    .select({ openQuotes: count() })
    .from(quotations)
    .where(
      and(
        eq(quotations.customerId, id),
        eq(quotations.isDeleted, false),
        inArray(quotations.status, QUOTATION_OPEN_STATUSES),
      ),
    );
  if (openQuotes > 0) {
    throw errors.conflict(
      `This customer has ${openQuotes} open quotation${openQuotes === 1 ? "" : "s"}. Reject, convert or delete ${openQuotes === 1 ? "it" : "them"} first.`,
    );
  }
  if (open > 0) {
    throw errors.conflict(
      `This customer has ${open} open order${open === 1 ? "" : "s"}. Complete or cancel ${open === 1 ? "it" : "them"} first.`,
    );
  }

  await db.update(customers).set({ isDeleted: true, updatedAt: new Date() }).where(eq(customers.id, id));

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.CUSTOMER_DELETED,
    entityName: "Customer",
    entityId: id,
    oldValue: before,
    meta,
  });
  return ok({ id });
});
