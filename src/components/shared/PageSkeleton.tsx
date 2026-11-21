import { Skeleton } from "@/components/ui/skeleton";

/** Generic page placeholder: header + toolbar + table card. Shown while a route loads. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-4 flex gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
