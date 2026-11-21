import "server-only";
import { eq } from "drizzle-orm";
import { companies, db } from "@/db";
import { env } from "@/lib/env";
import { detectImageType, downloadFile } from "@/lib/supabase-storage";

export interface CompanyProfile {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  currency: string;
  logoDataUri: string | null;
}

function toDataUri(bytes: Uint8Array): string | null {
  const type = detectImageType(bytes);
  return type ? `data:${type};base64,${Buffer.from(bytes).toString("base64")}` : null;
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_TTL_MS = 60 * 60_000;
// Logos/signatures rarely change; keep the encoded image so each PDF doesn't re-download it.
const imageCache = new Map<string, { at: number; uri: string | null }>();

async function loadImage(ref: string): Promise<string | null> {
  if (/^https?:\/\//i.test(ref)) {
    const supabase = env().SUPABASE_URL;
    if (!supabase || new URL(ref).host !== new URL(supabase).host) return null;
    const res = await fetch(ref, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length <= MAX_IMAGE_BYTES ? toDataUri(bytes) : null;
  }
  return toDataUri(await downloadFile(ref));
}

/**
 * Image for a PDF, embedded as a data URI so Chrome never fetches anything itself.
 * Accepts a storage path, or an http(s) URL on our own Supabase project only (no SSRF).
 */
export async function imageDataUri(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null;
  const hit = imageCache.get(ref);
  if (hit && Date.now() - hit.at < IMAGE_TTL_MS) return hit.uri;
  try {
    const uri = await loadImage(ref);
    imageCache.set(ref, { at: Date.now(), uri });
    if (imageCache.size > 100) imageCache.delete(imageCache.keys().next().value!);
    return uri;
  } catch (err) {
    console.error("[pdf] image load failed", ref, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getCompanyProfile(id: string): Promise<CompanyProfile> {
  const [c] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    phone: c.phone,
    email: c.email,
    website: c.website,
    taxId: c.taxId,
    currency: c.currency,
    logoDataUri: await imageDataUri(c.logoUrl),
  };
}
