// One shared headless Chrome per server process (CLAUDE.md §10: Puppeteer on EC2/Docker), plus a small pool of
// reusable tabs. No "server-only" import: src/instrumentation.ts imports this to pre-warm Chrome at server start.
// State lives on globalThis so the instrumentation bundle and the route bundles share one browser.
import type { Browser, Page } from "puppeteer";

const MAX_IDLE_PAGES = 2;

const g = globalThis as unknown as { pdfBrowser?: Promise<Browser>; pdfIdlePages?: Page[] };
const idlePages = (g.pdfIdlePages ??= []);

async function launch(): Promise<Browser> {
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    headless: "shell",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // --no-sandbox: needed inside Docker. --disable-dev-shm-usage: Docker's 64MB /dev/shm is too small, use /tmp.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
  });
  browser.on("disconnected", () => {
    g.pdfBrowser = undefined;
    idlePages.length = 0; // pages of a dead browser are unusable
  });
  return browser;
}

export function getBrowser(): Promise<Browser> {
  g.pdfBrowser ??= launch().catch((err: unknown) => {
    g.pdfBrowser = undefined;
    throw err;
  });
  return g.pdfBrowser;
}

/** An open tab: an idle pooled one when available, otherwise a new one. */
export async function acquirePage(): Promise<Page> {
  for (let page = idlePages.pop(); page; page = idlePages.pop()) {
    if (!page.isClosed()) return page;
  }
  return (await getBrowser()).newPage();
}

/** Return a tab after a successful render; a failed render should `discardPage` instead. */
export function releasePage(page: Page): void {
  if (!page.isClosed() && idlePages.length < MAX_IDLE_PAGES) idlePages.push(page);
  else void page.close().catch(() => undefined);
}

export function discardPage(page: Page): void {
  void page.close().catch(() => undefined);
}

/** Launch Chrome and open one idle tab so the first PDF after a deploy doesn't pay the cold start. */
export async function prewarmPdfBrowser(): Promise<void> {
  const t0 = performance.now();
  const browser = await getBrowser();
  if (idlePages.length === 0) idlePages.push(await browser.newPage());
  console.log(`[pdf] browser pre-warmed in ${(performance.now() - t0).toFixed(0)}ms`);
}
