import "server-only";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { companies, customers, db } from "@/db";
import { errors } from "@/lib/api";

export const customerColumns = {
  id: customers.id,
  companyId: customers.companyId,
  companyName: companies.name,
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
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
};

export function customerQuery() {
  return db.select(customerColumns).from(customers).innerJoin(companies, eq(companies.id, customers.companyId));
}

/** Loads a customer; when companyId is given the record must belong to it. */
export async function findCustomer(id: string, companyId?: string | null) {
  const [row] = await customerQuery()
    .where(
      and(
        eq(customers.id, id),
        eq(customers.isDeleted, false),
        companyId ? eq(customers.companyId, companyId) : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function assertCodeFree(companyId: string, code: string, excludeId?: string): Promise<void> {
  const [dup] = await db
    .select({ name: customers.name, isDeleted: customers.isDeleted })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, companyId),
        eq(customers.code, code),
        excludeId ? ne(customers.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  if (dup) {
    throw errors.conflict(
      dup.isDeleted
        ? `Code "${code}" belonged to a deleted customer (${dup.name}). Choose another code.`
        : `Code "${code}" is already used by ${dup.name}.`,
    );
  }
}

const normalize = (column: typeof customers.name | typeof customers.businessName): SQL =>
  sql`regexp_replace(lower(coalesce(${column}, '')), '[^a-z0-9]', '', 'g')`;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface SimilarCustomer {
  id: string;
  customerNumber: string;
  name: string;
  businessName: string | null;
}

/**
 * CLAUDE.md §7.7: soft duplicate warning. "Close" = same letters/digits ignoring case,
 * spaces and punctuation, or one name contains the other (4+ characters).
 */
export async function findSimilarCustomers(
  companyId: string,
  name: string,
  businessName: string | null,
  excludeId?: string,
): Promise<SimilarCustomer[]> {
  const terms = [...new Set([normalizeText(name), normalizeText(businessName)].filter((t) => t.length >= 3))];
  if (terms.length === 0) return [];

  const matches = terms.flatMap((term) =>
    [customers.name, customers.businessName].map((column) => {
      const n = normalize(column);
      return term.length >= 4
        ? sql`(${n} = ${term} or (length(${n}) >= 4 and (${n} like '%' || ${term} || '%' or ${term} like '%' || ${n} || '%')))`
        : sql`${n} = ${term}`;
    }),
  );

  return db
    .select({
      id: customers.id,
      customerNumber: customers.customerNumber,
      name: customers.name,
      businessName: customers.businessName,
    })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, companyId),
        eq(customers.isDeleted, false),
        excludeId ? ne(customers.id, excludeId) : undefined,
        sql`(${sql.join(matches, sql` or `)})`,
      ),
    )
    .limit(5);
}

export const CUSTOMER_READ_ROUTES = ["/customers", "/quotations", "/invoices", "/reports"];
