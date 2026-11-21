import { PageSkeleton } from "@/components/shared/PageSkeleton";

// Shown instantly on navigation while the next route's code loads (applies to every dashboard route).
export default function Loading() {
  return <PageSkeleton />;
}
