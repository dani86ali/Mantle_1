/** E3 Good/Better/Best pricing tier generator.
 *  Source: docs/reference/hld/Network_PreSales_Playbook_Final_Consolidated.md §7.5.
 *  Pure functions, Zod-validated inputs (no AI, no I/O).
 */

import { z } from 'zod';
import type {
  PricingTier,
  PricingTierBomLine,
  PricingTierTotals,
  TierName,
} from './types';

export const TierBomLineSchema = z.object({
  sku: z.string().min(1),
  description: z.string(),
  qty: z.number().nonnegative(),
  category: z.string().min(1),
  unitSellPrice: z.number().nonnegative(),
  extendedSell: z.number().nonnegative(),
});

export const TierUpgradeSchema = z.object({
  action: z.enum(['replace', 'add', 'upgrade_support', 'upgrade_license']),
  targetSku: z.string().optional(),
  newSku: z.string().min(1),
  newDescription: z.string(),
  newUnitPrice: z.number().nonnegative(),
  priceAdjustmentPct: z.number().optional(),
  qty: z.number().nonnegative().optional(),
  category: z.string().optional(),
});
export type TierUpgrade = z.infer<typeof TierUpgradeSchema>;

export const TierConfigSchema = z.object({
  goodMultiplier: z.number().positive().optional(),
  betterMultiplier: z.number().positive().optional(),
  bestMultiplier: z.number().positive().optional(),
  betterUpgrades: z.array(TierUpgradeSchema).optional(),
  bestUpgrades: z.array(TierUpgradeSchema).optional(),
});
export type TierConfig = z.infer<typeof TierConfigSchema>;

export interface TierComparisonEntry {
  tierName: string;
  grandTotal: number;
  vsGoodPct: number;
}

export interface PricingTierResult {
  tiers: PricingTier[];
  comparison: TierComparisonEntry[];
}

const TIER_META: Record<TierName, { label: string; description: string }> = {
  good: {
    label: 'Good (Must-Have)',
    description:
      'Meets RFP minimums at the lowest price point — baseline configuration with standard support.',
  },
  better: {
    label: 'Better (Recommended)',
    description:
      'Adds resilience, advanced features, and a higher support tier. Priced 25-40% above Good.',
  },
  best: {
    label: 'Best (Transformational)',
    description:
      'Full-stack with automation, zero-trust, and premium support. Priced 60-100% above Good with long-term TCO benefits.',
  },
};

const HARDWARE_CATS = new Set(['hardware', 'accessory', 'cable', 'spare']);
const SOFTWARE_CATS = new Set(['software', 'subscription', 'license']);
const SERVICE_CATS = new Set(['service', 'support']);

function classify(category: string): 'hardware' | 'software' | 'service' {
  const c = category.toLowerCase();
  if (HARDWARE_CATS.has(c)) return 'hardware';
  if (SOFTWARE_CATS.has(c)) return 'software';
  if (SERVICE_CATS.has(c)) return 'service';
  return 'service';
}

function computeTotals(lines: PricingTierBomLine[]): PricingTierTotals {
  let hardwareTotal = 0;
  let softwareTotal = 0;
  let serviceTotal = 0;
  for (const l of lines) {
    const cls = classify(l.category);
    if (cls === 'hardware') hardwareTotal += l.extendedSell;
    else if (cls === 'software') softwareTotal += l.extendedSell;
    else serviceTotal += l.extendedSell;
  }
  return {
    hardwareTotal,
    softwareTotal,
    serviceTotal,
    grandTotal: hardwareTotal + softwareTotal + serviceTotal,
  };
}

function priceFromUpgrade(line: PricingTierBomLine, up: TierUpgrade): number {
  if (up.priceAdjustmentPct !== undefined) {
    return line.unitSellPrice * (1 + up.priceAdjustmentPct);
  }
  return up.newUnitPrice;
}

function findTargetIndex(lines: PricingTierBomLine[], up: TierUpgrade): number {
  if (up.targetSku) return lines.findIndex((l) => l.sku === up.targetSku);
  if (up.action === 'upgrade_support') {
    return lines.findIndex((l) => classify(l.category) === 'service');
  }
  if (up.action === 'upgrade_license') {
    return lines.findIndex((l) => classify(l.category) === 'software');
  }
  return -1;
}

function applyUpgrade(
  lines: PricingTierBomLine[],
  touched: Set<number>,
  up: TierUpgrade,
): void {
  if (up.action === 'add') {
    const qty = up.qty ?? 1;
    lines.push({
      sku: up.newSku,
      description: up.newDescription,
      qty,
      category: up.category ?? 'service',
      unitSellPrice: up.newUnitPrice,
      extendedSell: qty * up.newUnitPrice,
    });
    touched.add(lines.length - 1);
    return;
  }
  const idx = findTargetIndex(lines, up);
  if (idx === -1) return;
  const cur = lines[idx];
  const newUnit = priceFromUpgrade(cur, up);
  lines[idx] = {
    ...cur,
    sku: up.newSku,
    description: up.newDescription,
    unitSellPrice: newUnit,
    extendedSell: newUnit * cur.qty,
  };
  touched.add(idx);
}

function buildTier(
  name: TierName,
  base: PricingTierBomLine[],
  upgrades: TierUpgrade[] | undefined,
  multiplier: number,
): PricingTier {
  const lines: PricingTierBomLine[] = base.map((l) => ({ ...l }));
  const touched = new Set<number>();
  for (const up of upgrades ?? []) applyUpgrade(lines, touched, up);
  if (multiplier !== 1) {
    for (let i = 0; i < lines.length; i++) {
      if (touched.has(i)) continue;
      const l = lines[i];
      const newUnit = l.unitSellPrice * multiplier;
      lines[i] = { ...l, unitSellPrice: newUnit, extendedSell: newUnit * l.qty };
    }
  }
  return {
    name,
    label: TIER_META[name].label,
    description: TIER_META[name].description,
    sections: [],
    totals: computeTotals(lines),
    bom: lines,
  };
}

export function generatePricingTiers(
  baseBoM: PricingTierBomLine[],
  config: TierConfig = {},
): PricingTierResult {
  const validatedBase = z.array(TierBomLineSchema).parse(baseBoM);
  const validatedConfig = TierConfigSchema.parse(config);
  const good = buildTier('good', validatedBase, undefined, validatedConfig.goodMultiplier ?? 1);
  const better = buildTier(
    'better',
    validatedBase,
    validatedConfig.betterUpgrades,
    validatedConfig.betterMultiplier ?? 1.3,
  );
  const best = buildTier(
    'best',
    validatedBase,
    validatedConfig.bestUpgrades,
    validatedConfig.bestMultiplier ?? 1.7,
  );
  const tiers: PricingTier[] = [good, better, best];
  const goodTotal = good.totals.grandTotal;
  const comparison: TierComparisonEntry[] = tiers.map((t) => ({
    tierName: t.name,
    grandTotal: t.totals.grandTotal,
    vsGoodPct: goodTotal === 0 ? 0 : (t.totals.grandTotal - goodTotal) / goodTotal,
  }));
  return { tiers, comparison };
}
