/** Runs once when the Next.js server starts. */
export async function register(): Promise<void> {
  // Node-only code sits behind this check (inlined at build time) so the edge bundle never pulls in Puppeteer.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
