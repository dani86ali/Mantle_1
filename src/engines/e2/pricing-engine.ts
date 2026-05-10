// CS-001: currency conversion — list price in vendor currency -> SAR
export function convertCurrency(amountUsd: number, fxRate: number): number {
  return amountUsd * fxRate;
}

// CS-002: two sequential discounts (partner first, then deal-reg on remainder)
export function applyVendorDiscount(
  amount: number,
  partnerDiscountPct: number,
  dealRegDiscountPct: number
): number {
  return amount * (1 - partnerDiscountPct) * (1 - dealRegDiscountPct);
}
