import { errors, handler, isUuid, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { resolveCompany } from "@/lib/company-context";
import { REVISION_DOCUMENT_TYPES, type RevisionDocumentType } from "@/lib/constants";
import { documentCompany, listRevisions } from "@/lib/documents";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { REVISION_READ_ROUTES } from "@/lib/revisions";

/** GET ?documentType=quotation|proforma_invoice&documentId= → revisions, newest first (no snapshots). */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);
  const documentType = req.nextUrl.searchParams.get("documentType");
  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!(REVISION_DOCUMENT_TYPES as readonly string[]).includes(documentType ?? "") || !isUuid(documentId)) {
    throw errors.badRequest("documentType (quotation | proforma_invoice) and documentId are required");
  }
  const type = documentType as RevisionDocumentType;
  await requireAnyModule(user, REVISION_READ_ROUTES[type], { meta: getRequestMeta(req), companyId });

  if (!(await documentCompany(type, documentId, companyId))) {
    throw errors.notFound(type === "quotation" ? "Quotation" : "Proforma invoice");
  }
  return ok(await listRevisions(type, documentId));
});
