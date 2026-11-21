import "server-only";
import { and, asc, desc, eq, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import {
  companies,
  customers,
  db,
  manufacturers,
  orderItems,
  orders,
  products,
  quotationItems,
  quotations,
  users,
  type Transaction,
} from "@/db";
import { errors } from "@/lib/api";
import { SHIPPING_MODE, type InvoiceStatus, type QuotationStatus } from "@/lib/constants";
import {
  assertDocumentRefs,
  createRevisionSnapshot,
  customerSummaryColumns,
  documentHeaderValues,
  getBankSummary,
  userNames,
} from "@/lib/documents";
import { centsToDecimal, lineTotalCents, toCents } from "@/lib/money";
import { nextProformaNumber } from "@/lib/number-generator";
import { emptyToNull, type DocumentInput, type QuotationCreateInput } from "@/lib/validations";

/** Sidebar pages whose users may read quotation data (read access = sidebar visibility). */
export const QUOTATION_READ_ROUTES = ["/quotations", "/reports"];

/** Quotations still in play (block customer deletion). */
export const QUOTATION_OPEN_STATUSES: QuotationStatus[] = ["draft", "sent", "negotiating", "accepted"];

/** Statuses in which a quotation's content may still be edited. */
export const QUOTATION_EDITABLE_STATUSES: QuotationStatus[] = ["draft", "sent", "negotiating", "rejected", "accepted"];

const itemStats = new QueryBuilder()
  .select({
    quotationId: quotationItems.quotationId,
    lineCount: sql<number>`count(*)::int`.as("line_count"),
    itemsTotal: sql<number>`coalesce(sum(${quotationItems.totalUsd}), 0)::float8`.as("items_total"),
  })
  .from(quotationItems)
  .groupBy(quotationItems.quotationId)
  .as("quotation_item_stats");

export const quotationListColumns = {
  id: quotations.id,
  companyId: quotations.companyId,
  companyName: companies.name,
  quotationNumber: quotations.quotationNumber,
  status: quotations.status,
  customerId: quotations.customerId,
  customerName: sql<string>`coalesce(nullif(${customers.businessName}, ''), ${customers.name})`,
  customerCode: customers.code,
  showFreight: quotations.showFreight,
  showBankDetails: quotations.showBankDetails,
  showOtherDetails: quotations.showOtherDetails,
  lineCount: sql<number>`coalesce(${itemStats.lineCount}, 0)`.mapWith(Number),
  itemsTotal: sql<number>`coalesce(${itemStats.itemsTotal}, 0)`.mapWith(Number),
  totalCnf: sql<number>`${quotations.totalCnf}::float8`,
  revisionNumber: quotations.revisionNumber,
  rejectionReason: quotations.rejectionReason,
  convertedToOrderId: quotations.convertedToOrderId,
  sentAt: quotations.sentAt,
  createdByName: users.fullName,
  createdAt: quotations.createdAt,
};

/** Base list query; callers add where (is_deleted + company scope), order and paging. */
export function quotationListQuery() {
  return db
    .select(quotationListColumns)
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .leftJoin(users, eq(users.id, quotations.createdBy))
    .leftJoin(itemStats, eq(itemStats.quotationId, quotations.id));
}

/** Full quotation for the view/edit pages. companyId=null → any company (owner "All companies"). */
export async function getQuotationDetail(id: string, companyId: string | null) {
  const [q] = await db
    .select()
    .from(quotations)
    .where(
      and(eq(quotations.id, id), eq(quotations.isDeleted, false), companyId ? eq(quotations.companyId, companyId) : undefined),
    )
    .limit(1);
  if (!q) return null;

  const [[customer], [company], bank, items, convertedTo, names] = await Promise.all([
    db.select(customerSummaryColumns).from(customers).where(eq(customers.id, q.customerId)),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, q.companyId)),
    getBankSummary(q.bankDetailId),
    db
      .select({
        id: quotationItems.id,
        productId: quotationItems.productId,
        productNumber: products.productNumber,
        brandName: products.brandName,
        genericName: products.genericName,
        manufacturerName: manufacturers.name,
        country: products.country,
        mfd: quotationItems.mfd,
        exp: quotationItems.exp,
        quantity: quotationItems.quantity,
        unit: quotationItems.unit,
        sellingPriceUsd: sql<number>`${quotationItems.sellingPriceUsd}::float8`,
        totalUsd: sql<number>`${quotationItems.totalUsd}::float8`,
        sortOrder: quotationItems.sortOrder,
      })
      .from(quotationItems)
      .innerJoin(products, eq(products.id, quotationItems.productId))
      .leftJoin(manufacturers, eq(manufacturers.id, products.manufacturerId))
      .where(eq(quotationItems.quotationId, id))
      .orderBy(asc(quotationItems.sortOrder), asc(quotationItems.id)),
    q.convertedToOrderId
      ? db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            // The deal's live commercial invoice + packing list, for the pipeline bar on the quotation page.
            activeInvoiceId: sql<string | null>`(select i.id from app.invoices i where i.order_id = app.orders.id
              and i.is_deleted = false and i.status <> 'cancelled' order by i.created_at desc limit 1)`,
            activeInvoiceStatus: sql<InvoiceStatus | null>`(select i.status from app.invoices i where i.order_id = app.orders.id
              and i.is_deleted = false and i.status <> 'cancelled' order by i.created_at desc limit 1)`,
            packingListId: sql<string | null>`(select p.id from app.packing_lists p join app.invoices i on i.id = p.invoice_id
              where i.order_id = app.orders.id and i.is_deleted = false and i.status <> 'cancelled' order by i.created_at desc limit 1)`,
          })
          .from(orders)
          .where(eq(orders.id, q.convertedToOrderId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    userNames([q.createdBy, q.rejectedBy]),
  ]);

  const itemsTotal = items.reduce((s, i) => s + Number(i.totalUsd ?? 0), 0);

  return {
    id: q.id,
    companyId: q.companyId,
    companyName: company?.name ?? "",
    quotationNumber: q.quotationNumber,
    status: q.status,
    customerId: q.customerId,
    customerName: customer ? customer.businessName || customer.name : "",
    customerCode: customer?.code ?? "",
    customer,
    showFreight: q.showFreight,
    showBankDetails: q.showBankDetails,
    showOtherDetails: q.showOtherDetails,
    airFreight: Number(q.airFreight),
    handlingDocumentation: Number(q.handlingDocumentation),
    totalCnf: Number(q.totalCnf),
    cnfDestination: q.cnfDestination,
    shippingType: q.shippingType,
    marks: q.marks,
    paymentTerms: q.paymentTerms,
    notes: q.notes,
    showMfd: q.showMfd,
    showExp: q.showExp,
    showGenericName: q.showGenericName,
    bankDetailId: q.bankDetailId,
    bank,
    revisionNumber: q.revisionNumber,
    rejectionReason: q.rejectionReason,
    rejectedAt: q.rejectedAt,
    rejectedByName: q.rejectedBy ? (names.get(q.rejectedBy) ?? null) : null,
    convertedToOrderId: q.convertedToOrderId,
    convertedToOrder: convertedTo,
    convertedAt: q.convertedAt,
    sentAt: q.sentAt,
    createdByName: q.createdBy ? (names.get(q.createdBy) ?? null) : null,
    lineCount: items.length,
    itemsTotal: Math.round(itemsTotal * 100) / 100,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    items,
  };
}
export type QuotationDetail = NonNullable<Awaited<ReturnType<typeof getQuotationDetail>>>;

