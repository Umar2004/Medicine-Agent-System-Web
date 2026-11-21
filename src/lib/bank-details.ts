import "server-only";
import { and, eq } from "drizzle-orm";
import { companies, companyBankDetails, db } from "@/db";

export const bankDetailColumns = {
  id: companyBankDetails.id,
  companyId: companyBankDetails.companyId,
  companyName: companies.name,
  bankName: companyBankDetails.bankName,
  accountNumber: companyBankDetails.accountNumber,
  swiftCode: companyBankDetails.swiftCode,
  branchName: companyBankDetails.branchName,
  otherDetails: companyBankDetails.otherDetails,
  createdAt: companyBankDetails.createdAt,
};

export function bankDetailQuery() {
  return db
    .select(bankDetailColumns)
    .from(companyBankDetails)
    .innerJoin(companies, eq(companies.id, companyBankDetails.companyId));
}

export async function findBankDetail(id: string, companyId?: string | null) {
  const [row] = await bankDetailQuery()
    .where(and(eq(companyBankDetails.id, id), companyId ? eq(companyBankDetails.companyId, companyId) : undefined))
    .limit(1);
  return row ?? null;
}

/** Bank accounts are chosen on quotations and invoices. */
export const BANK_DETAIL_READ_ROUTES = ["/bank-accounts", "/quotations", "/invoices"];
