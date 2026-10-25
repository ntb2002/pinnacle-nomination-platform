const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$500" for whole dollars, "$499.50" otherwise. */
export function formatCents(cents: number): string {
  return cents % 100 === 0 ? usd.format(cents / 100) : usdCents.format(cents / 100);
}
