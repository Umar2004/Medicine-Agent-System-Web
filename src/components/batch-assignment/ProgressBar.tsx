import { cn } from "@/lib/utils";

/** Thin progress bar: amber while partial, green when complete (`tone` overrides). */
export function ProgressBar({
  value,
  max,
  label,
  tone,
  className,
}: {
  value: number;
  max: number;
  label: string;
  tone?: "warning" | "success" | "danger";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const t = tone ?? (max > 0 && value >= max ? "success" : "warning");
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-200",
          t === "success" && "bg-success",
          t === "warning" && "bg-warning",
          t === "danger" && "bg-destructive",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