/** Locks the quotation row (FOR UPDATE) for a state change; checks company + allowed statuses. */
export async function lockQuotation(tx: Transaction, id: string, companyId: string, allowed: QuotationStatus[]) {
  const [q] = await tx
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.companyId, companyId), eq(quotations.isDeleted, false)))
    .for("update")
    .limit(1);
  if (!q) throw errors.notFound("Quotation");
  if (!allowed.includes(q.status)) throw errors.conflict(`Not allowed while the quotation is ${q.status}.`);
  return q;
}

/** Customer, products and bank account must exist and belong to the company. */
export const assertQuotationRefs = (companyId: string, input: DocumentInput) => assertDocumentRefs(companyId, input);

/** Header columns shared by quotation create + update. */
export function quotationHeaderValues(input: QuotationCreateInput) {
  return documentHeaderValues(input);
}

export async function insertQuotationItems(tx: Transaction, quotationId: string, items: DocumentInput["items"]) {
  await tx.insert(quotationItems).values(
    items.map((item, index) => ({
      quotationId,
      productId: item.productId,
      mfd: emptyToNull(item.mfd),
      exp: emptyToNull(item.exp),
      quantity: item.quantity,
      unit: emptyToNull(item.unit),
      sellingPriceUsd: item.sellingPriceUsd.toFixed(2),
      totalUsd: centsToDecimal(lineTotalCents(item.quantity, item.sellingPriceUsd)),
      sortOrder: index,
    })),
  );
}

export interface LastPrice {
  price: number;
  documentNumber: string;
  source: "quotation" | "order";
  date: Date;
}

/** Last USD price quoted to this customer for the product, from quotations only. */
export async function lastQuotationPrice(
  companyId: string,
  customerId: string,
  productId: string,
): Promise<LastPrice | null> {
  const [row] = await db
    .select({
      price: sql<number>`${quotationItems.sellingPriceUsd}::float8`,
      documentNumber: quotations.quotationNumber,
      date: quotations.updatedAt,
    })
    .from(quotationItems)
    .innerJoin(quotations, eq(quotations.id, quotationItems.quotationId))
    .where(
      and(
        eq(quotations.companyId, companyId),
        eq(quotations.customerId, customerId),
        eq(quotationItems.productId, productId),
        eq(quotations.isDeleted, false),
        notInArray(quotations.status, ["rejected", "expired"]),
        isNotNull(quotationItems.sellingPriceUsd),
      ),
    )
    .orderBy(desc(quotations.updatedAt))
    .limit(1);
  return row ? { ...row, source: "quotation" } : null;
}

