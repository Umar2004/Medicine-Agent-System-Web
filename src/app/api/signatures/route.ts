import { and, desc, eq } from "drizzle-orm";
import { db, signatures } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { requireCompany } from "@/lib/company-context";
import { signedUrl } from "@/lib/supabase-storage";

/** The current user's signatures for the selected company (users sign with their own). */
export const GET = handler(async (req) => {
  const user = await requireAuth(req);
  const companyId = await requireCompany(req, user);
  const rows = await db
    .select({ id: signatures.id, label: signatures.label, imageUrl: signatures.imageUrl, createdAt: signatures.createdAt })
    .from(signatures)
    .where(and(eq(signatures.userId, user.id), eq(signatures.companyId, companyId), eq(signatures.isDeleted, false)))
    .orderBy(desc(signatures.createdAt));

  const withUrls = await Promise.all(
    rows.map(async ({ imageUrl, ...r }) => ({ ...r, url: await signedUrl(imageUrl).catch(() => null) })),
  );
  return ok(withUrls);
});
