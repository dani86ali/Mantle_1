import { describe, it, expect } from 'vitest';
import { densityRulesRule } from '@/engines/e2/expert-rules/density-rules';
import type {
  BomLineItem,
  ProjectContext,
} from '@/engines/e2/bom-anomaly-detector';

describe('densityRulesRule', () => {
  it('returns no anomalies when userCount is zero', () => {
    const ctx: ProjectContext = { sector: 'x', siteCount: 1, hasWireless: true };
    expect(densityRulesRule([], ctx)).toEqual([]);
  });

  it('does not emit switch-port anomaly when hasWireless is unset', () => {
    // userCount=1000 → 1200 ports expected with hasWireless, but rule is gated.
    const bom: BomLineItem[] = [
      { sku: 'AP-1', description: 'AP', qty: 25, category: 'Access Point' },
      { sku: 'SW-1', description: 'Switch', qty: 1, category: 'Switch' }, // 48 ports — way under
    ];
    const ctx: ProjectContext = { sector: 'x', siteCount: 1, userCount: 1000 };
    const out = densityRulesRule(bom, ctx);
    expect(out.find((a) => /port capacity/.test(a.description))).toBeUndefined();
  });

  it('emits undersized when AP count is below expected', () => {
    const bom: BomLineItem[] = [
      { sku: 'AP-1', description: 'AP', qty: 1, category: 'Access Point' },
    ];
    const ctx: ProjectContext = {
      sector: 'x',
      siteCount: 1,
      userCount: 400,
      hasWireless: true,
    };
    const out = densityRulesRule(bom, ctx);
    const ap = out.find((a) => /AP count/.test(a.description) && a.type === 'undersized');
    expect(ap).toBeDefined();
  });

  it('emits oversized when AP count is well above expected', () => {
    const bom: BomLineItem[] = [
      { sku: 'AP-1', description: 'AP', qty: 100, category: 'Access Point' },
    ];
    const ctx: ProjectContext = {
      sector: 'x',
      siteCount: 1,
      userCount: 100,
      hasWireless: true,
    };
    const out = densityRulesRule(bom, ctx);
    const ap = out.find((a) => /AP count/.test(a.description) && a.type === 'oversized');
    expect(ap).toBeDefined();
  });

  it('emits no AP anomaly when AP count is within ±20% of expected', () => {
    // 200 users → 5 APs expected, tolerance 4-6.
    const bom: BomLineItem[] = [
      { sku: 'AP-1', description: 'AP', qty: 5, category: 'Access Point' },
      { sku: 'SW-1', description: 'Switch', qty: 6, category: 'Switch' },
    ];
    const ctx: ProjectContext = {
      sector: 'x',
      siteCount: 1,
      userCount: 200,
      hasWireless: true,
    };
    const out = densityRulesRule(bom, ctx);
    expect(out.find((a) => /AP count/.test(a.description))).toBeUndefined();
  });

  it('emits undersized when switch port capacity below expected', () => {
    // 1000 users * 1.2 = 1200 ports expected, ±20% → 960-1440.
    const bom: BomLineItem[] = [
      { sku: 'AP-1', description: 'AP', qty: 25, category: 'Access Point' },
      { sku: 'SW-1', description: 'Switch', qty: 5, category: 'Switch' }, // 240 ports
    ];
    const ctx: ProjectContext = {
      sector: 'x',
      siteCount: 1,
      userCount: 1000,
      hasWireless: true,
    };
    const out = densityRulesRule(bom, ctx);
    const ports = out.find((a) => /port capacity/.test(a.description) && a.type === 'undersized');
    expect(ports).toBeDefined();
  });
});
