import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import {
  companies,
  customers,
  db,
  invoices,
  manufacturers,
  orderItems,
  orders,
  packingLists,
  productBatches,
  products,
  quotations,
  type Transaction,
} from "@/db";
import { errors } from "@/lib/api";
import type { OrderStatus } from "@/lib/constants";
import {
  assertDocumentRefs,
  customerSummaryColumns,
  documentHeaderValues,
  getBankSummary,
  userNames,
} from "@/lib/documents";
import { centsToDecimal, lineTotalCents } from "@/lib/money";
import { lastQuotedPrice } from "@/lib/quotations";
import { emptyToNull, type DocumentInput } from "@/lib/validations";
import type { PartyFieldsInput } from "@/lib/validations/orders";

/** Sidebar pages whose users may read PI/order data (read access = sidebar visibility). */
export const ORDER_READ_ROUTES = ["/orders", "/invoices", "/packing", "/reports"];

/** Statuses in which a PI's content may still be edited (spec 7.2 PUT). */
export const ORDER_EDITABLE_STATUSES: OrderStatus[] = ["draft", "sent", "negotiating", "confirmed"];

/** PI/order not yet finished or cancelled (blocks e.g. customer deletion). */
export const ORDER_OPEN_STATUSES: OrderStatus[] = ["draft", "sent", "negotiating", "confirmed", "batch_assigned", "invoiced"];

const itemStats = new QueryBuilder()
  .select({
    orderId: orderItems.orderId,
    itemCount: sql<number>`count(*)::int`.as("item_count"),
    itemsTotal: sql<number>`coalesce(sum(${orderItems.totalUsd}), 0)::float8`.as("items_total"),
  })
  .from(orderItems)
  .groupBy(orderItems.orderId)
  .as("order_item_stats");

export const orderListColumns = {
  id: orders.id,
  companyId: orders.companyId,
  companyName: companies.name,
  orderNumber: orders.orderNumber,
  documentType: orders.documentType,
  status: orders.status,
  customerId: orders.customerId,
  customerName: sql<string>`coalesce(nullif(${customers.businessName}, ''), ${customers.name})`,
  customerCode: customers.code,
  itemCount: sql<number>`coalesce(${itemStats.itemCount}, 0)`.mapWith(Number),
  itemsTotal: sql<number>`coalesce(${itemStats.itemsTotal}, 0)`.mapWith(Number),
  totalCnf: sql<number>`${orders.totalCnf}::float8`,
  showFreight: orders.showFreight,
  showBankDetails: orders.showBankDetails,
  showOtherDetails: orders.showOtherDetails,
  convertedFromQuotationId: orders.convertedFromQuotationId,
  revisionNumber: orders.revisionNumber,
  rejectionReason: orders.rejectionReason,
  sentAt: orders.sentAt,
  createdAt: orders.createdAt,
};

export function orderListQuery() {
  return db
    .select(orderListColumns)
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(companies, eq(companies.id, orders.companyId))
    .leftJoin(itemStats, eq(itemStats.orderId, orders.id));
}

