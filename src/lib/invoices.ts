import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  companies,
  companyBankDetails,
  customers,
  db,
  invoiceItems,
  invoices,
  manufacturers,
  orderItems,
  orders,
  packingLists,
  productBatches,
  products,
  signatures,
  users,
  type Transaction,
} from "@/db";
import { BUSINESS_TIMEZONE, SHIPPING_MODE, type SectionEnforcement } from "@/lib/constants";
import { centsToDecimal, lineTotalCents, toCents } from "@/lib/money";
import { usdAmountInWords } from "@/lib/number-to-words";

export const INVOICE_READ_ROUTES = ["/invoices", "/orders", "/packing", "/reports"];

/** Month + year of "now" in the business timezone, e.g. { mm: "08", yyyy: "2026" }. */
function businessMonth(date = new Date()): { mm: string; yyyy: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit" })
    .formatToParts(date);
  return {
    mm: parts.find((p) => p.type === "month")!.value,
    yyyy: parts.find((p) => p.type === "year")!.value,
  };
}

/**
 * CLAUDE.md §7.3: `{seq}/{customerCode}/{MM}/{YYYY}`; seq resets monthly per company and
 * counts every invoice of that month (cancelled ones too — a re-issue gets a new number).
 * Legacy numbers (e.g. "INV - 00000001") don't match the pattern and are ignored.
 */
export async function nextInvoiceNumber(tx: Transaction, companyId: string, customerCode: string): Promise<string> {
  const { mm, yyyy } = businessMonth();
  const pattern = `^[0-9]+/[^/]+/${mm}/${yyyy}$`;
  const [row] = await tx
    .select({ maxSeq: sql<number>`coalesce(max(split_part(${invoices.invoiceNumber}, '/', 1)::int), 0)::int` })
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), sql`${invoices.invoiceNumber} ~ ${pattern}`));
  return `${(row?.maxSeq ?? 0) + 1}/${customerCode}/${mm}/${yyyy}`;
}

/**
 * Sections the PI had toggled OFF. A Commercial Invoice always shows every section, so these are
 * recorded on the CI as enforced: the user must complete them before issuing.
 */
export function sectionEnforcementFor(order: {
  showFreight: boolean;
  showBankDetails: boolean;
  showOtherDetails: boolean;
}): SectionEnforcement | null {
  const enforcement: SectionEnforcement = {};
  if (!order.showFreight) enforcement.freight = true;
  if (!order.showBankDetails) enforcement.bank_details = true;
  if (!order.showOtherDetails) enforcement.other_details = true;
  return Object.keys(enforcement).length ? enforcement : null;
}

/**
 * Notify and ordering parties for a new invoice: copied from the customer's latest **issued**
 * invoice in this company. With no earlier invoice, the customer's contact person becomes the
 * notify contact person. (The consignee always comes from the customer record.)
 */
async function defaultParties(
  tx: Transaction,
  companyId: string,
  customer: typeof customers.$inferSelect,
): Promise<Partial<typeof invoices.$inferInsert>> {
  const [last] = await tx
    .select({
      notifyName: invoices.notifyName,
      notifyAddress: invoices.notifyAddress,
      notifyCountry: invoices.notifyCountry,
      notifyPhone: invoices.notifyPhone,
      notifyContactPerson: invoices.notifyContactPerson,
      orderingName: invoices.orderingName,
      orderingAddress: invoices.orderingAddress,
      orderingCountry: invoices.orderingCountry,
      orderingPhone: invoices.orderingPhone,
    })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(orders.customerId, customer.id),
        eq(invoices.status, "issued"),
        eq(invoices.isDeleted, false),
      ),
    )
    .orderBy(desc(invoices.createdAt))
    .limit(1);
  if (last) return last;
  return customer.contactPerson ? { notifyContactPerson: customer.contactPerson } : {};
}

/**
 * Creates a draft Commercial Invoice as an exact copy of a batch-assigned PI (CLAUDE.md §7.12).
 * MFD/EXP come from the assigned batch (§7.8); supplier price is the batch cost.
 * Freight always counts on the CI (all sections are shown), even if the PI hid it.
 */
