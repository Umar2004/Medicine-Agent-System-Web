import { and, count, eq } from "drizzle-orm";
import { db, manufacturers, products } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { assertNoDuplicateManufacturer, findManufacturer, MANUFACTURER_READ_ROUTES } from "@/lib/manufacturers";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { emptyToNull, manufacturerSchema } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Manufacturer");
  const user = await requireAuth(req);
  await requireAnyModule(user, MANUFACTURER_READ_ROUTES, { meta: getRequestMeta(req), companyId: null });

  const manufacturer = await findManufacturer(id);
  if (!manufacturer) throw errors.notFound("Manufacturer");
  return ok(manufacturer);
});

export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Manufacturer");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_manufacturers", { meta, companyId: null });

  const before = await findManufacturer(id);
  if (!before) throw errors.notFound("Manufacturer");

  const input = await parseBody(req, manufacturerSchema);
  await assertNoDuplicateManufacturer(input.name, id);

  await db
    .update(manufacturers)
    .set({
      name: input.name,
      country: emptyToNull(input.country),
      contactInfo: emptyToNull(input.contactInfo),
      updatedAt: new Date(),
    })
    .where(eq(manufacturers.id, id));

  const after = await findManufacturer(id);
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.MANUFACTURER_UPDATED,
    entityName: "Manufacturer",
    entityId: id,
    oldValue: before,
    newValue: after,
    meta,
  });
  return ok(after);
});

export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Manufacturer");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_manufacturers", { meta, companyId: null });

  const before = await findManufacturer(id);
  if (!before) throw errors.notFound("Manufacturer");

  const [{ n }] = await db
    .select({ n: count() })
    .from(products)
    .where(and(eq(products.manufacturerId, id), eq(products.isDeleted, false)));
  if (n > 0) {
    throw errors.conflict(
      `${n} product${n === 1 ? " uses" : "s use"} this manufacturer. Change ${n === 1 ? "it" : "them"} first.`,
    );
  }

  await db.update(manufacturers).set({ isDeleted: true, updatedAt: new Date() }).where(eq(manufacturers.id, id));

  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.MANUFACTURER_DELETED,
    entityName: "Manufacturer",
    entityId: id,
    oldValue: before,
    meta,
  });
  return ok({ id });
});
