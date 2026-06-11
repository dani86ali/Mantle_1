/** E3 margin analyzer — gross margin, attach rate, FX, discount.
 *  Source: docs/reference/hld/Network_PreSales_Playbook_Final_Consolidated.md §7.1-7.4
 *  and §4.5 (non-pegged MENA currencies). Pure, Zod-validated.
 */

import { z } from 'zod';
import type {
  ApprovalLevel,
  MarginAnalysis,
  MarginFlag,
  MarginFlagSeverity,
} from './types';

export const NON_PEGGED_CURRENCIES = ['EGP', 'TRY', 'LBP', 'ZAR'] as const;

export const FxExposureSchema = z.object({
  currency: z.string().min(1),
  validityDays: z.number().int().nonnegative(),
});

export const MarginInputSchema = z.object({
  hardwareCost: z.number().nonnegative(),
  hardwareSell: z.number().nonnegative(),
  softwareCost: z.number().nonnegative(),
  softwareSell: z.number().nonnegative(),
  servicesCost: z.number().nonnegative(),
  servicesSell: z.number().nonnegative(),
  subscriptionCost: z.number().nonnegative(),
  subscriptionSell: z.number().nonnegative(),
  discountFromListPct: z.number().min(0).max(1).optional(),
  fxExposure: FxExposureSchema.optional(),
});
export type MarginInput = z.infer<typeof MarginInputSchema>;

function safeRatio(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

function approvalFor(grossMarginPct: number): ApprovalLevel {
  if (grossMarginPct >= 0.25) return 'account_manager';
  if (grossMarginPct >= 0.15) return 'presales_lead';
  if (grossMarginPct >= 0.10) return 'country_manager';
  return 'regional_md';
}

function marginFlag(grossMarginPct: number): MarginFlag | null {
  if (grossMarginPct < 0.12) {
    return {
      type: 'low_margin',
      severity: 'error',
      message: `Gross margin ${(grossMarginPct * 100).toFixed(1)}% is below the 12% hardware floor — escalate to vendor channel for partner-tier or distributor leverage.`,
      threshold: 0.12,
      actual: grossMarginPct,
    };
  }
  if (grossMarginPct < 0.15) {
    return {
      type: 'low_margin',
      severity: 'warning',
      message: `Gross margin ${(grossMarginPct * 100).toFixed(1)}% is below the 15% deal-review band — requires country manager approval.`,
      threshold: 0.15,
      actual: grossMarginPct,
    };
  }
  return null;
}

function attachFlag(rate: number, hwSell: number): MarginFlag | null {
  if (hwSell === 0) return null;
  if (rate >= 0.30) return null;
  return {
    type: 'low_attach',
    severity: 'warning',
    message: `Services attach rate ${(rate * 100).toFixed(1)}% is below the 30% benchmark — invest in sales-engineer enablement.`,
    threshold: 0.30,
    actual: rate,
  };
}

function fxFlag(fx: MarginInput['fxExposure']): MarginFlag | null {
  if (!fx) return null;
  const nonPegged = (NON_PEGGED_CURRENCIES as readonly string[]).includes(fx.currency);
  if (!nonPegged || fx.validityDays <= 30) return null;
  return {
    type: 'fx_risk',
    severity: 'warning',
    message: `FX exposure in ${fx.currency} with ${fx.validityDays}-day validity exceeds the 30-day non-pegged threshold — add FX validity clause or lock via forward contract.`,
    threshold: 30,
    actual: fx.validityDays,
  };
}

function discountFlag(pct: number | undefined): MarginFlag | null {
  if (pct === undefined) return null;
  let severity: MarginFlagSeverity;
  let approver: string;
  let threshold: number;
  if (pct > 0.30) { severity = 'error'; approver = 'executive escalation + vendor SPF'; threshold = 0.30; }
  else if (pct >= 0.20) { severity = 'warning'; approver = 'country manager + finance'; threshold = 0.20; }
  else if (pct >= 0.10) { severity = 'warning'; approver = 'pre-sales manager'; threshold = 0.10; }
  else { severity = 'info'; approver = 'pre-sales engineer / account manager'; threshold = 0; }
  return {
    type: 'discount_threshold',
    severity,
    message: `Discount-from-list ${(pct * 100).toFixed(1)}% requires ${approver} approval.`,
    threshold,
    actual: pct,
  };
}

export function analyzeMargin(input: MarginInput): MarginAnalysis {
  const v = MarginInputSchema.parse(input);
  const totalCost =
    v.hardwareCost + v.softwareCost + v.servicesCost + v.subscriptionCost;
  const totalSell =
    v.hardwareSell + v.softwareSell + v.servicesSell + v.subscriptionSell;
  const grossMargin = totalSell - totalCost;
  const grossMarginPct = safeRatio(grossMargin, totalSell);
  const hardwareMarginPct = safeRatio(v.hardwareSell - v.hardwareCost, v.hardwareSell);
  const servicesMarginPct = safeRatio(v.servicesSell - v.servicesCost, v.servicesSell);
  const servicesAttachRate = safeRatio(v.servicesSell, v.hardwareSell);

  const flags: MarginFlag[] = [];
  const lm = marginFlag(grossMarginPct);
  if (lm) flags.push(lm);
  const la = attachFlag(servicesAttachRate, v.hardwareSell);
  if (la) flags.push(la);
  const fx = fxFlag(v.fxExposure);
  if (fx) flags.push(fx);
  const dt = discountFlag(v.discountFromListPct);
  if (dt) flags.push(dt);

  return {
    totalCost,
    totalSell,
    grossMargin,
    grossMarginPct,
    hardwareMarginPct,
    servicesMarginPct,
    servicesAttachRate,
    approvalLevel: approvalFor(grossMarginPct),
    requiresStrategicJustification: grossMarginPct < 0.10,
    flags,
  };
}