export async function createInvoiceFromOrder(
  tx: Transaction,
  order: typeof orders.$inferSelect,
  createdBy: string,
): Promise<{ id: string; invoiceNumber: string; sectionEnforcement: SectionEnforcement | null }> {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, order.customerId));
  const lines = await tx
    .select({
      productId: orderItems.productId,
      batchId: orderItems.batchId,
      quantity: orderItems.quantity,
      unit: orderItems.unit,
      sellingPriceUsd: orderItems.sellingPriceUsd,
      itemMfd: orderItems.mfd,
      itemExp: orderItems.exp,
      batchMfd: productBatches.mfd,
      batchExp: productBatches.exp,
      costPrice: productBatches.costPrice,
      sortOrder: orderItems.sortOrder,
    })
    .from(orderItems)
    .leftJoin(productBatches, eq(productBatches.id, orderItems.batchId))
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.sortOrder), asc(orderItems.id));

  const itemsCents = lines.reduce((s, l) => s + lineTotalCents(l.quantity, l.sellingPriceUsd), 0);
  const totalCents = itemsCents + toCents(order.airFreight) + toCents(order.handlingDocumentation);

  const invoiceNumber = await nextInvoiceNumber(tx, order.companyId, customer.code);
  const parties = await defaultParties(tx, order.companyId, customer);
  const [invoice] = await tx
    .insert(invoices)
    .values({
      companyId: order.companyId,
      invoiceNumber,
      orderId: order.id,
      status: "draft",
      airFreight: order.airFreight,
      handlingDocumentation: order.handlingDocumentation,
      totalCnf: centsToDecimal(totalCents),
      cnfDestination: order.cnfDestination,
      totalAmountUsd: centsToDecimal(totalCents),
      amountInWords: usdAmountInWords(totalCents),
      shippingType: SHIPPING_MODE,
      marks: order.marks,
      paymentTerms: order.paymentTerms,
      bankDetailId: order.bankDetailId,
      notes: order.notes,
      sectionEnforcement: sectionEnforcementFor(order),
      // Consignee: PI fields win if filled, else fall back to the customer record.
      consigneeName: order.consigneeName ?? customer.businessName ?? customer.name,
      consigneeAddress: order.consigneeAddress ?? ([customer.address, customer.city].filter(Boolean).join(", ") || null),
      consigneeCountry: order.consigneeCountry ?? customer.country,
      consigneePhone: order.consigneePhone ?? customer.phone,
      consigneeEmail: order.consigneeEmail ?? customer.email,
      // Notify / ordering / signature: PI fields win if filled, else defaultParties.
      notifyName: order.notifyName ?? parties.notifyName ?? null,
      notifyAddress: order.notifyAddress ?? parties.notifyAddress ?? null,
      notifyCountry: order.notifyCountry ?? parties.notifyCountry ?? null,
      notifyPhone: order.notifyPhone ?? parties.notifyPhone ?? null,
      notifyContactPerson: order.notifyContactPerson ?? parties.notifyContactPerson ?? null,
      orderingName: order.orderingName ?? parties.orderingName ?? null,
      orderingAddress: order.orderingAddress ?? parties.orderingAddress ?? null,
      orderingCountry: order.orderingCountry ?? parties.orderingCountry ?? null,
      orderingPhone: order.orderingPhone ?? parties.orderingPhone ?? null,
      signatureId: order.signatureId ?? null,
      createdBy,
    })
    .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, sectionEnforcement: invoices.sectionEnforcement });

  await tx.insert(invoiceItems).values(
    lines.map((l, index) => ({
      invoiceId: invoice.id,
      productId: l.productId,
      batchId: l.batchId,
      mfd: l.batchMfd ?? l.itemMfd,
      exp: l.batchExp ?? l.itemExp,
      quantity: l.quantity,
      unit: l.unit,
      supplierPriceLkr: l.costPrice,
      sellingPriceUsd: l.sellingPriceUsd,
      lineTotal: centsToDecimal(lineTotalCents(l.quantity, l.sellingPriceUsd)),
      sortOrder: index,
    })),
  );
  return invoice;
}

export const invoiceListColumns = {
  id: invoices.id,
  companyId: invoices.companyId,
  companyName: companies.name,
  invoiceNumber: invoices.invoiceNumber,
  status: invoices.status,
  orderId: invoices.orderId,
  orderNumber: orders.orderNumber,
  customerId: customers.id,
  customerName: sql<string | null>`coalesce(nullif(${customers.businessName}, ''), ${customers.name})`,
  consigneeName: invoices.consigneeName,
  totalAmountUsd: sql<number>`${invoices.totalAmountUsd}::float8`,
  createdAt: invoices.createdAt,
};

