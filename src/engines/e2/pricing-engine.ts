import { z } from "zod";

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

const TAVersionSchema = z.enum(["PLv13", "V31", "V32", "V34", "V35"]);

const ApplyInhouseMarginSchema = z.object({
  netCost: z.number().nonnegative(),
  inhouseMarginPct: z.number().min(0).max(1),
  taVersion: TAVersionSchema,
});
export type ApplyInhouseMarginInput = z.infer<typeof ApplyInhouseMarginSchema>;

const V34_PLUS = new Set(["V34", "V35"]);

/**
 * CS-003: Inhouse margin deduction — V34/V35 only.
 *
 * Formula (V34+): netCost × (1 − inhouseMarginPct)
 * TA ref: BoQ!AJ = ((1−AD)×AB)×(1−AM) where AM = Inhouse Actual Margin %
 * Pre-V34 (PLv13, V31, V32): returns netCost unchanged — no inhouse margin column in those formats.
 */
export function applyInhouseMargin(input: ApplyInhouseMarginInput): number {
  const { netCost, inhouseMarginPct, taVersion } = ApplyInhouseMarginSchema.parse(input);
  if (!V34_PLUS.has(taVersion)) return netCost;
  return netCost * (1 - inhouseMarginPct);
}
