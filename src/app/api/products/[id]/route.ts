import { and, count, eq } from "drizzle-orm";
import { db, productBatches, products } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { assertManufacturerExists, assertNoDuplicateProduct, findProduct, PRODUCT_READ_ROUTES } from "@/lib/products";
import { getRequestMeta } from "@/lib/request-meta";
import { emptyToNull, productSchema } from "@/lib/validations";

type Params = { id: string };

export const GET = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Product");
  const user = await requireAuth(req);
  await requireAnyModule(user, PRODUCT_READ_ROUTES, { meta: getRequestMeta(req), companyId: null });

  const product = await findProduct(id);
  if (!product) throw errors.notFound("Product");
  return ok(product);
});

export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Product");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_products", { meta, companyId: null });

  const before = await findProduct(id);
  if (!before) throw errors.notFound("Product");

  const input = await parseBody(req, productSchema);
  const manufacturerId = emptyToNull(input.manufacturerId);
  await assertManufacturerExists(manufacturerId);
  await assertNoDuplicateProduct(input.brandName, manufacturerId, id);

  await db
    .update(products)
    .set({
      brandName: input.brandName,
      genericName: emptyToNull(input.genericName),
      manufacturerId,
      unit: emptyToNull(input.unit),
      country: emptyToNull(input.country),
      lowStockThreshold: input.lowStockThreshold,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.isDeleted, false)));

  const after = await findProduct(id);
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.PRODUCT_UPDATED,
    entityName: "Product",
    entityId: id,
    oldValue: before,
    newValue: after,
    meta,
  });
  return ok(after);
});

export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Product");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_products", { meta, companyId: null });

  const before = await findProduct(id);
  if (!before) throw errors.notFound("Product");

  // CLAUDE.md §7.4: product deletion blocked if it still has batches.
  const [{ batches }] = await db
    .select({ batches: count() })
    .from(productBatches)
    .where(and(eq(productBatches.productId, id), eq(productBatches.isDeleted, false)));
  if (batches > 0) {
    throw errors.conflict(
      `This product has ${batches} batch${batches === 1 ? "" : "es"}. Delete or move them before deleting the product.`,
    );
  }

  await db.update(products).set({ isDeleted: true, updatedAt: new Date() }).where(eq(products.id, id));

  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.PRODUCT_DELETED,
    entityName: "Product",
    entityId: id,
    oldValue: before,
    meta,
  });
  return ok({ id });
});