export function invoiceListQuery() {
  return db
    .select(invoiceListColumns)
    .from(invoices)
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .leftJoin(orders, eq(orders.id, invoices.orderId))
    .leftJoin(customers, eq(customers.id, orders.customerId));
}

export async function getInvoiceDetail(id: string, companyId: string | null) {
  const [row] = await db
    .select({
      invoice: invoices,
      orderNumber: orders.orderNumber,
      orderStatus: orders.status,
      orderDocumentType: orders.documentType,
      sourceQuotationId: orders.convertedFromQuotationId,
      customerId: orders.customerId,
      showGenericName: orders.showGenericName,
      showMfd: orders.showMfd,
      showExp: orders.showExp,
    })
    .from(invoices)
    .leftJoin(orders, eq(orders.id, invoices.orderId))
    .where(
      and(eq(invoices.id, id), eq(invoices.isDeleted, false), companyId ? eq(invoices.companyId, companyId) : undefined),
    )
    .limit(1);
  if (!row) return null;
  const inv = row.invoice;

  const [[company], customer, bank, signature, items, creator, [packing]] = await Promise.all([
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, inv.companyId)),
    row.customerId
      ? db
          .select({ id: customers.id, code: customers.code, name: customers.name, businessName: customers.businessName })
          .from(customers)
          .where(eq(customers.id, row.customerId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    inv.bankDetailId
      ? db
          .select({
            id: companyBankDetails.id,
            bankName: companyBankDetails.bankName,
            accountNumber: companyBankDetails.accountNumber,
            swiftCode: companyBankDetails.swiftCode,
            branchName: companyBankDetails.branchName,
            otherDetails: companyBankDetails.otherDetails,
          })
          .from(companyBankDetails)
          .where(eq(companyBankDetails.id, inv.bankDetailId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    inv.signatureId
      ? db
          .select({ id: signatures.id, label: signatures.label, imageUrl: signatures.imageUrl, userId: signatures.userId })
          .from(signatures)
          .where(eq(signatures.id, inv.signatureId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        id: invoiceItems.id,
        productId: invoiceItems.productId,
        productNumber: products.productNumber,
        brandName: products.brandName,
        genericName: products.genericName,
        manufacturerName: manufacturers.name,
        country: products.country,
        batchId: invoiceItems.batchId,
        batchNumber: productBatches.batchNumber,
        mfd: invoiceItems.mfd,
        exp: invoiceItems.exp,
        quantity: invoiceItems.quantity,
        unit: invoiceItems.unit,
        supplierPriceLkr: sql<number | null>`${invoiceItems.supplierPriceLkr}::float8`,
        sellingPriceUsd: sql<number>`${invoiceItems.sellingPriceUsd}::float8`,
        lineTotal: sql<number>`${invoiceItems.lineTotal}::float8`,
      })
      .from(invoiceItems)
      .innerJoin(products, eq(products.id, invoiceItems.productId))
      .leftJoin(manufacturers, eq(manufacturers.id, products.manufacturerId))
      .leftJoin(productBatches, eq(productBatches.id, invoiceItems.batchId))
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(asc(invoiceItems.sortOrder), asc(invoiceItems.id)),
    inv.createdBy
      ? db.select({ fullName: users.fullName }).from(users).where(eq(users.id, inv.createdBy)).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db.select({ id: packingLists.id }).from(packingLists).where(eq(packingLists.invoiceId, id)).limit(1),
  ]);

  return {
    ...inv,
    airFreight: Number(inv.airFreight),
    handlingDocumentation: Number(inv.handlingDocumentation),
    totalCnf: Number(inv.totalCnf),
    totalAmountUsd: Number(inv.totalAmountUsd ?? 0),
    companyName: company?.name ?? "",
    orderNumber: row.orderNumber,
    orderStatus: row.orderStatus,
    orderDocumentType: row.orderDocumentType,
    sourceQuotationId: row.sourceQuotationId,
    packingListId: packing?.id ?? null,
    customer,
    bank,
    signature,
    items,
    createdByName: creator?.fullName ?? null,
    showGenericName: row.showGenericName ?? true,
    showMfd: row.showMfd ?? true,
    showExp: row.showExp ?? true,
  };
}
export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>;
