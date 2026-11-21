import "server-only";
import { and, eq, like, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { orders, quotations, type Database, type Transaction } from "@/db";

type Executor = Database | Transaction;

export const NUMBER_FORMATS = {
  product: { prefix: "PROD-", digits: 7 },
  customer: { prefix: "CUSTOMER-", digits: 7 },
  supplier: { prefix: "SUPP-", digits: 7 },
  manufacturer: { prefix: "MFG-", digits: 8 },
  // Quotations and PIs: see nextQuotationNumber() / nextProformaNumber(). Legacy rows keep QUOT-0000001.
} as const;

/** Unique constraints to pass to withNumberRetry when inserting generated document numbers. */
export const NUMBER_CONSTRAINTS = {
  quotation: "quotations_company_number_uq",
  proforma: "orders_company_number_uq",
  invoice: "invoices_company_number_uq",
} as const;

const DOCUMENT_SEQ_DIGITS = 4;

export function formatNumber(format: { prefix: string; digits: number }, n: number): string {
  return `${format.prefix}${String(n).padStart(format.digits, "0")}`;
}

/**
 * Next sequence value = count of ALL rows (including soft-deleted) + 1 (CLAUDE.md §7.3).
 * Also considers the highest existing numeric suffix so a gap can never produce a duplicate.
 */
export async function nextSequence(
  executor: Executor,
  table: PgTable,
  numberColumn: PgColumn,
  scope?: SQL,
): Promise<number> {
  const where = scope ? sql`where ${scope}` : sql``;
  const rows = await executor.execute<{ total: number; max_suffix: number }>(sql`
    select count(*)::int as total,
           coalesce(max(nullif(substring(${numberColumn} from '([0-9]+)$'), '')::int), 0) as max_suffix
    from ${table} ${where}
  `);
  const row = rows[0];
  return Math.max(row?.total ?? 0, row?.max_suffix ?? 0) + 1;
}

/**
 * Quotation: QT-{customerCode}-{seq}, e.g. QT-SFL-0001.
 * The sequence is per company (not per customer) and counts soft-deleted rows. Only QT- numbers are
 * counted, so migrated legacy QUOT- numbers don't skew it. Pair with withNumberRetry(NUMBER_CONSTRAINTS.quotation).
 */
export async function nextQuotationNumber(
  executor: Executor,
  companyId: string,
  customerCode: string,
): Promise<string> {
  const seq = await nextSequence(
    executor,
    quotations,
    quotations.quotationNumber,
    and(eq(quotations.companyId, companyId), like(quotations.quotationNumber, "QT-%")),
  );
  return `QT-${customerCode}-${String(seq).padStart(DOCUMENT_SEQ_DIGITS, "0")}`;
}

/**
 * Proforma Invoice: PI-{customerCode}-{seq}, e.g. PI-SFL-0001.
 * Per-company sequence over PI- numbers only (legacy QUOT- orders excluded), soft-deleted included.
 * Pair with withNumberRetry(NUMBER_CONSTRAINTS.proforma).
 */
export async function nextProformaNumber(
  executor: Executor,
  companyId: string,
  customerCode: string,
): Promise<string> {
  const seq = await nextSequence(
    executor,
    orders,
    orders.orderNumber,
    and(eq(orders.companyId, companyId), like(orders.orderNumber, "PI-%")),
  );
  return `PI-${customerCode}-${String(seq).padStart(DOCUMENT_SEQ_DIGITS, "0")}`;
}

// Commercial Invoice numbers ({seq}/{customerCode}/{MM}/{YYYY}) are unchanged — see src/lib/invoices.ts.

/** Postgres unique-violation check that also unwraps Drizzle's DrizzleQueryError. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 3; depth++) {
    if (typeof current === "object" && current !== null) {
      const e = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
      if (e.code === "23505") return !constraint || e.constraint_name === constraint;
      current = e.cause;
    } else {
      break;
    }
  }
  return false;
}

/**
 * Runs `attempt` and retries when two requests raced for the same generated number.
 * `attempt` must regenerate the number on each call.
 */
export async function withNumberRetry<T>(constraint: string, attempt: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (i >= maxAttempts || !isUniqueViolation(err, constraint)) throw err;
    }
  }
}
