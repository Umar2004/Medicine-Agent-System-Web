import { randomUUID } from "node:crypto";
import { db, signatures } from "@/db";
import { errors, handler, ok } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { requireCompany } from "@/lib/company-context";
import { ACTION_TYPES } from "@/lib/constants";
import { getRequestMeta } from "@/lib/request-meta";
import { detectImageType, signedUrl, uploadFile } from "@/lib/supabase-storage";

const MAX_BYTES = 1024 * 1024; // 1 MB

/** multipart/form-data: file (PNG/JPG), label. Any user may upload their own signature. */
export const POST = handler(async (req) => {
  const user = await requireAuth(req);
  const meta = getRequestMeta(req);
  const companyId = await requireCompany(req, user);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw errors.badRequest("Send the signature as multipart/form-data");
  }
  const file = form.get("file");
  const label = String(form.get("label") ?? "").trim();
  if (!(file instanceof File)) throw errors.badRequest("Choose an image file");
  if (!label || label.length > 100) throw errors.badRequest("Give the signature a label (max 100 characters)");
  if (file.size > MAX_BYTES) throw errors.badRequest("Signature image must be 1 MB or smaller");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) throw errors.badRequest("Only PNG or JPG images are allowed");

  const path = `signatures/${companyId}/${user.id}/${randomUUID()}.${type === "image/png" ? "png" : "jpg"}`;
  await uploadFile(path, bytes, type);

  const [row] = await db
    .insert(signatures)
    .values({ companyId, userId: user.id, label, imageUrl: path })
    .returning({ id: signatures.id, label: signatures.label, createdAt: signatures.createdAt });

  auditLog({
    user,
    companyId,
    actionType: ACTION_TYPES.SIGNATURE_UPLOADED,
    entityName: "Signature",
    entityId: row.id,
    newValue: { label },
    meta,
  });
  return ok({ ...row, url: await signedUrl(path) }, { status: 201 });
});
