import { and, asc, count, desc, eq, ilike, or, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { db, manufacturers, products } from "@/db";
import { handler, likePattern, ok, paginated, parseBody, parsePagination } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import { formatNumber, nextSequence, NUMBER_FORMATS, withNumberRetry } from "@/lib/number-generator";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import {
  assertManufacturerExists,
  assertNoDuplicateProduct,
  findProduct,
  PRODUCT_READ_ROUTES,
  productListColumns,
  productStock,
} from "@/lib/products";
import { getRequestMeta } from "@/lib/request-meta";
import { emptyToNull, PRODUCT_SORT_FIELDS, productSchema, type ProductSortField } from "@/lib/validations";

// Products are SHARED across companies — no company_id filter anywhere here.

const sortColumns: Record<ProductSortField, AnyColumn | SQLWrapper> = {
  productNumber: products.productNumber,
  brandName: products.brandName,
  genericName: products.genericName,
  manufacturerName: manufacturers.name,
  totalStock: productListColumns.totalStock,
  createdAt: products.createdAt,
};

export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  await requireAnyModule(user, PRODUCT_READ_ROUTES, { meta: getRequestMeta(req), companyId: null });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const search = params.get("search")?.trim();
  const sortBy = (PRODUCT_SORT_FIELDS as readonly string[]).includes(params.get("sortBy") ?? "")
    ? (params.get("sortBy") as ProductSortField)
    : "productNumber";
  const sortDir = params.get("sortDir") === "desc" ? desc : asc;

  const where = and(
    eq(products.isDeleted, false),
    search
      ? or(
          ilike(products.brandName, likePattern(search)),
          ilike(products.genericName, likePattern(search)),
          ilike(products.productNumber, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select(productListColumns)
      .from(products)
      .leftJoin(manufacturers, eq(manufacturers.id, products.manufacturerId))
      .leftJoin(productStock, eq(productStock.productId, products.id))
      .where(where)
      .orderBy(sortDir(sortColumns[sortBy]), asc(products.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});

export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_products", { meta, companyId: null });

  const input = await parseBody(req, productSchema);
  const manufacturerId = emptyToNull(input.manufacturerId);
  await assertManufacturerExists(manufacturerId);
  await assertNoDuplicateProduct(input.brandName, manufacturerId);

  const created = await withNumberRetry("products_product_number_unique", async () => {
    const seq = await nextSequence(db, products, products.productNumber);
    const [row] = await db
      .insert(products)
      .values({
        productNumber: formatNumber(NUMBER_FORMATS.product, seq),
        brandName: input.brandName,
        genericName: emptyToNull(input.genericName),
        manufacturerId,
        unit: emptyToNull(input.unit),
        country: emptyToNull(input.country),
        lowStockThreshold: input.lowStockThreshold,
      })
      .returning({ id: products.id });
    return row;
  });

  const product = await findProduct(created.id);
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.PRODUCT_CREATED,
    entityName: "Product",
    entityId: created.id,
    newValue: product,
    meta,
  });
  return ok(product, { status: 201 });
});
