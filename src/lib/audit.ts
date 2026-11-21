import "server-only";
import { db, userLogs } from "@/db";
import type { ActionType } from "@/lib/constants";
import type { RequestMeta } from "@/lib/request-meta";

export interface AuditEntry {
  user: { id: string; username: string } | null;
  /** Explicit username for events without a user row (e.g. failed login). */
  username?: string;
  companyId: string | null;
  actionType: ActionType;
  entityName?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  meta: RequestMeta;
}

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Fire-and-forget: never awaited, never throws into the request. */
export function auditLog(entry: AuditEntry): void {
  void db
    .insert(userLogs)
    .values({
      userId: entry.user?.id ?? null,
      username: entry.user?.username ?? entry.username ?? null,
      companyId: entry.companyId,
      actionType: entry.actionType,
      entityName: entry.entityName ?? null,
      entityId: entry.entityId ?? null,
      oldValue: serialize(entry.oldValue),
      newValue: serialize(entry.newValue),
      page: entry.meta.page,
      ipAddress: entry.meta.ipAddress,
      userAgent: entry.meta.userAgent,
    })
    .catch((err: unknown) => console.error("[audit] failed to write log", err));
}
