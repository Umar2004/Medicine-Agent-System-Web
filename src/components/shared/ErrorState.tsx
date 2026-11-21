import { errorMessage } from "@/lib/api-client";

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border bg-card p-8 text-center text-sm text-destructive">{errorMessage(error)}</div>
  );
}
