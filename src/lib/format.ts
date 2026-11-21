import { format } from "date-fns";

export { formatUsd } from "@/lib/money";

export function formatDate(value: string | Date | null | undefined): string {
  return value ? format(new Date(value), "dd MMM yyyy") : "—";
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? format(new Date(value), "dd MMM yyyy, HH:mm") : "—";
}

export function formatLkr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `LKR ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "09/2025" → "Sep-25" (document style, CLAUDE.md §10). */
export function monYY(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return value;
  return `${MONTHS[Number(m[1]) - 1]}-${m[2].slice(2)}`;
}
