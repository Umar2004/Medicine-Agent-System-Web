import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { ReactElement } from "react";
import { acquirePage, discardPage, releasePage } from "@/lib/pdf-browser";

export interface PdfOptions {
  landscape?: boolean;
  /** Left side of the footer, e.g. the document number. */
  footerLabel?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ms = (from: number, to: number) => `${(to - from).toFixed(0)}ms`;

/** Renders a complete HTML document to an A4 PDF with "Page X of Y" footer. */
export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Uint8Array> {
  const t0 = performance.now();
  const page = await acquirePage();
  const t1 = performance.now();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const t2 = performance.now();
    const pdf = await page.pdf({
      format: "A4",
      landscape: !!options.landscape,
      printBackground: true,
      margin: { top: "10mm", bottom: "14mm", left: "10mm", right: "10mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font-size:8px;color:#64748B;padding:0 10mm;display:flex;justify-content:space-between;font-family:Arial,Helvetica,sans-serif">
        <span>${esc(options.footerLabel ?? "")}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    });
    const t3 = performance.now();
    releasePage(page);
    console.log(
      `[pdf] page=${ms(t0, t1)} setContent=${ms(t1, t2)} print=${ms(t2, t3)} total=${ms(t0, t3)} ` +
        `html=${(html.length / 1024).toFixed(0)}KB pdf=${(pdf.length / 1024).toFixed(0)}KB`,
    );
    return pdf;
  } catch (err) {
    discardPage(page); // a tab that failed mid-render isn't trusted for reuse
    throw err;
  }
}

async function toHtml(element: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return `<!DOCTYPE html>${renderToStaticMarkup(element)}`;
}

/** React template → static HTML → PDF. */
export async function renderPdf(element: ReactElement, options: PdfOptions = {}): Promise<Uint8Array> {
  return htmlToPdf(await toHtml(element), options);
}

/** `?download=1` → attachment, otherwise open inline in the browser tab. */
export function pdfResponse(
  pdf: Uint8Array,
  filename: string,
  download: boolean,
  extraHeaders: Record<string, string> = {},
): Response {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, "_");
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${safe}"`,
      "cache-control": "private, no-store",
      ...extraHeaders,
    },
  });
}

// ---------- Document PDFs: content-addressed cache ----------
// The key is a hash of the final HTML (document data, company profile, logo/signature, template), so a cached PDF
// can never be stale and nothing needs invalidating: any change to what would be printed changes the key.

const PDF_CACHE_TTL_MS = 30 * 60_000;
const PDF_CACHE_MAX_BYTES = 64 * 1024 * 1024;

const g = globalThis as unknown as {
  pdfCache?: Map<string, { at: number; pdf: Uint8Array }>;
  pdfInflight?: Map<string, Promise<Uint8Array>>;
};
const pdfCache = (g.pdfCache ??= new Map());
const inflight = (g.pdfInflight ??= new Map());

function cacheGet(key: string): Uint8Array | null {
  const hit = pdfCache.get(key);
  if (!hit) return null;
  pdfCache.delete(key);
  if (Date.now() - hit.at > PDF_CACHE_TTL_MS) return null;
  pdfCache.set(key, hit); // re-insert → most recently used
  return hit.pdf;
}

function cacheSet(key: string, pdf: Uint8Array): void {
  pdfCache.set(key, { at: Date.now(), pdf });
  let bytes = 0;
  for (const v of pdfCache.values()) bytes += v.pdf.length;
  for (const [k, v] of pdfCache) {
    if (bytes <= PDF_CACHE_MAX_BYTES) break;
    pdfCache.delete(k); // oldest first
    bytes -= v.pdf.length;
  }
}

function etagMatches(req: NextRequest, etag: string): boolean {
  const header = req.headers.get("if-none-match");
  return !!header && header.split(",").some((t) => t.trim().replace(/^W\//, "") === etag);
}

/**
 * Full response for a document PDF (QT / PI / CI / packing list). Sends 304 when the browser already holds this exact
 * PDF, serves repeat renders from memory, and shares one Chrome render between concurrent identical requests.
 * `no-cache` (not `max-age`) so every view still goes through auth — the browser just revalidates via the ETag.
 */
export async function documentPdfResponse(
  req: NextRequest,
  element: ReactElement,
  options: PdfOptions & { filename: string },
): Promise<Response> {
  const t0 = performance.now();
  const html = await toHtml(element);
  const key = createHash("sha256")
    .update(JSON.stringify({ landscape: !!options.landscape, footer: options.footerLabel ?? "" }))
    .update(html)
    .digest("base64url");
  const etag = `"${key.slice(0, 32)}"`;
  const headers = { etag, "cache-control": "private, no-cache" };
  const t1 = performance.now();

  if (etagMatches(req, etag)) {
    console.log(`[pdf] 304 ${options.filename} html=${ms(t0, t1)}`);
    return new Response(null, { status: 304, headers });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const cached = cacheGet(key);
  if (cached) {
    console.log(`[pdf] cache hit ${options.filename} html=${ms(t0, t1)}`);
    return pdfResponse(cached, options.filename, download, headers);
  }

  // Concurrent identical requests (hover prefetch + click) share one Chrome render.
  let job = inflight.get(key);
  if (!job) {
    job = htmlToPdf(html, options).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  const pdf: Uint8Array = await job;
  cacheSet(key, pdf);
  console.log(`[pdf] rendered ${options.filename} html=${ms(t0, t1)} total=${ms(t0, performance.now())}`);
  return pdfResponse(pdf, options.filename, download, headers);
}
