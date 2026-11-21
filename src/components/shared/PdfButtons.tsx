"use client";

import { Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";

/** "View PDF" (new tab) + "Download" for a server-rendered PDF endpoint. */
export function PdfButtons({ path, label = "PDF", size = "default" }: { path: string; label?: string; size?: "default" | "sm" }) {
  const [busy, setBusy] = useState<"open" | "save" | null>(null);

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
    <div className="inline-flex">
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
