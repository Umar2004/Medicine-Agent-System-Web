import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db, invoices, packingListItems, packingLists, type Transaction } from "@/db";
import { emptyToNull, type PackingListInput } from "@/lib/validations";

export const PACKING_READ_ROUTES = ["/packing", "/invoices"];

const dec = (n: number | null) => (n === null ? null : n.toFixed(2));

export function packingHeaderValues(input: PackingListInput) {
  return {
    shipmentReference: emptyToNull(input.shipmentReference),
    totalCartons: emptyToNull(input.totalCartons),
    containerInfo: emptyToNull(input.containerInfo),
    grossWeightKg: dec(input.grossWeightKg),
    netWeightKg: dec(input.netWeightKg),
    cbm: dec(input.cbm),
    marks: emptyToNull(input.marks),
    date: input.date || null,
  };
}

export async function insertPackingItems(tx: Transaction, packingListId: string, items: PackingListInput["items"]) {
  await tx.insert(packingListItems).values(
    items.map((i, index) => ({
      packingListId,
      cartonStart: i.cartonStart,
      cartonEnd: i.cartonEnd,
      description: i.description,
      packingDetails: emptyToNull(i.packingDetails),
      sortOrder: index,
    })),
  );
}

/**
 * Re-finalize after a CI was cancelled: carry the packing list of the order's most recent earlier
 * invoice over to the new one, so the warehouse doesn't re-enter cartons and weights. A shipment
 * reference that quoted the old invoice number is updated to the new number.
 */
export async function copyPackingListToNewInvoice(
  tx: Transaction,
  orderId: string,
  newInvoice: { id: string; invoiceNumber: string; companyId: string },
): Promise<{ id: string; fromInvoiceNumber: string } | null> {
  const [previous] = await tx
    .select({ list: packingLists, invoiceNumber: invoices.invoiceNumber })
    .from(packingLists)
    .innerJoin(invoices, eq(invoices.id, packingLists.invoiceId))
    .where(and(eq(invoices.orderId, orderId), ne(invoices.id, newInvoice.id)))
    .orderBy(desc(invoices.createdAt))
    .limit(1);
  if (!previous) return null;

  const old = previous.list;
  const [created] = await tx
    .insert(packingLists)
    .values({
      invoiceId: newInvoice.id,
      companyId: newInvoice.companyId,
      shipmentReference: old.shipmentReference?.split(previous.invoiceNumber).join(newInvoice.invoiceNumber) ?? null,
      totalCartons: old.totalCartons,
      containerInfo: old.containerInfo,
      grossWeightKg: old.grossWeightKg,
      netWeightKg: old.netWeightKg,
      cbm: old.cbm,
      marks: old.marks,
      date: old.date,
    })
    .returning({ id: packingLists.id });

  const items = await tx
    .select()
    .from(packingListItems)
    .where(eq(packingListItems.packingListId, old.id))
    .orderBy(asc(packingListItems.sortOrder));
  if (items.length) {
    await tx.insert(packingListItems).values(
      items.map((i) => ({
        packingListId: created.id,
        cartonStart: i.cartonStart,
        cartonEnd: i.cartonEnd,
        description: i.description,
        packingDetails: i.packingDetails,
        sortOrder: i.sortOrder,
      })),
    );
  }
  return { id: created.id, fromInvoiceNumber: previous.invoiceNumber };
}

export async function getPackingList(id: string, companyId: string | null) {
  const [row] = await db
    .select({
      list: packingLists,
      invoiceNumber: invoices.invoiceNumber,
      invoiceStatus: invoices.status,
    })
    .from(packingLists)
    .innerJoin(invoices, eq(invoices.id, packingLists.invoiceId))
    .where(and(eq(packingLists.id, id), companyId ? eq(packingLists.companyId, companyId) : undefined))
    .limit(1);
  if (!row) return null;
  const items = await db
    .select({
      id: packingListItems.id,
      cartonStart: packingListItems.cartonStart,
      cartonEnd: packingListItems.cartonEnd,
      description: packingListItems.description,
      packingDetails: packingListItems.packingDetails,
    })
    .from(packingListItems)
    .where(eq(packingListItems.packingListId, id))
    .orderBy(asc(packingListItems.sortOrder));
  const l = row.list;
  return {
    ...l,
    grossWeightKg: l.grossWeightKg === null ? null : Number(l.grossWeightKg),
    netWeightKg: l.netWeightKg === null ? null : Number(l.netWeightKg),
    cbm: l.cbm === null ? null : Number(l.cbm),
    invoiceNumber: row.invoiceNumber,
    invoiceStatus: row.invoiceStatus,
    items,
  };
}
export type PackingListDetail = NonNullable<Awaited<ReturnType<typeof getPackingList>>>;

