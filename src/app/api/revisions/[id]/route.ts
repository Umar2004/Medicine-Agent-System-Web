import { errors, handler, ok, requireUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { resolveCompany } from "@/lib/company-context";
import { documentCompany, getRevision } from "@/lib/documents";
import { requireAnyModule } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { REVISION_READ_ROUTES } from "@/lib/revisions";

/** GET → one revision with its full snapshot ({ document, items } as stored at that revision). */
export const GET = handler<{ id: string }>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Revision");
  const user = await requireAuth(req);
  const companyId = await resolveCompany(req, user);

  const revision = await getRevision(id);
  // Same 404 whether the revision is missing or belongs to a document outside this company.
  if (!revision || !(await documentCompany(revision.documentType, revision.documentId, companyId))) {
    throw errors.notFound("Revision");
  }
  await requireAnyModule(user, REVISION_READ_ROUTES[revision.documentType], { meta: getRequestMeta(req), companyId });
  return ok(revision);
});
