import { and, count, eq } from "drizzle-orm";
import { db, productBatches, suppliers } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { findSupplier, SUPPLIER_READ_ROUTES } from "@/lib/suppliers";
import { emptyToNull, supplierSchema } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Supplier");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, SUPPLIER_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const supplier = await findSupplier(id, companyId);
  if (!supplier) throw errors.notFound("Supplier");
  return ok(supplier);
});

export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Supplier");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_suppliers", { meta, companyId });

  const before = await findSupplier(id, companyId);
  if (!before) throw errors.notFound("Supplier");
  const input = await parseBody(req, supplierSchema);

  await db
    .update(suppliers)
    .set({
      name: input.name,
      contactPerson: emptyToNull(input.contactPerson),
      phone: emptyToNull(input.phone),
      contactNumber: emptyToNull(input.contactNumber),
      email: emptyToNull(input.email),
      address: emptyToNull(input.address),
      city: emptyToNull(input.city),
      country: emptyToNull(input.country),
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, id));

  const after = await findSupplier(id);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.SUPPLIER_UPDATED,
    entityName: "Supplier",
    entityId: id,
    oldValue: before,
    newValue: after,
    meta,
  });
  return ok(after);
});

export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Supplier");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_suppliers", { meta, companyId });

  const before = await findSupplier(id, companyId);
  if (!before) throw errors.notFound("Supplier");

  const [{ n }] = await db
    .select({ n: count() })
    .from(productBatches)
    .where(and(eq(productBatches.supplierId, id), eq(productBatches.isDeleted, false)));
  if (n > 0) {
    throw errors.conflict(
      `${n} batch${n === 1 ? " is" : "es are"} linked to this supplier. Change or delete ${n === 1 ? "it" : "them"} first.`,
    );
  }

  await db.update(suppliers).set({ isDeleted: true, updatedAt: new Date() }).where(eq(suppliers.id, id));

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.SUPPLIER_DELETED,
    entityName: "Supplier",
    entityId: id,
    oldValue: before,
    meta,
  });
  return ok({ id });
});
