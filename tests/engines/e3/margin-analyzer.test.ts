import { describe, it, expect } from 'vitest';
import {
  analyzeMargin,
  NON_PEGGED_CURRENCIES,
  type MarginInput,
} from '@/engines/e3/margin-analyzer';

function input(overrides: Partial<MarginInput> = {}): MarginInput {
  return {
    hardwareCost: 0,
    hardwareSell: 0,
    softwareCost: 0,
    softwareSell: 0,
    servicesCost: 0,
    servicesSell: 0,
    subscriptionCost: 0,
    subscriptionSell: 0,
    ...overrides,
  };
}

describe('analyzeMargin — approval levels (§7.3)', () => {
  it('30% gross margin -> account_manager, no flags', () => {
    // totalCost=700, totalSell=1000, gm=300/1000=0.30, attach=300/700=42.8%
    const r = analyzeMargin(
      input({
        hardwareCost: 500, hardwareSell: 700,
        servicesCost: 200, servicesSell: 300,
      }),
    );
    expect(r.grossMarginPct).toBeCloseTo(0.30);
    expect(r.approvalLevel).toBe('account_manager');
    expect(r.requiresStrategicJustification).toBe(false);
    expect(r.flags).toHaveLength(0);
  });

  it('12% gross margin -> country_manager + low_margin warning', () => {
    // totalCost=880, totalSell=1000, gm=0.12 exact
    const r = analyzeMargin(
      input({
        hardwareCost: 600, hardwareSell: 700,
        servicesCost: 280, servicesSell: 300,
      }),
    );
    expect(r.grossMarginPct).toBeCloseTo(0.12);
    expect(r.approvalLevel).toBe('country_manager');
    expect(r.requiresStrategicJustification).toBe(false);
    const lm = r.flags.find((f) => f.type === 'low_margin');
    expect(lm?.severity).toBe('warning');
  });

  it('8% gross margin -> regional_md + strategic justification + low_margin error', () => {
    // totalCost=920, totalSell=1000, gm=0.08
    const r = analyzeMargin(
      input({
        hardwareCost: 650, hardwareSell: 700,
        servicesCost: 270, servicesSell: 300,
      }),
    );
    expect(r.grossMarginPct).toBeCloseTo(0.08);
    expect(r.approvalLevel).toBe('regional_md');
    expect(r.requiresStrategicJustification).toBe(true);
    const lm = r.flags.find((f) => f.type === 'low_margin');
    expect(lm?.severity).toBe('error');
  });
});

describe('analyzeMargin — services attach (§7.6 benchmark)', () => {
  it('zero services on non-zero hardware -> low_attach warning', () => {
    const r = analyzeMargin(
      input({ hardwareCost: 700, hardwareSell: 1000 }),
    );
    expect(r.servicesAttachRate).toBe(0);
    const la = r.flags.find((f) => f.type === 'low_attach');
    expect(la?.severity).toBe('warning');
    expect(la?.threshold).toBe(0.30);
  });

  it('attach rate is services revenue / hardware revenue', () => {
    const r = analyzeMargin(
      input({
        hardwareCost: 700, hardwareSell: 1000,
        servicesCost: 200, servicesSell: 350,
      }),
    );
    expect(r.servicesAttachRate).toBeCloseTo(0.35);
    expect(r.flags.find((f) => f.type === 'low_attach')).toBeUndefined();
  });
});

describe('analyzeMargin — FX risk (§4.5)', () => {
  it('EGP with 60-day validity -> fx_risk warning', () => {
    const r = analyzeMargin(
      input({
        hardwareCost: 500, hardwareSell: 700,
        servicesCost: 200, servicesSell: 300,
        fxExposure: { currency: 'EGP', validityDays: 60 },
      }),
    );
    const fx = r.flags.find((f) => f.type === 'fx_risk');
    expect(fx?.severity).toBe('warning');
    expect(fx?.actual).toBe(60);
  });

  it('USD (pegged) with 60-day validity -> no fx_risk', () => {
    const r = analyzeMargin(
      input({
        hardwareCost: 500, hardwareSell: 700,
        servicesCost: 200, servicesSell: 300,
        fxExposure: { currency: 'USD', validityDays: 60 },
      }),
    );
    expect(r.flags.find((f) => f.type === 'fx_risk')).toBeUndefined();
  });

  it('EGP with 30-day validity -> no fx_risk (within threshold)', () => {
    const r = analyzeMargin(
      input({
        hardwareCost: 500, hardwareSell: 700,
        servicesCost: 200, servicesSell: 300,
        fxExposure: { currency: 'EGP', validityDays: 30 },
      }),
    );
    expect(r.flags.find((f) => f.type === 'fx_risk')).toBeUndefined();
  });
});

describe('analyzeMargin — discount approval (§7.4)', () => {
  it('25% discount -> warning, country+finance approver in message', () => {
    const r = analyzeMargin(
      input({
        hardwareCost: 500, hardwareSell: 700,
        servicesCost: 200, servicesSell: 300,
        discountFromListPct: 0.25,
      }),
    );
    const d = r.flags.find((f) => f.type === 'discount_threshold');
    expect(d?.severity).toBe('warning');
    expect(d?.message).toMatch(/country manager \+ finance/i);
  });

  it('5% discount -> info, SE/AM auto', () => {
    const r = analyzeMargin(
      input({
        hardwareCost: 500, hardwareSell: 700,
        servicesCost: 200, servicesSell: 300,
        discountFromListPct: 0.05,
      }),
    );
    const d = r.flags.find((f) => f.type === 'discount_threshold');
    expect(d?.severity).toBe('info');
  });

  it('35% discount -> error, executive + SPF', () => {
    const r = analyzeMargin(
      input({
        hardwareCost: 500, hardwareSell: 700,
        servicesCost: 200, servicesSell: 300,
        discountFromListPct: 0.35,
      }),
    );
    const d = r.flags.find((f) => f.type === 'discount_threshold');
    expect(d?.severity).toBe('error');
    expect(d?.message).toMatch(/SPF/);
  });
});

describe('NON_PEGGED_CURRENCIES', () => {
  it('contains the four MENA floating currencies (§4.5)', () => {
    expect(NON_PEGGED_CURRENCIES).toEqual(['EGP', 'TRY', 'LBP', 'ZAR']);
  });
});
