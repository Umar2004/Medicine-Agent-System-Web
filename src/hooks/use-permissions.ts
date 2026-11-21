"use client";

import { useCallback, useMemo } from "react";
import { useSession } from "@/hooks/use-auth";
import type { PermissionKey } from "@/lib/constants";

export function usePermissions() {
  const { data: session } = useSession();
  const isOwner = session?.user.role === "owner";
  const keys = useMemo(() => new Set(session?.permissions ?? []), [session]);
  const routes = useMemo(() => new Set(session?.routes ?? []), [session]);

  const can = useCallback((key: PermissionKey) => isOwner || keys.has(key), [isOwner, keys]);
  const canSee = useCallback((route: string) => isOwner || routes.has(route), [isOwner, routes]);

  return { can, canSee, isOwner, ready: !!session };
}
