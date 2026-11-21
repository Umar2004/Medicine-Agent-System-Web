import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { companies, db } from "@/db";
import { errors, handler, ok, requireUuid } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth, type SessionUser } from "@/lib/auth";
import { findCompany } from "@/lib/companies";
import { ACTION_TYPES } from "@/lib/constants";
import { requireOwner } from "@/lib/permissions";
import { getRequestMeta } from "@/lib/request-meta";
import { detectImageType, removeFile, uploadFile } from "@/lib/supabase-storage";

type Params = { id: string };

const MAX_BYTES = 2 * 1024 * 1024; // the bucket's file limit

async function currentLogo(id: string) {
  const [row] = await db
    .select({ logoUrl: companies.logoUrl })
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.isDeleted, false)))
    .limit(1);
  if (!row) throw errors.notFound("Company");
  return row.logoUrl;
}

/** Imported logos are public URLs owned by the legacy app — only delete files we uploaded. */
async function removeOwnFile(ref: string | null): Promise<void> {
  if (ref && !/^https?:\/\//i.test(ref)) await removeFile(ref);
}

async function setLogo(req: NextRequest, user: SessionUser, id: string, logoUrl: string | null, previous: string | null) {
  await db.update(companies).set({ logoUrl, updatedAt: new Date() }).where(eq(companies.id, id));
  await removeOwnFile(previous);
  auditLog({
    user,
    companyId: id,
    actionType: ACTION_TYPES.COMPANY_UPDATED,
    entityName: "Company",
    entityId: id,
    newValue: { logo: logoUrl ? "uploaded" : "removed" },
    meta: getRequestMeta(req),
  });
  return ok(await findCompany(id));
}

/** multipart/form-data: file (PNG/JPG). */
export const POST = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Company");
  const user = await requireAuth(req);
  requireOwner(user, { meta: getRequestMeta(req), companyId: null });
  const previous = await currentLogo(id);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw errors.badRequest("Send the logo as multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw errors.badRequest("Choose an image file");
  if (file.size > MAX_BYTES) throw errors.badRequest("Logo must be 2 MB or smaller");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) throw errors.badRequest("Only PNG or JPG images are allowed");

  const path = `logos/${id}/${randomUUID()}.${type === "image/png" ? "png" : "jpg"}`;
  await uploadFile(path, bytes, type);
  return setLogo(req, user, id, path, previous);
});

export const DELETE = handler<Params>(async (req, { params }) => {
  const id = requireUuid((await params).id, "Company");
  const user = await requireAuth(req);
  requireOwner(user, { meta: getRequestMeta(req), companyId: null });
  return setLogo(req, user, id, null, await currentLogo(id));
});
