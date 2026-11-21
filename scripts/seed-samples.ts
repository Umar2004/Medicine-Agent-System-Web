// Optional sample documents for the QT → PI → CI pipeline — DEVELOPMENT DATABASES ONLY.
// Run via: npm run db:seed -- --samples            (create)
//          npm run db:seed -- --samples --dry-run  (build everything, then roll back)
//
// Everything is created under its own company ("Demo Pharma (sample data)") so it stays apart from
// real data and can be removed by deleting that company's documents. No products, batches or
// stock are created or touched — sample lines reuse two existing products.
import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";

type Db = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const SAMPLE_COMPANY = "Demo Pharma (sample data)";
const CODE = "SMP";
const ROLLBACK = Symbol("rollback");

type Sections = { showFreight: boolean; showBankDetails: boolean; showOtherDetails: boolean };
type Line = { productId: string; quantity: number; price: number; mfd?: string; exp?: string; unit?: string };

const cents = (n: number) => Math.round(n * 100);
const dec = (c: number) => (c / 100).toFixed(2);

function totals(lines: Line[], s: Sections, airFreight: number, handling: number) {
  const goods = lines.reduce((t, l) => t + l.quantity * cents(l.price), 0);
  return dec(goods + (s.showFreight ? cents(airFreight) + cents(handling) : 0));
}

function header(s: Sections, lines: Line[], bankId: string) {
  return {
    ...s,
    airFreight: "150.00",
    handlingDocumentation: "45.00",
    totalCnf: totals(lines, s, 150, 45),
    cnfDestination: "Nairobi",
    shippingType: "By Air",
    bankDetailId: bankId,
    paymentTerms: "50% advance, balance before shipment",
    marks: "SMP/NBO",
    notes: "Sample document — safe to delete.",
  };
}

async function snapshot(tx: Tx, type: "quotation" | "proforma_invoice", id: string, createdBy: string | null, summary: string) {
  const [document] =
    type === "quotation"
      ? await tx.select().from(schema.quotations).where(eq(schema.quotations.id, id))
      : await tx.select().from(schema.orders).where(eq(schema.orders.id, id));
  const items =
    type === "quotation"
      ? await tx.select().from(schema.quotationItems).where(eq(schema.quotationItems.quotationId, id)).orderBy(asc(schema.quotationItems.sortOrder))
      : await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id)).orderBy(asc(schema.orderItems.sortOrder));
  await tx.insert(schema.documentRevisions).values({
    documentType: type,
    documentId: id,
    revisionNumber: document.revisionNumber,
    snapshot: JSON.parse(JSON.stringify({ document, items })) as Record<string, unknown>,
    changeSummary: summary,
    createdBy,
  });
}