/** Last USD price on a PI/order for this customer + product (cancelled orders ignored). */
export async function lastOrderPrice(
  companyId: string,
  customerId: string,
  productId: string,
): Promise<LastPrice | null> {
  const [row] = await db
    .select({
      price: sql<number>`${orderItems.sellingPriceUsd}::float8`,
      documentNumber: orders.orderNumber,
      date: orders.updatedAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.companyId, companyId),
        eq(orders.customerId, customerId),
        eq(orderItems.productId, productId),
        eq(orders.isDeleted, false),
        ne(orders.status, "cancelled"),
        isNotNull(orderItems.sellingPriceUsd),
      ),
    )
    .orderBy(desc(orders.updatedAt))
    .limit(1);
  return row ? { ...row, source: "order" } : null;
}

/** Most recent price from EITHER quotations or PIs/orders (spec §7.4). */
export async function lastQuotedPrice(companyId: string, customerId: string, productId: string) {
  const [fromQuotation, fromOrder] = await Promise.all([
    lastQuotationPrice(companyId, customerId, productId),
    lastOrderPrice(companyId, customerId, productId),
  ]);
  if (!fromQuotation) return fromOrder;
  if (!fromOrder) return fromQuotation;
  return fromQuotation.date >= fromOrder.date ? fromQuotation : fromOrder;
}

/**
 * QT → PI. Call inside `withNumberRetry(NUMBER_CONSTRAINTS.proforma, () => db.transaction(...))`
 * with a quotation already locked via lockQuotation(..., ["accepted"]).
 *
 * Creates a draft PI with all sections ON. Freight / bank / other-details values carry over only
 * from sections the quotation had ON; the rest start blank for the user to fill in. Marks the
 * quotation converted and snapshots both documents. The caller fires QUOTATION_CONVERTED.
 */
export async function convertQuotationToPI(
  tx: Transaction,
  quotation: typeof quotations.$inferSelect,
  userId: string,
): Promise<{ orderId: string; orderNumber: string }> {
  const items = await tx
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, quotation.id))
    .orderBy(asc(quotationItems.sortOrder), asc(quotationItems.id));
  if (items.length === 0) throw errors.conflict("The quotation has no lines to convert.");

  // Customer/products/bank may have been deleted since the quotation was made.
  const bankDetailId = quotation.showBankDetails ? quotation.bankDetailId : null;
  await assertDocumentRefs(quotation.companyId, { customerId: quotation.customerId, bankDetailId, items }, tx);
  const [customer] = await tx
    .select({ code: customers.code })
    .from(customers)
    .where(eq(customers.id, quotation.customerId));

  const freight = quotation.showFreight;
  const other = quotation.showOtherDetails;
  const itemsCents = items.reduce((s, i) => s + lineTotalCents(i.quantity, i.sellingPriceUsd), 0);
  const airFreight = freight ? quotation.airFreight : "0";
  const handling = freight ? quotation.handlingDocumentation : "0";
  const totalCnfCents = itemsCents + toCents(airFreight) + toCents(handling);

  const orderNumber = await nextProformaNumber(tx, quotation.companyId, customer.code);
  const [order] = await tx
    .insert(orders)
    .values({
      companyId: quotation.companyId,
      orderNumber,
      documentType: "proforma_invoice",
      status: "draft",
      customerId: quotation.customerId,
      showFreight: true,
      showBankDetails: true,
      showOtherDetails: true,
      airFreight,
      handlingDocumentation: handling,
      totalCnf: centsToDecimal(totalCnfCents),
      cnfDestination: freight ? quotation.cnfDestination : null,
      shippingType: SHIPPING_MODE,
      bankDetailId,
      marks: other ? quotation.marks : null,
      paymentTerms: other ? quotation.paymentTerms : null,
      notes: other ? quotation.notes : null,
      showMfd: quotation.showMfd,
      showExp: quotation.showExp,
      showGenericName: quotation.showGenericName,
      convertedFromQuotationId: quotation.id,
      createdBy: userId,
    })
    .returning({ id: orders.id, orderNumber: orders.orderNumber });

  await tx.insert(orderItems).values(
    items.map((i) => ({
      orderId: order.id,
      productId: i.productId,
      mfd: i.mfd,
      exp: i.exp,
      quantity: i.quantity,
      unit: i.unit,
      sellingPriceUsd: i.sellingPriceUsd,
      totalUsd: i.totalUsd,
      batchId: null,
      sortOrder: i.sortOrder,
    })),
  );

  const now = new Date();
  await tx
    .update(quotations)
    .set({ status: "converted", convertedToOrderId: order.id, convertedAt: now, updatedAt: now })
    .where(eq(quotations.id, quotation.id));

  await createRevisionSnapshot(tx, "quotation", quotation.id, userId, `Converted to ${order.orderNumber}`);
  await createRevisionSnapshot(tx, "proforma_invoice", order.id, userId, `Created from ${quotation.quotationNumber}`);

  return { orderId: order.id, orderNumber: order.orderNumber };
}
