"use client";

import { Download, FileText, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";

const PREFETCH_DELAY_MS = 150; // hover intent: skip pointers just passing over
const PREFETCH_EVERY_MS = 30_000; // the document may change while the page stays open

/**
 * "View PDF" (new tab) + "Download" for a server-rendered PDF endpoint.
 * Hovering/focusing starts the render in the background, so by the click the server has it cached.
 */
export function PdfButtons({ path, label = "PDF", size = "default" }: { path: string; label?: string; size?: "default" | "sm" }) {
  const [busy, setBusy] = useState<"open" | "save" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPrefetch = useRef(0);

  useEffect(() => () => cancelPrefetch(), []);

  function cancelPrefetch() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function schedulePrefetch() {
    if (timer.current || busy || Date.now() - lastPrefetch.current < PREFETCH_EVERY_MS) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      lastPrefetch.current = Date.now();
      api.prefetch(path);
    }, PREFETCH_DELAY_MS);
  }

  async function run(mode: "open" | "save") {
    setBusy(mode);
    try {
      await api.download(path, mode === "save" ? { download: 1 } : undefined, { open: mode === "open" });
    } catch (err) {
      showError(errorMessage(err), "Could not generate PDF");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="inline-flex" onPointerEnter={schedulePrefetch} onPointerLeave={cancelPrefetch} onFocus={schedulePrefetch}>
      <Button type="button" variant="outline" size={size} className="rounded-r-none" disabled={!!busy} onClick={() => void run("open")}>
        {busy === "open" ? <Loader2 className="animate-spin" /> : <FileText />}
        {label}
      </Button>
      <Button
        type="button"
        variant="outline"
        size={size === "sm" ? "icon-sm" : "icon"}
        className="-ml-px rounded-l-none"
        aria-label={`Download ${label}`}
        disabled={!!busy}
        onClick={() => void run("save")}
      >
        {busy === "save" ? <Loader2 className="animate-spin" /> : <Download />}
      </Button>
    </div>
  );
}
