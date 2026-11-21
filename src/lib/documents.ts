import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  companyBankDetails,
  customers,
  db,
  documentRevisions,
  orderItems,
  orders,
  products,
  quotationItems,
  quotations,
  users,
  type Database,
  type Transaction,
} from "@/db";
import { errors } from "@/lib/api";
import { SHIPPING_MODE, type RevisionDocumentType } from "@/lib/constants";
import { centsToDecimal, orderTotals, type OrderTotals } from "@/lib/money";
import { emptyToNull, type DocumentInput } from "@/lib/validations";

// Logic shared by quotations (QT) and proforma invoices (PI / orders table).

type Executor = Database | Transaction;

/**
 * Customer, products and bank account must exist (not deleted) and belong to the company.
 * Products are shared (no company_id). Pass a transaction to validate inside one (e.g. QT → PI).
 */
export async function assertDocumentRefs(
  companyId: string,
  input: { customerId: string; bankDetailId?: string | null; items: { productId: string }[] },
  executor: Executor = db,
): Promise<void> {
  const [customer] = await executor
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.companyId, companyId), eq(customers.isDeleted, false)))
    .limit(1);
  if (!customer) throw errors.badRequest("Selected customer does not exist in this company");

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const found = await executor
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, productIds), eq(products.isDeleted, false)));
  if (found.length !== productIds.length) throw errors.badRequest("One or more products no longer exist");

  const bankDetailId = emptyToNull(input.bankDetailId);
  if (bankDetailId) {
    const [bank] = await executor
      .select({ id: companyBankDetails.id })
      .from(companyBankDetails)
      .where(and(eq(companyBankDetails.id, bankDetailId), eq(companyBankDetails.companyId, companyId)))
      .limit(1);
    if (!bank) throw errors.badRequest("Selected bank account does not belong to this company");
  }
}

/**
 * Goods + C&F total. Freight and handling only count when the freight section is shown
 * (an absent toggle — old payloads — counts as shown). Hidden values are kept, not wiped,
 * so switching the section back on restores them.
 */
export function documentTotals(input: DocumentInput): OrderTotals {
  const freightOn = input.showFreight !== false;
  return orderTotals(
    input.items,
    freightOn ? input.airFreight : 0,
    freightOn ? input.handlingDocumentation : 0,
  );
}

/** Header columns shared by QT and PI create/update. Toggles are only written when provided. */
export function documentHeaderValues(input: DocumentInput) {
  const { totalCnfCents } = documentTotals(input);
  return {
    customerId: input.customerId,
    airFreight: input.airFreight.toFixed(2),
    handlingDocumentation: input.handlingDocumentation.toFixed(2),
    totalCnf: centsToDecimal(totalCnfCents),
    cnfDestination: emptyToNull(input.cnfDestination),
    shippingType: SHIPPING_MODE,
    marks: emptyToNull(input.marks),
    paymentTerms: emptyToNull(input.paymentTerms),
    notes: emptyToNull(input.notes),
    bankDetailId: emptyToNull(input.bankDetailId),
    showMfd: input.showMfd,
    showExp: input.showExp,
    showGenericName: input.showGenericName,
    ...(input.showFreight !== undefined && { showFreight: input.showFreight }),
    ...(input.showBankDetails !== undefined && { showBankDetails: input.showBankDetails }),
    ...(input.showOtherDetails !== undefined && { showOtherDetails: input.showOtherDetails }),
  };
}

export async function userNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((i): i is string => !!i))];
  if (wanted.length === 0) return new Map();
  const rows = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.fullName]));
}

export const customerSummaryColumns = {
  id: customers.id,
  customerNumber: customers.customerNumber,
  code: customers.code,
  name: customers.name,
  businessName: customers.businessName,
  contactPerson: customers.contactPerson,
  phone: customers.phone,
  email: customers.email,
  address: customers.address,
  city: customers.city,
  country: customers.country,
};

export async function getBankSummary(bankDetailId: string | null) {
  if (!bankDetailId) return null;
  const [bank] = await db
    .select({
      id: companyBankDetails.id,
      bankName: companyBankDetails.bankName,
      accountNumber: companyBankDetails.accountNumber,
      swiftCode: companyBankDetails.swiftCode,
      branchName: companyBankDetails.branchName,
      otherDetails: companyBankDetails.otherDetails,
    })
    .from(companyBankDetails)
    .where(eq(companyBankDetails.id, bankDetailId));
  return bank ?? null;
}

// ---------------------------------------------------------------- revisions

/** Header row + items of a QT or PI, as stored, for a revision snapshot. */
async function loadSnapshot(tx: Transaction, documentType: RevisionDocumentType, documentId: string) {
  if (documentType === "quotation") {
    const [header] = await tx.select().from(quotations).where(eq(quotations.id, documentId));
    if (!header) throw errors.notFound("Quotation");
    const items = await tx
      .select()
      .from(quotationItems)
      .where(eq(quotationItems.quotationId, documentId))
      .orderBy(asc(quotationItems.sortOrder), asc(quotationItems.id));
    return { revisionNumber: header.revisionNumber, snapshot: { document: header, items } };
  }
  const [header] = await tx.select().from(orders).where(eq(orders.id, documentId));
  if (!header) throw errors.notFound("Proforma invoice");
  const items = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, documentId))
    .orderBy(asc(orderItems.sortOrder), asc(orderItems.id));
  return { revisionNumber: header.revisionNumber, snapshot: { document: header, items } };
}