/** Full order for the view/edit pages. companyId=null → any company (owner "All companies"). */
export async function getOrderDetail(id: string, companyId: string | null) {
  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, id),
        eq(orders.isDeleted, false),
        companyId ? eq(orders.companyId, companyId) : undefined,
      ),
    )
    .limit(1);
  if (!order) return null;

  const [[customer], [company], bank, items, invoiceRows, sourceQuotation, names] = await Promise.all([
    db.select(customerSummaryColumns).from(customers).where(eq(customers.id, order.customerId)),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, order.companyId)),
    getBankSummary(order.bankDetailId),
    db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        productNumber: products.productNumber,
        brandName: products.brandName,
        genericName: products.genericName,
        manufacturerName: manufacturers.name,
        country: products.country,
        mfd: orderItems.mfd,
        exp: orderItems.exp,
        quantity: orderItems.quantity,
        unit: orderItems.unit,
        sellingPriceUsd: sql<number>`${orderItems.sellingPriceUsd}::float8`,
        totalUsd: sql<number>`${orderItems.totalUsd}::float8`,
        batchId: orderItems.batchId,
        batchNumber: productBatches.batchNumber,
        batchMfd: productBatches.mfd,
        batchExp: productBatches.exp,
        sortOrder: orderItems.sortOrder,
      })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .leftJoin(manufacturers, eq(manufacturers.id, products.manufacturerId))
      .leftJoin(productBatches, eq(productBatches.id, orderItems.batchId))
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(orderItems.sortOrder), asc(productBatches.exp), asc(orderItems.id)),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        createdAt: invoices.createdAt,
        packingListId: packingLists.id,
      })
      .from(invoices)
      .leftJoin(packingLists, eq(packingLists.invoiceId, invoices.id))
      .where(and(eq(invoices.orderId, id), eq(invoices.isDeleted, false)))
      .orderBy(desc(invoices.createdAt)),
    order.convertedFromQuotationId
      ? db
          .select({ id: quotations.id, quotationNumber: quotations.quotationNumber })
          .from(quotations)
          .where(eq(quotations.id, order.convertedFromQuotationId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    userNames([order.createdBy, order.approvedBy, order.rejectedBy]),
  ]);

  return {
    id: order.id,
    companyId: order.companyId,
    companyName: company?.name ?? "",
    orderNumber: order.orderNumber,
    documentType: order.documentType,
    status: order.status,
    customer,
    showFreight: order.showFreight,
    showBankDetails: order.showBankDetails,
    showOtherDetails: order.showOtherDetails,
    revisionNumber: order.revisionNumber,
    convertedFromQuotationId: order.convertedFromQuotationId,
    sourceQuotation,
    airFreight: Number(order.airFreight),
    handlingDocumentation: Number(order.handlingDocumentation),
    totalCnf: Number(order.totalCnf),
    cnfDestination: order.cnfDestination,
    shippingType: order.shippingType,
    marks: order.marks,
    paymentTerms: order.paymentTerms,
    notes: order.notes,
    showMfd: order.showMfd,
    showExp: order.showExp,
    showGenericName: order.showGenericName,
    bankDetailId: order.bankDetailId,
    bank,
    rejectionReason: order.rejectionReason,
    rejectedAt: order.rejectedAt,
    rejectedByName: order.rejectedBy ? (names.get(order.rejectedBy) ?? null) : null,
    approvedAt: order.approvedAt,
    approvedByName: order.approvedBy ? (names.get(order.approvedBy) ?? null) : null,
    sentAt: order.sentAt,
    createdByName: order.createdBy ? (names.get(order.createdBy) ?? null) : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    // ── Optional PI parties & signature (§7.12) ──
    consigneeName: order.consigneeName,
    consigneeAddress: order.consigneeAddress,
    consigneeCountry: order.consigneeCountry,
    consigneePhone: order.consigneePhone,
    consigneeEmail: order.consigneeEmail,
    notifyName: order.notifyName,
    notifyAddress: order.notifyAddress,
    notifyCountry: order.notifyCountry,
    notifyPhone: order.notifyPhone,
    notifyContactPerson: order.notifyContactPerson,
    orderingName: order.orderingName,
    orderingAddress: order.orderingAddress,
    orderingCountry: order.orderingCountry,
    orderingPhone: order.orderingPhone,
    signatureId: order.signatureId,
    items,
    invoices: invoiceRows,
    activeInvoice: invoiceRows.find((i) => i.status !== "cancelled") ?? null,
  };
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

/** Locks the PI/order row (FOR UPDATE) for a state change; checks company + allowed statuses. */
export async function lockOrder(tx: Transaction, id: string, companyId: string, allowed: OrderStatus[]) {
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.companyId, companyId), eq(orders.isDeleted, false)))
    .for("update")
    .limit(1);
  if (!order) throw errors.notFound("Order");
  if (!allowed.includes(order.status)) {
    throw errors.conflict(`Not allowed while the order is ${order.status.replace("_", " ")}.`);
  }
  return order;
}

/** Customer, products and bank account must exist and belong to the company. */
export const assertOrderRefs = (companyId: string, input: DocumentInput) => assertDocumentRefs(companyId, input);

