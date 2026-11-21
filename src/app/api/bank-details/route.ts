import { and, asc, count, desc, ilike, or, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { companies, companyBankDetails, db } from "@/db";
import { handler, likePattern, ok, paginated, parseBody, parsePagination, parseSort } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { BANK_DETAIL_READ_ROUTES, bankDetailQuery, findBankDetail } from "@/lib/bank-details";
import { companyScope, requireCompany, resolveCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { requireAnyModule, requirePermission } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { BANK_DETAIL_SORT_FIELDS, bankDetailSchema, emptyToNull, type BankDetailSortField } from "@/lib/validations";

const sortColumns: Record<BankDetailSortField, AnyColumn | SQLWrapper> = {
  bankName: companyBankDetails.bankName,
  accountNumber: companyBankDetails.accountNumber,
  branchName: companyBankDetails.branchName,
  createdAt: companyBankDetails.createdAt,
};

export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  await requireAnyModule(user, BANK_DETAIL_READ_ROUTES, { meta: getRequestMeta(req), companyId });

  const params = req.nextUrl.searchParams;
  const { page, pageSize, offset } = parsePagination(params);
  const { sortBy, desc: isDesc } = parseSort(params, BANK_DETAIL_SORT_FIELDS, "bankName");
  const search = params.get("search")?.trim();

  const where = and(
    companyScope(companyBankDetails.companyId, companyId),
    search
      ? or(
          ilike(companyBankDetails.bankName, likePattern(search)),
          ilike(companyBankDetails.accountNumber, likePattern(search)),
          ilike(companyBankDetails.branchName, likePattern(search)),
          ilike(companyBankDetails.swiftCode, likePattern(search)),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    bankDetailQuery()
      .where(where)
      .orderBy((isDesc ? desc : asc)(sortColumns[sortBy]), asc(companies.name), asc(companyBankDetails.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(companyBankDetails).where(where),
  ]);

  return paginated(rows, total, page, pageSize);
});

export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);
  await requirePermission(user, "manage_bank_details", { meta, companyId });

  const input = await parseBody(req, bankDetailSchema);
  const [row] = await db
    .insert(companyBankDetails)
    .values({
      companyId,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      swiftCode: emptyToNull(input.swiftCode),
      branchName: emptyToNull(input.branchName),
      otherDetails: emptyToNull(input.otherDetails),
    })
    .returning({ id: companyBankDetails.id });

  const bankDetail = await findBankDetail(row.id);
  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.BANK_DETAIL_CREATED,
    entityName: "BankDetail",
    entityId: row.id,
    newValue: bankDetail,
    meta,
  });
  return ok(bankDetail, { status: 201 });
});