/**
 * Saves the document's current state under its current revision_number. Re-snapshotting the
 * same revision (e.g. edits while still draft) overwrites it; bump revision_number first to keep
 * the previous version (edits while sent/negotiating).
 */
export async function createRevisionSnapshot(
  tx: Transaction,
  documentType: RevisionDocumentType,
  documentId: string,
  createdBy: string,
  changeSummary?: string,
): Promise<{ id: string; revisionNumber: number }> {
  const { revisionNumber, snapshot } = await loadSnapshot(tx, documentType, documentId);
  // JSON round-trip turns Dates into ISO strings so the jsonb matches what readers get back.
  const json = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  const [row] = await tx
    .insert(documentRevisions)
    .values({ documentType, documentId, revisionNumber, snapshot: json, changeSummary: changeSummary ?? null, createdBy })
    .onConflictDoUpdate({
      target: [documentRevisions.documentType, documentRevisions.documentId, documentRevisions.revisionNumber],
      set: { snapshot: json, changeSummary: changeSummary ?? null, createdBy, createdAt: sql`now()` },
    })
    .returning({ id: documentRevisions.id, revisionNumber: documentRevisions.revisionNumber });
  return row;
}

/** Revision list (without snapshots) for a document, newest first. */
export async function listRevisions(documentType: RevisionDocumentType, documentId: string) {
  const rows = await db
    .select({
      id: documentRevisions.id,
      revisionNumber: documentRevisions.revisionNumber,
      changeSummary: documentRevisions.changeSummary,
      createdBy: documentRevisions.createdBy,
      createdAt: documentRevisions.createdAt,
    })
    .from(documentRevisions)
    .where(and(eq(documentRevisions.documentType, documentType), eq(documentRevisions.documentId, documentId)))
    .orderBy(sql`${documentRevisions.revisionNumber} desc`);
  const names = await userNames(rows.map((r) => r.createdBy));
  return rows.map(({ createdBy, ...r }) => ({ ...r, createdByName: createdBy ? (names.get(createdBy) ?? null) : null }));
}

/**
 * Human-readable summary of line changes between two versions of a QT/PI, for revision history,
 * e.g. "Price updated for 3 items; 1 item added". Lines are matched by product.
 */
export function summarizeItemChanges(
  before: { productId: string; quantity: number; sellingPriceUsd: number | string | null }[],
  after: { productId: string; quantity: number; sellingPriceUsd: number | string | null }[],
): string {
  const key = (l: { productId: string }) => l.productId;
  const prev = new Map(before.map((l) => [key(l), l]));
  const next = new Map(after.map((l) => [key(l), l]));
  let priced = 0;
  let qty = 0;
  for (const [k, l] of next) {
    const p = prev.get(k);
    if (!p) continue;
    if (Number(p.sellingPriceUsd ?? 0).toFixed(2) !== Number(l.sellingPriceUsd ?? 0).toFixed(2)) priced++;
    if (p.quantity !== l.quantity) qty++;
  }
  const added = [...next.keys()].filter((k) => !prev.has(k)).length;
  const removed = [...prev.keys()].filter((k) => !next.has(k)).length;
  const plural = (n: number) => `${n} item${n === 1 ? "" : "s"}`;
  const parts = [
    priced && `Price updated for ${plural(priced)}`,
    qty && `Quantity updated for ${plural(qty)}`,
    added && `${plural(added)} added`,
    removed && `${plural(removed)} removed`,
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join("; ") : "Details updated";
}

/**
 * Company of a QT/PI if it is visible in this company context (companyId=null → owner, any
 * company), otherwise null. Used to authorize revision reads, which have no company_id of their own.
 */
export async function documentCompany(
  documentType: RevisionDocumentType,
  documentId: string,
  companyId: string | null,
): Promise<string | null> {
  const table = documentType === "quotation" ? quotations : orders;
  const [row] = await db
    .select({ companyId: table.companyId })
    .from(table)
    .where(and(eq(table.id, documentId), eq(table.isDeleted, false), companyId ? eq(table.companyId, companyId) : undefined))
    .limit(1);
  return row?.companyId ?? null;
}

/** One revision including its snapshot, plus brand names for every product in it. */
export async function getRevision(id: string) {
  const [row] = await db.select().from(documentRevisions).where(eq(documentRevisions.id, id)).limit(1);
  if (!row) return null;
  const items = (row.snapshot as { items?: { productId?: unknown }[] }).items ?? [];
  const productIds = [...new Set(items.map((i) => i.productId).filter((p): p is string => typeof p === "string"))];
  const [names, productRows] = await Promise.all([
    userNames([row.createdBy]),
    productIds.length
      ? db.select({ id: products.id, brandName: products.brandName }).from(products).where(inArray(products.id, productIds))
      : Promise.resolve([]),
  ]);
  const { createdBy, ...rest } = row;
  return {
    ...rest,
    createdByName: createdBy ? (names.get(createdBy) ?? null) : null,
    productNames: Object.fromEntries(productRows.map((p) => [p.id, p.brandName])) as Record<string, string>,
  };
}
