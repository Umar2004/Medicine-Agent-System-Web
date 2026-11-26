"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/hooks/use-company";
import { confirmDanger, showError } from "@/lib/alerts";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Signature } from "@/types/entities";

function uploadSignature(file: File, label: string): Promise<Signature> {
  const body = new FormData();
  body.set("file", file);
  body.set("label", label);
  return api.upload<Signature>("/api/signatures/upload", body);
}

/**
 * Pick one of your own e-signatures, or upload a new PNG/JPG (CLAUDE.md §6: own signatures only).
 * Without `onChange` it only manages them (Settings).
 */
export function SignaturePicker({
  value = "",
  onChange,
  disabled,
}: {
  value?: string;
  onChange?: (id: string) => void;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");

  const { companyId } = useCompany();
  const list = useQuery({
    queryKey: ["signatures", companyId],
    queryFn: () => api.get<Signature[]>("/api/signatures"),
    enabled: !!companyId,
  });

  const upload = useMutation({
    mutationFn: ({ file, label: l }: { file: File; label: string }) => uploadSignature(file, l),
    onSuccess: (sig) => {
      toast.success("Signature uploaded");
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["signatures"] });
      onChange?.(sig.id);
    },
    onError: (err) => showError(errorMessage(err), "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<{ id: string }>(`/api/signatures/${id}`),
    onSuccess: (_d, id) => {
      toast.success("Signature removed");
      if (value === id) onChange?.("");
      void queryClient.invalidateQueries({ queryKey: ["signatures"] });
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <div className="space-y-3">
      {list.isError && <p className="text-sm text-destructive">{errorMessage(list.error)}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {(list.data ?? []).map((sig) => (
          <div
            key={sig.id}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg border p-2 text-left transition-colors",
              value === sig.id ? "border-primary ring-2 ring-primary/30" : onChange && "hover:bg-muted",
              disabled && "opacity-60",
            )}
          >
            <button
              type="button"
              disabled={disabled || !onChange}
              // Selecting only — never toggles off: a double-click used to select then silently clear it.
              onClick={() => onChange?.(sig.id)}
              className="flex flex-1 items-center gap-3 text-left"
              aria-pressed={onChange ? value === sig.id : undefined}
            >
              <span className="flex h-12 w-24 items-center justify-center overflow-hidden rounded bg-paper">
                {sig.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={sig.url} alt={sig.label} className="max-h-12 max-w-24 object-contain" />
                ) : (
                  <span className="text-xs text-text-muted">No preview</span>
                )}
              </span>
              <span className="text-sm font-medium">{sig.label}</span>
              {value === sig.id && <Check className="ml-auto size-4 text-primary" />}
            </button>
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-destructive opacity-0 group-hover:opacity-100 hover:text-destructive"
                aria-label={`Delete signature ${sig.label}`}
                onClick={async () => {
                  if (await confirmDanger({ title: `Delete signature “${sig.label}”?`, text: "Invoices already signed keep their signature." }))
                    remove.mutate(sig.id);
                }}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        {list.data?.length === 0 && <p className="text-sm text-text-secondary">You have no signatures for this company yet.</p>}
      </div>
      {onChange && value && !disabled && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-text-secondary">
            Selected: <span className="font-medium text-foreground">{list.data?.find((s) => s.id === value)?.label ?? "signature"}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Clear selection
          </Button>
        </div>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <div className="min-w-40 flex-1 space-y-1">
            <label htmlFor="sig-label" className="text-xs font-medium text-text-secondary">
              New signature label
            </label>
            <Input id="sig-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Director" />
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" aria-label="Signature image" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!label.trim()) {
              showError("Enter a label for the signature first.");
              e.target.value = "";
              return;
            }
            upload.mutate({ file, label: label.trim() });
          }} />
          <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            Upload PNG/JPG
          </Button>
          <p className="w-full text-xs text-text-muted">Max 1 MB. A transparent PNG prints best.</p>
        </div>
      )}
    </div>
  );
}
