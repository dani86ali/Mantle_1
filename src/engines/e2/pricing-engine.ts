import { z } from "zod";

// ─── CS-004 ────────────────────────────────────────────────────────────────

const CalculateOverheadSchema = z.object({
  unitAfterDiscount: z.number().nonnegative(),
  shipmentPct:  z.number().min(0).max(1),
  customPct:    z.number().min(0).max(1),
  insurancePct: z.number().min(0).max(1),
  whtaxPct:     z.number().min(0).max(1),
  zakatPct:     z.number().min(0).max(1),
  financePct:   z.number().min(0).max(1),
  riskPct:      z.number().min(0).max(1),
});
export type CalculateOverheadInput = z.infer<typeof CalculateOverheadSchema>;

export type OverheadResult = {
  shipment:  number;
  custom:    number;
  insurance: number;
  whtax:     number;
  zakat:     number;
  finance:   number;
  risk:      number;
  total:     number;
};

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

/**
 * CS-004: Overhead loading — 7 components each applied to unit cost after discount.
 *
 * Components (BoQ overhead % columns → FINANCIAL SUMMARY source columns):
 *   1. shipment  — freight / logistics cost         (BoQ!AN+AO / FS!L)
 *   2. custom    — customs clearance charges         (BoQ!AP+AQ / FS!M)
 *   3. insurance — cargo / goods insurance           (BoQ!AR+AS / FS!N)
 *   4. whtax     — withholding tax on foreign suppl. (BoQ!AT+AU / FS!O; WHTax special logic applies)
 *   5. zakat     — Islamic tax / V34+ only           (BoQ!AV+AW; pass 0 for pre-V34)
 *   6. finance   — payment-term financing cost       (BoQ!AY+AZ / FS!P)
 *   7. risk      — execution risk provision          (BoQ!BA+BB / FS!Q)
 *
 * Formula per component: amount = unitAfterDiscount × componentPct
 * Total overhead: sum of all 7 amounts
 * TA ref: BoQ!BC = AN+AP+AR+AT+AV+AY+BA (% sum); BF = AO+AQ+AS+AX+AZ+BB+BE (amount sum)
 */
export function calculateOverhead(input: CalculateOverheadInput): OverheadResult {
  const { unitAfterDiscount, shipmentPct, customPct, insurancePct, whtaxPct, zakatPct, financePct, riskPct } =
    CalculateOverheadSchema.parse(input);

  const shipment  = unitAfterDiscount * shipmentPct;
  const custom    = unitAfterDiscount * customPct;
  const insurance = unitAfterDiscount * insurancePct;
  const whtax     = unitAfterDiscount * whtaxPct;
  const zakat     = unitAfterDiscount * zakatPct;
  const finance   = unitAfterDiscount * financePct;
  const risk      = unitAfterDiscount * riskPct;

  return { shipment, custom, insurance, whtax, zakat, finance, risk,
    total: shipment + custom + insurance + whtax + zakat + finance + risk };
}
