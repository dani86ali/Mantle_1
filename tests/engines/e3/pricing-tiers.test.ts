import { describe, it, expect } from 'vitest';
import {
  generatePricingTiers,
  type TierConfig,
} from '@/engines/e3/pricing-tiers';
import type { PricingTierBomLine } from '@/engines/e3/types';

const BASE: PricingTierBomLine[] = [
  {
    sku: 'C9300-48P',
    description: 'Catalyst 9300 48-port PoE',
    qty: 4,
    category: 'hardware',
    unitSellPrice: 10000,
    extendedSell: 40000,
  },
  {
    sku: 'C9300-DNA-E',
    description: 'DNA Essentials 3yr',
    qty: 4,
    category: 'subscription',
    unitSellPrice: 1500,
    extendedSell: 6000,
  },
  {
    sku: 'CON-SNT-C9300',
    description: 'SmartNet 8x5xNBD 3yr',
    qty: 4,
    category: 'service',
    unitSellPrice: 800,
    extendedSell: 3200,
  },
];

const BASE_TOTAL = 40000 + 6000 + 3200; // 49200

describe('generatePricingTiers', () => {
  it('produces 3 tiers labelled good/better/best', () => {
    const r = generatePricingTiers(BASE);
    expect(r.tiers).toHaveLength(3);
    expect(r.tiers.map((t) => t.name)).toEqual(['good', 'better', 'best']);
  });

  it('Good tier equals the base BoM total exactly', () => {
    const r = generatePricingTiers(BASE);
    expect(r.tiers[0].totals.grandTotal).toBe(BASE_TOTAL);
    expect(r.tiers[0].totals.hardwareTotal).toBe(40000);
    expect(r.tiers[0].totals.softwareTotal).toBe(6000);
    expect(r.tiers[0].totals.serviceTotal).toBe(3200);
  });

  it('Good tier preserves base BoM lines unchanged', () => {
    const r = generatePricingTiers(BASE);
    expect(r.tiers[0].bom).toEqual(BASE);
  });

  it('Better tier with default multiplier is ~30% above Good', () => {
    const r = generatePricingTiers(BASE);
    const good = r.tiers[0].totals.grandTotal;
    const better = r.tiers[1].totals.grandTotal;
    expect(better).toBeCloseTo(good * 1.3, 6);
  });

  it('Best tier with default multiplier is ~70% above Good', () => {
    const r = generatePricingTiers(BASE);
    const good = r.tiers[0].totals.grandTotal;
    const best = r.tiers[2].totals.grandTotal;
    expect(best).toBeCloseTo(good * 1.7, 6);
  });

  it('comparison table reports correct percentages above Good', () => {
    const r = generatePricingTiers(BASE);
    expect(r.comparison).toHaveLength(3);
    expect(r.comparison[0]).toEqual({
      tierName: 'good',
      grandTotal: BASE_TOTAL,
      vsGoodPct: 0,
    });
    expect(r.comparison[1].tierName).toBe('better');
    expect(r.comparison[1].vsGoodPct).toBeCloseTo(0.3, 6);
    expect(r.comparison[2].tierName).toBe('best');
    expect(r.comparison[2].vsGoodPct).toBeCloseTo(0.7, 6);
  });

  it('replace upgrade swaps the target SKU in Better tier only', () => {
    const config: TierConfig = {
      betterUpgrades: [
        {
          action: 'replace',
          targetSku: 'CON-SNT-C9300',
          newSku: 'CON-SNTP-C9300',
          newDescription: 'SmartNet 24x7x4 3yr',
          newUnitPrice: 1400,
        },
      ],
    };
    const r = generatePricingTiers(BASE, config);
    const better = r.tiers[1].bom!;
    expect(better.find((l) => l.sku === 'CON-SNTP-C9300')).toBeDefined();
    expect(better.find((l) => l.sku === 'CON-SNT-C9300')).toBeUndefined();
    const replaced = better.find((l) => l.sku === 'CON-SNTP-C9300')!;
    expect(replaced.unitSellPrice).toBe(1400);
    expect(replaced.extendedSell).toBe(1400 * 4);
    // Good tier untouched
    expect(r.tiers[0].bom!.find((l) => l.sku === 'CON-SNT-C9300')).toBeDefined();
  });

  it('upgrade_license replaces the first software/subscription line', () => {
    const config: TierConfig = {
      betterUpgrades: [
        {
          action: 'upgrade_license',
          newSku: 'C9300-DNA-A',
          newDescription: 'DNA Advantage 3yr',
          newUnitPrice: 2400,
        },
      ],
    };
    const r = generatePricingTiers(BASE, config);
    const better = r.tiers[1].bom!;
    const upgraded = better.find((l) => l.sku === 'C9300-DNA-A');
    expect(upgraded).toBeDefined();
    expect(upgraded!.unitSellPrice).toBe(2400);
    expect(better.find((l) => l.sku === 'C9300-DNA-E')).toBeUndefined();
  });

  it('add upgrade appends a new line to Best tier', () => {
    const config: TierConfig = {
      bestUpgrades: [
        {
          action: 'add',
          newSku: 'DNA-CENTER-APL',
          newDescription: 'Catalyst Center Appliance',
          newUnitPrice: 50000,
          qty: 1,
          category: 'hardware',
        },
      ],
    };
    const r = generatePricingTiers(BASE, config);
    const best = r.tiers[2].bom!;
    expect(best.length).toBe(BASE.length + 1);
    const added = best.find((l) => l.sku === 'DNA-CENTER-APL');
    expect(added).toBeDefined();
    expect(added!.extendedSell).toBe(50000);
    // Added line is exempt from the multiplier (touched)
  });

  it('empty upgrades still applies the multiplier to every line', () => {
    const r = generatePricingTiers(BASE, { betterUpgrades: [], bestUpgrades: [] });
    expect(r.tiers[1].totals.grandTotal).toBeCloseTo(BASE_TOTAL * 1.3, 6);
    expect(r.tiers[2].totals.grandTotal).toBeCloseTo(BASE_TOTAL * 1.7, 6);
  });

  it('custom multipliers override defaults', () => {
    const r = generatePricingTiers(BASE, {
      betterMultiplier: 1.4,
      bestMultiplier: 2.0,
    });
    expect(r.tiers[1].totals.grandTotal).toBeCloseTo(BASE_TOTAL * 1.4, 6);
    expect(r.tiers[2].totals.grandTotal).toBeCloseTo(BASE_TOTAL * 2.0, 6);
  });

  it('upgrade touches the matched line so multiplier is not applied to it', () => {
    const config: TierConfig = {
      betterMultiplier: 1.3,
      betterUpgrades: [
        {
          action: 'replace',
          targetSku: 'CON-SNT-C9300',
          newSku: 'CON-SNTP-C9300',
          newDescription: 'SmartNet 24x7x4',
          newUnitPrice: 1400,
        },
      ],
    };
    const r = generatePricingTiers(BASE, config);
    const better = r.tiers[1].bom!;
    const support = better.find((l) => l.sku === 'CON-SNTP-C9300')!;
    expect(support.unitSellPrice).toBe(1400); // not 1400 * 1.3
    // Other lines still get the 1.3 multiplier
    const hw = better.find((l) => l.sku === 'C9300-48P')!;
    expect(hw.unitSellPrice).toBeCloseTo(10000 * 1.3, 6);
  });

  it('priceAdjustmentPct upgrades relative to original unit price', () => {
    const config: TierConfig = {
      betterMultiplier: 1, // isolate the upgrade
      betterUpgrades: [
        {
          action: 'replace',
          targetSku: 'C9300-48P',
          newSku: 'C9300-48P',
          newDescription: 'Catalyst 9300 48-port PoE',
          newUnitPrice: 0,
          priceAdjustmentPct: 0.25,
        },
      ],
    };
    const r = generatePricingTiers(BASE, config);
    const hw = r.tiers[1].bom!.find((l) => l.sku === 'C9300-48P')!;
    expect(hw.unitSellPrice).toBeCloseTo(10000 * 1.25, 6);
    expect(hw.extendedSell).toBeCloseTo(10000 * 1.25 * 4, 6);
  });

  it('vsGoodPct is 0 when base total is zero', () => {
    const r = generatePricingTiers([]);
    expect(r.tiers[0].totals.grandTotal).toBe(0);
    expect(r.comparison.every((c) => c.vsGoodPct === 0)).toBe(true);
  });

  it('rejects invalid input via Zod (negative qty)', () => {
    expect(() =>
      generatePricingTiers([
        {
          sku: 'X',
          description: '',
          qty: -1,
          category: 'hardware',
          unitSellPrice: 0,
          extendedSell: 0,
        },
      ]),
    ).toThrow();
  });
});
