import { prewarmPdfBrowser } from "@/lib/pdf-browser";

// Pre-warm Chrome in production so the first PDF after a deploy isn't a cold start. Dev launches it lazily.
if (process.env.NODE_ENV === "production") {
  prewarmPdfBrowser().catch((err: unknown) => {
    console.warn("[pdf] browser pre-warm failed — first PDF will be slow:", err instanceof Error ? err.message : err);
  });
}
