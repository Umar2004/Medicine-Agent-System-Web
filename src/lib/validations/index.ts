export * from "./auth";
export * from "./bank-details";
export * from "./batches";
export * from "./common";
export * from "./companies";
export * from "./customers";
export * from "./invoices";
export * from "./manufacturers";
export * from "./orders";
export * from "./packing-lists";
export * from "./permissions";
export * from "./products";
export * from "./quotations";
export * from "./suppliers";
export * from "./users";

/** '' / whitespace → null, for optional text columns. */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
