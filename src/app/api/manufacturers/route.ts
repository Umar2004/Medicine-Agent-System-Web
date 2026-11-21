import { and, asc, count, desc, eq, ilike, or, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { db, manufacturers } from "@/db";
import { handler, likePattern, ok, paginated, parseBody, parsePagination, parseSort } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { ACTION_TYPES } from "@/lib/constants";
import {
  assertNoDuplicateManufacturer,
  findManufacturer,
  MANUFACTURER_READ_ROUTES,
  manufacturerColumns,
  manufacturerQuery,
} from "@/lib/manufacturers";
import { formatNumber, nextSequence, NUMBER_FORMATS, withNumberRetry } from "@/lib/number-generator";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import {
  emptyToNull,
  MANUFACTURER_SORT_FIELDS,
  manufacturerSchema,
  type ManufacturerSortField,
} from "@/lib/validations";

// Manufacturers are SHARED across companies — no company_id.

const sortColumns: Record<ManufacturerSortField, AnyColumn | SQLWrapper> = {
  manufacturerNumber: manufacturers.manufacturerNumber,
  name: manufacturers.name,
  country: manufacturers.country,
  productCount: manufacturerColumns.productCount,
  createdAt: manufacturers.createdAt,
};

export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  await requireAnyModule(user, MANUFACTURER_READ_ROUTES, { meta: getRequestMeta(req), companyId: null });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { sortBy, desc: isDesc } = parseSort(params, MANUFACTURER_SORT_FIELDS, "name");
  const search = params.get("search")?.trim();

  const where = and(
    eq(manufacturers.isDeleted, false),
    search
      ? or(
          ilike(manufacturers.name, likePattern(search)),
          ilike(manufacturers.manufacturerNumber, likePattern(search)),
          ilike(manufacturers.country, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    manufacturerQuery()
      .where(where)
      .orderBy((isDesc ? desc : asc)(sortColumns[sortBy]), asc(manufacturers.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(manufacturers).where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});

export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  await requirePermission(user, "manage_manufacturers", { meta, companyId: null });

  const input = await parseBody(req, manufacturerSchema);
  await assertNoDuplicateManufacturer(input.name);

  const created = await withNumberRetry("manufacturers_manufacturer_number_unique", async () => {
    const seq = await nextSequence(db, manufacturers, manufacturers.manufacturerNumber);
    const [row] = await db
      .insert(manufacturers)
      .values({
        manufacturerNumber: formatNumber(NUMBER_FORMATS.manufacturer, seq),
        name: input.name,
        country: emptyToNull(input.country),
        contactInfo: emptyToNull(input.contactInfo),
      })
      .returning({ id: manufacturers.id });
    return row;
  });

  const manufacturer = await findManufacturer(created.id);
  auditLog({
    user,
    companyId: null,
    actionType: ACTION_TYPES.MANUFACTURER_CREATED,
    entityName: "Manufacturer",
    entityId: created.id,
    newValue: manufacturer,
    meta,
  });
  return ok(manufacturer, { status: 201 });
});
