import "server-only";
import type { Browser } from "puppeteer";
import type { ReactElement } from "react";

// One shared headless Chrome per server process (CLAUDE.md §10: Puppeteer on EC2/Docker).

const globalForPdf = globalThis as unknown as { pdfBrowser?: Promise<Browser> };

async function launch(): Promise<Browser> {
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    headless: "shell",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // Needed inside Docker containers running as root.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  browser.on("disconnected", () => {
    globalForPdf.pdfBrowser = undefined;
  });
  return browser;
}

function getBrowser(): Promise<Browser> {
  globalForPdf.pdfBrowser ??= launch().catch((err: unknown) => {
    globalForPdf.pdfBrowser = undefined;
    throw err;
  });
  return globalForPdf.pdfBrowser;
}

export interface PdfOptions {
  landscape?: boolean;
  /** Left side of the footer, e.g. the document number. */
  footerLabel?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Renders a complete HTML document to an A4 PDF with "Page X of Y" footer. */
export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    return await page.pdf({
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
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** React template → static HTML → PDF. */
export async function renderPdf(element: ReactElement, options: PdfOptions = {}): Promise<Uint8Array> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return htmlToPdf(`<!DOCTYPE html>${renderToStaticMarkup(element)}`, options);
}

/** `?download=1` → attachment, otherwise open inline in the browser tab. */
export function pdfResponse(pdf: Uint8Array, filename: string, download: boolean): Response {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, "_");
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${safe}"`,
      "cache-control": "private, no-store",
    },
  });
}
