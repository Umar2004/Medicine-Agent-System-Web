import "server-only";
import type { RevisionDocumentType } from "@/lib/constants";
import { ORDER_READ_ROUTES } from "@/lib/orders";
import { QUOTATION_READ_ROUTES } from "@/lib/quotations";

/** Pages whose users may read each document type's revision history (read access = sidebar visibility). */
export const REVISION_READ_ROUTES: Record<RevisionDocumentType, string[]> = {
  quotation: QUOTATION_READ_ROUTES,
  proforma_invoice: ORDER_READ_ROUTES,
};
