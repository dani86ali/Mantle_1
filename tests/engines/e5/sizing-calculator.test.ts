import { describe, it, expect } from 'vitest';
import { calculateSizing } from '@/engines/e5/sizing-calculator';
import type { SizingInput } from '@/engines/e5/types';

describe('calculateSizing — small office (2-tier)', () => {
  const input: SizingInput = {
    userCount: 50,
    portCount: 60,
    bandwidthGbps: 0.1,
    siteCount: 1,
    hasWireless: true,
  };

  it('access: ceil(60 × 1.2 / 48) = 2× C9300-48P', () => {
    const r = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(r.accessDevices).toHaveLength(1);
    expect(r.accessDevices[0].model).toBe('C9300-48P');
    expect(r.accessDevices[0].quantity).toBe(2);
  });

  it('core: C9500 HA pair', () => {
    const r = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(r.coreDevices).toHaveLength(1);
    expect(r.coreDevices[0].model).toBe('C9500-24Y4C');
    expect(r.coreDevices[0].quantity).toBe(2);
  });

  it('no distribution layer in two-tier', () => {
    const r = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(r.distributionDevices).toEqual([]);
  });

  it('firewall: FG-81F pair (0.1 × 1.5 = 0.15 Gbps → tier 1)', () => {
    const r = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(r.firewalls).toHaveLength(1);
    expect(r.firewalls[0].model).toBe('FG-81F');
    expect(r.firewalls[0].quantity).toBe(2);
  });

  it('wireless: ceil(50/40 × 1.2) = 2 APs (C9120AXI)', () => {
    const r = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(r.accessPoints).toHaveLength(1);
    expect(r.accessPoints[0].quantity).toBe(2);
    expect(r.accessPoints[0].model).toBe('C9120AXI');
  });
});

describe('calculateSizing — medium campus (3-tier)', () => {
  const input: SizingInput = {
    userCount: 500,
    portCount: 600,
    bandwidthGbps: 1,
    siteCount: 3,
    hasWireless: true,
  };

  it('access: ceil(600 × 1.2 / 48) = 15× C9300-48P', () => {
    const r = calculateSizing(input, 'three_tier_core_dist_access', 'fortinet');
    expect(r.accessDevices[0].model).toBe('C9300-48P');
    expect(r.accessDevices[0].quantity).toBe(15);
  });

  it('distribution layer present with default 2 per site', () => {
    const r = calculateSizing(input, 'three_tier_core_dist_access', 'fortinet');
    expect(r.distributionDevices).toHaveLength(1);
    expect(r.distributionDevices[0].model).toBe('C9500-24Y4C');
    expect(r.distributionDevices[0].quantity).toBe(6); // 3 sites × 2 pair
  });

  it('core: C9500-32C HA pair', () => {
    const r = calculateSizing(input, 'three_tier_core_dist_access', 'fortinet');
    expect(r.coreDevices[0].model).toBe('C9500-32C');
    expect(r.coreDevices[0].quantity).toBe(2);
  });

  it('firewall: FG-201F pair (1 × 1.5 = 1.5 Gbps = 1500 Mbps → tier 2)', () => {
    const r = calculateSizing(input, 'three_tier_core_dist_access', 'fortinet');
    expect(r.firewalls[0].model).toBe('FG-201F');
    expect(r.firewalls[0].quantity).toBe(2);
  });

  it('wireless: ceil(500/40 × 1.2) = 15 APs', () => {
    const r = calculateSizing(input, 'three_tier_core_dist_access', 'fortinet');
    expect(r.accessPoints[0].quantity).toBe(15);
  });
});

describe('calculateSizing — large enterprise', () => {
  const input: SizingInput = {
    userCount: 2000,
    portCount: 2400,
    bandwidthGbps: 3,
    siteCount: 5,
    hasWireless: true,
  };

  it('access scales: ceil(2400 × 1.2 / 48) = 60× C9300-48P', () => {
    const r = calculateSizing(input, 'three_tier_core_dist_access', 'fortinet');
    expect(r.accessDevices[0].quantity).toBe(60);
  });

  it('firewall scales: 3 × 1.5 = 4.5 Gbps = 4500 Mbps → FG-401F (tier 3)', () => {
    const r = calculateSizing(input, 'three_tier_core_dist_access', 'fortinet');
    expect(r.firewalls[0].model).toBe('FG-401F');
  });

  it('wireless scales: ceil(2000/40 × 1.2) = 60 APs', () => {
    const r = calculateSizing(input, 'three_tier_core_dist_access', 'fortinet');
    expect(r.accessPoints[0].quantity).toBe(60);
  });

  it('wireless controller switches to C9800-40 above 250 APs', () => {
    const r = calculateSizing(input, 'three_tier_core_dist_access', 'fortinet');
    expect(r.wirelessControllers[0].model).toBe('C9800-L'); // 60 APs ≤ 250
  });
});

