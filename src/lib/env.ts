import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_TOKEN_DAYS: z.coerce.number().positive().default(7),
  JWT_REFRESH_TOKEN_DAYS: z.coerce.number().positive().default(30),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("medicine-agent"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Validated server environment. Parsed lazily so `next build` works without secrets. */
export function env(): Env {
  if (!cached) {
    // Treat `KEY=` (empty) the same as unset so defaults/optional rules apply.
    const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
    const parsed = envSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration — ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
