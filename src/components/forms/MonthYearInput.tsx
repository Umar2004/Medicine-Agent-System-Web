"use client";

import { Input } from "@/components/ui/input";

/** "082028" → "08/2028" as the user types. */
function formatMonthYear(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function MonthYearInput({
  id,
  value,
  onChange,
  onBlur,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      placeholder="MM/YYYY"
      maxLength={7}
      className="font-mono"
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(formatMonthYear(e.target.value))}
      onBlur={onBlur}
    />
  );
}
