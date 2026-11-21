// Money is stored as DECIMAL(18,2). Do arithmetic in integer cents to avoid float drift.

export function toCents(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return Math.round(Number(value) * 100);
}

export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** qty × unit price, rounded to cents. */
export function lineTotalCents(quantity: number, unitPrice: number | string | null): number {
  return quantity * toCents(unitPrice);
}

export interface OrderTotals {
  itemsTotalCents: number;
  totalCnfCents: number;
}

/** C&F total = goods + air freight + handling & documentation (matches the legacy system). */
export function orderTotals(
  items: { quantity: number; sellingPriceUsd: number | string | null }[],
  airFreight: number | string | null,
  handlingDocumentation: number | string | null,
): OrderTotals {
  const itemsTotalCents = items.reduce((sum, i) => sum + lineTotalCents(i.quantity, i.sellingPriceUsd), 0);
  return { itemsTotalCents, totalCnfCents: itemsTotalCents + toCents(airFreight) + toCents(handlingDocumentation) };
}

export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatUsd = (value: number | string | null | undefined) => usd.format(Number(value ?? 0));
