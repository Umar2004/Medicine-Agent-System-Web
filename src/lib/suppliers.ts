import "server-only";
import { and, eq } from "drizzle-orm";
import { companies, db, suppliers } from "@/db";

export const supplierColumns = {
  id: suppliers.id,
  companyId: suppliers.companyId,
  companyName: companies.name,
  supplierNumber: suppliers.supplierNumber,
  name: suppliers.name,
  contactPerson: suppliers.contactPerson,
  phone: suppliers.phone,
  contactNumber: suppliers.contactNumber,
  email: suppliers.email,
  address: suppliers.address,
  city: suppliers.city,
  country: suppliers.country,
  createdAt: suppliers.createdAt,
  updatedAt: suppliers.updatedAt,
};

export function supplierQuery() {
  return db.select(supplierColumns).from(suppliers).innerJoin(companies, eq(companies.id, suppliers.companyId));
}

/** Loads a supplier; when companyId is given the record must belong to it. */
export async function findSupplier(id: string, companyId?: string | null) {
  const [row] = await supplierQuery()
    .where(
      and(
        eq(suppliers.id, id),
        eq(suppliers.isDeleted, false),
        companyId ? eq(suppliers.companyId, companyId) : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

export const SUPPLIER_READ_ROUTES = ["/suppliers", "/supplier-prices", "/reports"];
