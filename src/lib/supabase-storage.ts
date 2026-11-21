import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errors } from "@/lib/api";
import { env } from "@/lib/env";

// Private bucket; files are served through short-lived signed URLs.

let client: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

function storageClient(): SupabaseClient {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw errors.badRequest("File storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  client ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return client;
}

function bucket(): string {
  return env().SUPABASE_STORAGE_BUCKET;
}

/** Creates the private bucket on first use if it does not exist yet. */
async function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const storage = storageClient().storage;
    const { data } = await storage.getBucket(bucket());
    if (data) return;
    const { error } = await storage.createBucket(bucket(), { public: false, fileSizeLimit: 2 * 1024 * 1024 });
    if (error && !/already exists/i.test(error.message)) throw error;
  })().catch((err: unknown) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

export async function uploadFile(path: string, body: Uint8Array, contentType: string): Promise<void> {
  await ensureBucket();
  const { error } = await storageClient().storage.from(bucket()).upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function removeFile(path: string): Promise<void> {
  const { error } = await storageClient().storage.from(bucket()).remove([path]);
  if (error) console.error("[storage] remove failed", error.message);
}

export async function signedUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await storageClient().storage.from(bucket()).createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.error("[storage] signed url failed", error.message);
    return null;
  }
  return data.signedUrl;
}

/** Downloads a file (used later for PDFs). */
export async function downloadFile(path: string): Promise<Uint8Array> {
  const { data, error } = await storageClient().storage.from(bucket()).download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

/** PNG / JPEG magic-byte check — never trust the browser's content-type. */
export function detectImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}
