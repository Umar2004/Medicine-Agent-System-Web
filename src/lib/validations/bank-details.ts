import { z } from "zod";
import { optionalText, requiredText } from "./common";

export const bankDetailSchema = z.object({
  bankName: requiredText("Bank name", 200),
  accountNumber: requiredText("Account number", 100),
  swiftCode: optionalText(50),
  branchName: optionalText(200),
  otherDetails: optionalText(1000),
});
export type BankDetailInput = z.infer<typeof bankDetailSchema>;

export const BANK_DETAIL_SORT_FIELDS = ["bankName", "accountNumber", "branchName", "createdAt"] as const;
export type BankDetailSortField = (typeof BANK_DETAIL_SORT_FIELDS)[number];
