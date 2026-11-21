import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Bottom bar: done / partial / pending counts and "Save all assignments" (only when every product matches exactly). */
export function AssignmentSummaryBar({
  done,
  partial,
  pending,
  total,
  saving,
  onSave,
}: {
  done: number;
  partial: number;
  pending: number;
  total: number;
  saving: boolean;
  onSave: () => void;
}) {
  const ready = total > 0 && done === total;
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-text-secondary" aria-live="polite">
        <span className="font-medium text-foreground">
          {done} / {total}
        </span>{" "}
        products fully assigned · {partial} partially assigned · {pending} pending
      </p>
      <Button
        type="button"
        disabled={!ready || saving}
        title={ready ? undefined : "Every product must be assigned exactly its requested quantity"}
        onClick={onSave}
      >
        {saving ? <Loader2 className="animate-spin" /> : <Save />}
        Save all assignments
      </Button>
    </div>
  );
}