/** Header columns shared by PI create + update (C&F total, section toggles, and optional party fields). */
export function orderHeaderValues(input: DocumentInput & Partial<PartyFieldsInput>) {
  return {
    ...documentHeaderValues(input),
    // ── Optional PI parties & signature (all null if not provided) ──
    consigneeName: emptyToNull(input.consigneeName),
    consigneeAddress: emptyToNull(input.consigneeAddress),
    consigneeCountry: emptyToNull(input.consigneeCountry),
    consigneePhone: emptyToNull(input.consigneePhone),
    consigneeEmail: emptyToNull(input.consigneeEmail),
    notifyName: emptyToNull(input.notifyName),
    notifyAddress: emptyToNull(input.notifyAddress),
    notifyCountry: emptyToNull(input.notifyCountry),
    notifyPhone: emptyToNull(input.notifyPhone),
    notifyContactPerson: emptyToNull(input.notifyContactPerson),
    orderingName: emptyToNull(input.orderingName),
    orderingAddress: emptyToNull(input.orderingAddress),
    orderingCountry: emptyToNull(input.orderingCountry),
    orderingPhone: emptyToNull(input.orderingPhone),
    signatureId: emptyToNull(input.signatureId),
  };
}

export async function insertOrderItems(tx: Transaction, orderId: string, items: DocumentInput["items"]) {
  await tx.insert(orderItems).values(
    items.map((item, index) => ({
      orderId,
      productId: item.productId,
      mfd: emptyToNull(item.mfd),
      exp: emptyToNull(item.exp),
      quantity: item.quantity,
      unit: emptyToNull(item.unit),
      sellingPriceUsd: item.sellingPriceUsd.toFixed(2),
      totalUsd: centsToDecimal(lineTotalCents(item.quantity, item.sellingPriceUsd)),
      batchId: null,
      sortOrder: index,
    })),
  );
}

/**
 * Undo batch assignment: put stock back and merge split lines (same sort_order) into one
 * line without a batch. Used by undo-batches and by cancelling a batch-assigned order.
 * Only touches stock and lines; the caller sets the status (undo goes back to "confirmed" and
 * the document stays a proforma_invoice).
 */
export async function releaseBatches(tx: Transaction, orderId: string): Promise<{ batchId: string; quantity: number }[]> {
  const lines = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.sortOrder), asc(orderItems.id));

  const released = new Map<string, number>();
  for (const line of lines) {
    if (line.batchId) released.set(line.batchId, (released.get(line.batchId) ?? 0) + line.quantity);
  }
  for (const [batchId, quantity] of released) {
    await tx
      .update(productBatches)
      .set({ stockQuantity: sql`${productBatches.stockQuantity} + ${quantity}`, updatedAt: new Date() })
      .where(eq(productBatches.id, batchId));
  }

  // Merge lines that were split across batches back into one quotation line each.
  const groups = new Map<number, typeof lines>();
  for (const line of lines) groups.set(line.sortOrder, [...(groups.get(line.sortOrder) ?? []), line]);
  for (const group of groups.values()) {
    const [keep, ...rest] = group;
    const quantity = group.reduce((s, l) => s + l.quantity, 0);
    await tx
      .update(orderItems)
      .set({
        batchId: null,
        quantity,
        totalUsd: centsToDecimal(lineTotalCents(quantity, keep.sellingPriceUsd)),
      })
      .where(eq(orderItems.id, keep.id));
    if (rest.length) await tx.delete(orderItems).where(inArray(orderItems.id, rest.map((l) => l.id)));
  }

  return [...released].map(([batchId, quantity]) => ({ batchId, quantity }));
}

/**
 * Last USD price this customer was quoted for the product (CLAUDE.md 7.1), searching BOTH
 * quotations and PIs/orders. `orderNumber` mirrors `documentNumber` for the old quotation UI.
 */
export async function lastSalePrice(companyId: string, customerId: string, productId: string) {
  const last = await lastQuotedPrice(companyId, customerId, productId);
  return last ? { ...last, orderNumber: last.documentNumber } : null;
}
