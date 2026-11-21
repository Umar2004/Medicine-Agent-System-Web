import { and, count, eq, ne } from "drizzle-orm";
import { companyBankDetails, db, invoices } from "@/db";
import { errors, handler, ok, parseBody, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { findBankDetail } from "@/lib/bank-details";
import { requireCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { bankDetailSchema, emptyToNull } from "@/lib/validations";

type Params = { id: string };

export const PUT = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Bank account");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_bank_details", { meta, companyId });

  const before = await findBankDetail(id, companyId);
  if (!before) throw errors.notFound("Bank account");
  const input = await parseBody(req, bankDetailSchema);

  await db
    .update(companyBankDetails)
    .set({
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      swiftCode: emptyToNull(input.swiftCode),
      branchName: emptyToNull(input.branchName),
      otherDetails: emptyToNull(input.otherDetails),
    })
    .where(eq(companyBankDetails.id, id));

  const after = await findBankDetail(id);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.BANK_DETAIL_UPDATED,
    entityName: "BankDetail",
    entityId: id,
    oldValue: before,
    newValue: after,
    meta,
  });
  return ok(after);
});

/** HARD delete (CLAUDE.md §7.4). Quotations using it simply lose the link. */
export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Bank account");
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_bank_details", { meta, companyId });

  const before = await findBankDetail(id, companyId);
  if (!before) throw errors.notFound("Bank account");

  // Issued/draft invoices must keep printing the same account.
  const [{ n }] = await db
    .select({ n: count() })
    .from(invoices)
    .where(and(eq(invoices.bankDetailId, id), eq(invoices.isDeleted, false), ne(invoices.status, "cancelled")));
  if (n > 0) {
    throw errors.conflict(
      `${n} invoice${n === 1 ? " uses" : "s use"} this bank account, so it cannot be deleted. You can still edit it.`,
    );
  }

  await db.delete(companyBankDetails).where(eq(companyBankDetails.id, id));

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.BANK_DETAIL_DELETED,
    entityName: "BankDetail",
    entityId: id,
    oldValue: before,
    meta,
  });
  return ok({ id });
});
