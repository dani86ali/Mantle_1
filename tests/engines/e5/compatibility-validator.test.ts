import { describe, it, expect } from 'vitest';
import { validateCompatibility } from '@/engines/e5/compatibility-validator';
import type { SizingResult } from '@/engines/e5/types';

const empty: SizingResult = {
  coreDevices: [],
  distributionDevices: [],
  accessDevices: [],
  firewalls: [],
  wirelessControllers: [],
  accessPoints: [],
};

function ds(role: string, model: string, vendor: string, quantity: number) {
  return { role, model, vendor, quantity, reasoning: '' };
}

describe('validateCompatibility — stacking', () => {
  it('mixed C9300 + C9300L in access → error', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [
        ds('access', 'C9300-48P', 'cisco', 2),
        ds('access', 'C9300L-48P-4X', 'cisco', 2),
      ],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const r = validateCompatibility(sizing, 'two_tier_collapsed_core', 'fortinet');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.rule === 'stacking.mixed_families')).toBe(true);
  });

  it('stack > 8 members → error', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 9)],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const r = validateCompatibility(sizing, 'two_tier_collapsed_core', 'fortinet');
    expect(r.errors.some((e) => e.rule === 'stacking.max_members')).toBe(true);
  });
});

describe('validateCompatibility — PoE budget', () => {
  it('PoE budget exceeded → error', () => {
    // C9300-48P PoE budget default = 437W → 1 switch supports ~17 APs at 25.5W.
    // 50 APs requires 50 × 25.5 = 1275W > 437W on a single switch.
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 1)],
      accessPoints: [ds('access_point', 'C9120AXI', 'cisco', 50)],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const r = validateCompatibility(sizing, 'two_tier_collapsed_core', 'fortinet');
    expect(r.errors.some((e) => e.rule === 'poe.budget_exceeded')).toBe(true);
  });

  it('PoE budget sufficient → no PoE error', () => {
    // 3 × C9300-48P = 3 × 437W = 1311W; 10 APs × 25.5 = 255W → OK.
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 3)],
      accessPoints: [ds('access_point', 'C9120AXI', 'cisco', 10)],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const r = validateCompatibility(sizing, 'two_tier_collapsed_core', 'fortinet');
    expect(r.errors.filter((e) => e.rule === 'poe.budget_exceeded')).toHaveLength(0);
  });
});

describe('validateCompatibility — topology consistency', () => {
  it('two_tier with distribution devices → warning', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      distributionDevices: [ds('distribution', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 2)],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const r = validateCompatibility(sizing, 'two_tier_collapsed_core', 'fortinet');
    expect(r.warnings.some((w) => w.rule === 'topology.two_tier_has_distribution')).toBe(true);
  });

  it('three_tier without distribution → error', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-32C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 4)],
      firewalls: [ds('firewall', 'FG-401F', 'fortinet', 2)],
    };
    const r = validateCompatibility(sizing, 'three_tier_core_dist_access', 'fortinet');
    expect(r.errors.some((e) => e.rule === 'topology.three_tier_missing_distribution')).toBe(true);
    expect(r.valid).toBe(false);
  });
});

describe('validateCompatibility — FortiGate PSU', () => {
  it('FortiGate 60F HA pair → optional-redundant-PSU warning', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 2)],
      firewalls: [ds('firewall', 'FG-60F', 'fortinet', 2)],
    };
    const r = validateCompatibility(sizing, 'two_tier_collapsed_core', 'fortinet');
    expect(r.warnings.some((w) => w.rule === 'psu.fortigate_redundant_optional')).toBe(true);
  });

  it('FortiGate 201F HA pair → no PSU warning (dual PSU stock)', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 2)],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const r = validateCompatibility(sizing, 'two_tier_collapsed_core', 'fortinet');
    expect(r.warnings.filter((w) => w.rule === 'psu.fortigate_redundant_optional')).toHaveLength(0);
  });
});

describe('validateCompatibility — valid configurations', () => {
  it('clean two-tier design → valid, no errors', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 3)],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
      accessPoints: [ds('access_point', 'C9120AXI', 'cisco', 5)],
      wirelessControllers: [ds('wireless_controller', 'C9800-L', 'cisco', 1)],
    };
    const r = validateCompatibility(sizing, 'two_tier_collapsed_core', 'fortinet');
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('clean three-tier with distribution → valid', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-32C', 'cisco', 2)],
      distributionDevices: [ds('distribution', 'C9500-24Y4C', 'cisco', 4)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 4)],
      firewalls: [ds('firewall', 'FG-401F', 'fortinet', 2)],
    };
    const r = validateCompatibility(sizing, 'three_tier_core_dist_access', 'fortinet');
    expect(r.valid).toBe(true);
  });
});