async function create(tx: Tx): Promise<string[]> {
  const products = await tx
    .select({ id: schema.products.id, unit: schema.products.unit })
    .from(schema.products)
    .where(eq(schema.products.isDeleted, false))
    .orderBy(asc(schema.products.productNumber))
    .limit(2);
  if (products.length < 2) throw new Error("Sample data needs at least two products — add them first.");
  const [owner] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "owner"), eq(schema.users.isDeleted, false)))
    .limit(1);
  const by = owner?.id ?? null;

  const [company] = await tx.insert(schema.companies).values({ name: SAMPLE_COMPANY, currency: "USD" }).returning();
  const [customer] = await tx
    .insert(schema.customers)
    .values({
      companyId: company.id,
      customerNumber: "CUSTOMER-SAMPLE01",
      code: CODE,
      name: "Sample Customer",
      businessName: "Sample Customer Ltd",
      city: "Nairobi",
      country: "Kenya",
      email: "orders@sample-customer.test",
    })
    .returning();
  const [bank] = await tx
    .insert(schema.companyBankDetails)
    .values({ companyId: company.id, bankName: "Sample Bank PLC", accountNumber: "000-SAMPLE-001", swiftCode: "SMPLLKLX" })
    .returning();

  const lines = (price: number): Line[] => [
    { productId: products[0].id, quantity: 984, price, mfd: "01/2026", exp: "12/2028", unit: products[0].unit ?? "" },
    { productId: products[1].id, quantity: 200, price: 3.4, unit: products[1].unit ?? "" },
  ];
  const created: string[] = [];

  // ---------- Quotations in each status ----------
  const quote = async (
    n: number,
    status: (typeof schema.quotations.$inferInsert)["status"],
    s: Sections,
    extra: Partial<typeof schema.quotations.$inferInsert> = {},
    price = 1.25,
  ) => {
    const l = lines(price);
    const [q] = await tx
      .insert(schema.quotations)
      .values({
        companyId: company.id,
        quotationNumber: `QT-${CODE}-${String(n).padStart(4, "0")}`,
        customerId: customer.id,
        status,
        createdBy: by,
        ...header(s, l, bank.id),
        ...extra,
      })
      .returning();
    await tx.insert(schema.quotationItems).values(
      l.map((x, i) => ({
        quotationId: q.id,
        productId: x.productId,
        mfd: x.mfd ?? null,
        exp: x.exp ?? null,
        quantity: x.quantity,
        unit: x.unit || null,
        sellingPriceUsd: x.price.toFixed(2),
        totalUsd: dec(x.quantity * cents(x.price)),
        sortOrder: i,
      })),
    );
    created.push(q.id);
    return q;
  };
  const off: Sections = { showFreight: false, showBankDetails: false, showOtherDetails: false };
  const on: Sections = { showFreight: true, showBankDetails: true, showOtherDetails: true };

  const q1 = await quote(1, "draft", off);
  const q2 = await quote(2, "sent", { ...off, showFreight: true });
  const q3 = await quote(3, "negotiating", { ...off, showOtherDetails: true }, {
    revisionNumber: 2,
    rejectionReason: "Customer asked for 5% off the first line.",
    rejectedBy: by,
    rejectedAt: new Date(),
  }, 1.19);
  const q4 = await quote(4, "accepted", on);
  const q5 = await quote(5, "rejected", off, {
    rejectionReason: "Customer sourced locally.",
    rejectedBy: by,
    rejectedAt: new Date(),
  });
  const q6 = await quote(6, "converted", { ...off, showOtherDetails: true });

  // ---------- Proforma invoices ----------
  const pi = async (
    n: number,
    status: (typeof schema.orders.$inferInsert)["status"],
    s: Sections,
    extra: Partial<typeof schema.orders.$inferInsert> = {},
  ) => {
    const l = lines(1.25);
    const [o] = await tx
      .insert(schema.orders)
      .values({
        companyId: company.id,
        orderNumber: `PI-${CODE}-${String(n).padStart(4, "0")}`,
        documentType: "proforma_invoice",
        status,
        customerId: customer.id,
        createdBy: by,
        ...header(s, l, bank.id),
        ...extra,
      })
      .returning();
    await tx.insert(schema.orderItems).values(
      l.map((x, i) => ({
        orderId: o.id,
        productId: x.productId,
        mfd: x.mfd ?? null,
        exp: x.exp ?? null,
        quantity: x.quantity,
        unit: x.unit || null,
        sellingPriceUsd: x.price.toFixed(2),
        totalUsd: dec(x.quantity * cents(x.price)),
        batchId: null,
        sortOrder: i,
      })),
    );
    created.push(o.id);
    return o;
  };

  // QT-SMP-0006 → PI-SMP-0001: the converted chain (PI gets all sections ON).
  const p1 = await pi(1, "draft", on, { convertedFromQuotationId: q6.id });
  await tx
    .update(schema.quotations)
    .set({ convertedToOrderId: p1.id, convertedAt: new Date() })
    .where(eq(schema.quotations.id, q6.id));
  const p2 = await pi(2, "sent", on);
  // Bank details OFF on a confirmed PI → enforced on the commercial invoice once batches are assigned.
  const p3 = await pi(3, "confirmed", { ...on, showBankDetails: false }, { approvedBy: by, approvedAt: new Date() });

  for (const q of [q1, q2, q4, q5]) await snapshot(tx, "quotation", q.id, by, "Created");
  await snapshot(tx, "quotation", q3.id, by, "Price updated for 1 item");
  await snapshot(tx, "quotation", q6.id, by, `Converted to ${p1.orderNumber}`);
  await snapshot(tx, "proforma_invoice", p1.id, by, `Created from ${q6.quotationNumber}`);
  for (const p of [p2, p3]) await snapshot(tx, "proforma_invoice", p.id, by, "Created");

  console.log(`Sample data: company "${SAMPLE_COMPANY}", customer ${CODE}, 6 quotations, 3 proforma invoices`);
  return created;
}

export async function seedSamples(db: Db, dryRun: boolean): Promise<void> {
  const [existing] = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(eq(schema.companies.name, SAMPLE_COMPANY))
    .limit(1);
  if (existing) {
    console.log(`Sample data: "${SAMPLE_COMPANY}" already exists — skipped.`);
    return;
  }
  try {
    await db.transaction(async (tx) => {
      await create(tx);
      if (dryRun) throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
    console.log("Sample data: dry run — rolled back, nothing written.");
  }
}
