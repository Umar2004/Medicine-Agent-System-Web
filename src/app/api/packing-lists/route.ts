import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { companies, customers, db, invoices, orders, packingListItems, packingLists } from "@/db";
import { errors, handler, isUuid, likePattern, ok, paginated, parseBody, parsePagination } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { companyScope, requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { getPackingList, insertPackingItems, PACKING_READ_ROUTES, packingHeaderValues } from "@/lib/packing-lists";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { packingListCreateSchema } from "@/lib/validations";

/** GET ?invoiceId=&search= — paginated packing lists for the company (or one invoice). */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, PACKING_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const invoiceId = params.get("invoiceId");
  if (invoiceId && !isUuid(invoiceId)) throw errors.badRequest("Invalid invoice");
  const search = params.get("search")?.trim();

  const where = and(
    companyScope(packingLists.companyId, companyId),
    invoiceId ? eq(packingLists.invoiceId, invoiceId) : undefined,
    search
      ? or(
          ilike(invoices.invoiceNumber, likePattern(search)),
          ilike(packingLists.shipmentReference, likePattern(search)),
          ilike(customers.name, likePattern(search)),
          ilike(customers.businessName, likePattern(search)),
        )
      : undefined,
  );

  const base = () =>
    db
      .select({
        id: packingLists.id,
        invoiceId: packingLists.invoiceId,
        invoiceNumber: invoices.invoiceNumber,
        invoiceStatus: invoices.status,
        companyName: companies.name,
        customerName: sql<string | null>`coalesce(nullif(${customers.businessName}, ''), ${customers.name})`,
        shipmentReference: packingLists.shipmentReference,
        totalCartons: packingLists.totalCartons,
        date: packingLists.date,
        lineCount: sql<number>`(select count(*)::int from ${packingListItems} where ${packingListItems.packingListId} = ${packingLists.id})`,
        createdAt: packingLists.createdAt,
      })
      .from(packingLists)
      .innerJoin(invoices, eq(invoices.id, packingLists.invoiceId))
      .innerJoin(companies, eq(companies.id, packingLists.companyId))
      .leftJoin(orders, eq(orders.id, invoices.orderId))
      .leftJoin(customers, eq(customers.id, orders.customerId));

  const [rows, [{ total }]] = await Promise.all([
    base().where(where).orderBy(desc(packingLists.createdAt), asc(packingLists.id)).limit(pageSize).offset(offset),
    db
      .select({ total: count() })
      .from(packingLists)
      .innerJoin(invoices, eq(invoices.id, packingLists.invoiceId))
      .leftJoin(orders, eq(orders.id, invoices.orderId))
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(where),
  ]);
  return paginated(rows, total, page, pageSize);
});

/** One packing list per invoice (audit/06 §7). */
export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_packing_lists", { meta, companyId });

  const input = await parseBody(req, packingListCreateSchema);
  const [invoice] = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.companyId, companyId), eq(invoices.isDeleted, false)))
    .limit(1);
  if (!invoice) throw errors.notFound("Invoice");
  if (invoice.status === "cancelled") throw errors.conflict("Cannot add a packing list to a cancelled invoice.");

  const id = await db.transaction(async (tx) => {
    // Serialise per invoice so two users can't create two lists at once.
    await tx.execute(sql`select 1 from ${invoices} where ${invoices.id} = ${input.invoiceId} for update`);
    const [existing] = await tx
      .select({ id: packingLists.id })
      .from(packingLists)
      .where(eq(packingLists.invoiceId, input.invoiceId))
      .limit(1);
    if (existing) throw errors.conflict("This invoice already has a packing list — edit that one instead.");
    const [row] = await tx
      .insert(packingLists)
      .values({ invoiceId: input.invoiceId, companyId, ...packingHeaderValues(input) })
      .returning({ id: packingLists.id });
    await insertPackingItems(tx, row.id, input.items);
    return row.id;
  });

  const detail = await getPackingList(id, companyId);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.PACKING_LIST_CREATED,
    entityName: "PackingList",
    entityId: id,
    newValue: detail,
    meta,
  });
  return ok(detail, { status: 201 });
});