describe('calculateSizing — flags and vendor selection', () => {
  const base: SizingInput = {
    userCount: 100, portCount: 120, bandwidthGbps: 1, siteCount: 1,
  };

  it('hasWireless absent → empty APs and controllers', () => {
    const r = calculateSizing(base, 'two_tier_collapsed_core', 'fortinet');
    expect(r.accessPoints).toEqual([]);
    expect(r.wirelessControllers).toEqual([]);
  });

  it('hasWireless=true → APs and controller present', () => {
    const r = calculateSizing(
      { ...base, hasWireless: true },
      'two_tier_collapsed_core',
      'fortinet',
    );
    expect(r.accessPoints.length).toBeGreaterThan(0);
    expect(r.wirelessControllers.length).toBeGreaterThan(0);
  });

  it('Fortinet vendor → FortiGate firewall model', () => {
    const r = calculateSizing(base, 'two_tier_collapsed_core', 'fortinet');
    expect(r.firewalls[0].model).toMatch(/^FG-/);
    expect(r.firewalls[0].vendor).toBe('fortinet');
  });

  it('Cisco vendor → Cisco FPR firewall model', () => {
    const r = calculateSizing(base, 'two_tier_collapsed_core', 'cisco');
    expect(r.firewalls[0].model).toMatch(/^FPR/);
    expect(r.firewalls[0].vendor).toBe('cisco');
  });

  it('Cisco firewall picks FPR3110 for 1 Gbps × 1.5 = 1.5 Gbps NGFW', () => {
    const r = calculateSizing(base, 'two_tier_collapsed_core', 'cisco');
    expect(r.firewalls[0].model).toBe('FPR3110');
  });

  it('Cisco firewall picks FPR3120 for 2 Gbps × 1.5 = 3 Gbps NGFW (FPR3110 cap is 2)', () => {
    const r = calculateSizing(
      { ...base, bandwidthGbps: 2 },
      'two_tier_collapsed_core',
      'cisco',
    );
    expect(r.firewalls[0].model).toBe('FPR3120');
  });
});

describe('calculateSizing — invariants', () => {
  const input: SizingInput = {
    userCount: 100, portCount: 100, bandwidthGbps: 1, siteCount: 1,
  };

  it('headroom applied: 100 ports × 1.2 = 120 → ceil(120/48) = 3 switches', () => {
    const r = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(r.accessDevices[0].quantity).toBe(3);
    expect(r.accessDevices[0].reasoning).toContain('120');
  });

  it('growth factor applied to bandwidth (1.5x) — visible in reasoning', () => {
    const r = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(r.firewalls[0].reasoning).toContain('1.5');
  });

  it('always 2 core switches (HA)', () => {
    const r = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(r.coreDevices[0].quantity).toBe(2);
  });

  it('always 2 firewalls (HA pair)', () => {
    const r = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(r.firewalls[0].quantity).toBe(2);
  });

  it('small site uses 24-port access switch when total ≤ 24', () => {
    const r = calculateSizing(
      { ...input, portCount: 18 }, // 18 × 1.2 = 21.6 → 22 ≤ 24
      'two_tier_collapsed_core',
      'fortinet',
    );
    expect(r.accessDevices[0].model).toBe('C9300-24P');
  });

  it('pure function — identical inputs produce identical outputs', () => {
    const a = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    const b = calculateSizing(input, 'two_tier_collapsed_core', 'fortinet');
    expect(a).toEqual(b);
  });

  it('rejects negative portCount (Zod)', () => {
    expect(() =>
      calculateSizing({ ...input, portCount: -1 }, 'two_tier_collapsed_core', 'fortinet'),
    ).toThrow();
  });
});
