import { describe, it, expect } from 'vitest';
import { generateRackElevations } from '@/engines/e5/rack-elevation-generator';
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

describe('generateRackElevations — small office', () => {
  const sizing: SizingResult = {
    ...empty,
    coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
    accessDevices: [ds('access', 'C9300-48P', 'cisco', 3)],
    firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
  };

  it('produces exactly 1 MDF and 1 IDF rack', () => {
    const racks = generateRackElevations(sizing, 'two_tier_collapsed_core');
    expect(racks).toHaveLength(2);
    expect(racks[0].rackId).toBe('MDF-R1');
    expect(racks[1].rackId).toBe('IDF-1-R1');
  });

  it('MDF rack holds 2 core + 2 firewalls', () => {
    const [mdf] = generateRackElevations(sizing, 'two_tier_collapsed_core');
    const models = mdf.devices.map((d) => d.deviceModel);
    expect(models.filter((m) => m === 'C9500-24Y4C')).toHaveLength(2);
    expect(models.filter((m) => m === 'FG-201F')).toHaveLength(2);
  });

  it('IDF rack holds 3 access switches', () => {
    const [, idf] = generateRackElevations(sizing, 'two_tier_collapsed_core');
    expect(idf.devices).toHaveLength(3);
    expect(idf.devices.every((d) => d.deviceModel === 'C9300-48P')).toBe(true);
  });
});

describe('generateRackElevations — top-down placement and gaps', () => {
  it('first device sits in top usable U (40), startU decreasing downward', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const [mdf] = generateRackElevations(sizing, 'two_tier_collapsed_core');
    // top usable U = RACK_TOTAL_U (42) - PATCH_PANEL_U (2) = 40
    expect(mdf.devices[0].startU).toBe(40);
    // sorted descending — each subsequent device sits below the prior
    for (let i = 1; i < mdf.devices.length; i++) {
      expect(mdf.devices[i].startU).toBeLessThan(mdf.devices[i - 1].startU);
    }
  });

  it('1U gap between core and firewall groups', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const [mdf] = generateRackElevations(sizing, 'two_tier_collapsed_core');
    // core occupies startU 40, 39 → top of FW group would be 38 without gap;
    // with 1U gap, FW starts at 37.
    const lastCore = mdf.devices[1];
    const firstFw = mdf.devices[2];
    expect(lastCore.startU - firstFw.startU).toBeGreaterThanOrEqual(2);
  });
});

describe('generateRackElevations — desktop firewall (0U)', () => {
  it('FortiGate 60F gets a 1U shelf with shelf note', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      firewalls: [ds('firewall', 'FG-60F', 'fortinet', 1)],
    };
    const [mdf] = generateRackElevations(sizing, 'two_tier_collapsed_core');
    const fw = mdf.devices.find((d) => d.deviceModel === 'FG-60F');
    expect(fw).toBeDefined();
    expect(fw!.heightU).toBe(1);
    expect(fw!.label).toContain('shelf-mounted');
  });
});

describe('generateRackElevations — rack overflow', () => {
  it('40 × 1U access switches spill across 2 IDF racks', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 40)], // > 38U usable
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const racks = generateRackElevations(sizing, 'two_tier_collapsed_core');
    const idfRacks = racks.filter((r) => r.rackId.startsWith('IDF-1'));
    expect(idfRacks).toHaveLength(2);
    expect(idfRacks[0].rackId).toBe('IDF-1-R1');
    expect(idfRacks[1].rackId).toBe('IDF-1-R2');
    expect(idfRacks[0].devices).toHaveLength(38); // fills usable 38U
    expect(idfRacks[1].devices).toHaveLength(2);  // overflow
  });
});

describe('generateRackElevations — invariants', () => {
  it('startU values never overlap inside a rack', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 5)],
      firewalls: [ds('firewall', 'FG-201F', 'fortinet', 2)],
    };
    const racks = generateRackElevations(sizing, 'two_tier_collapsed_core');
    for (const rack of racks) {
      const ranges = rack.devices
        .map((d) => ({ lo: d.startU, hi: d.startU + d.heightU - 1 }))
        .sort((a, b) => a.lo - b.lo);
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i].lo).toBeGreaterThan(ranges[i - 1].hi);
      }
    }
  });

  it('three-tier topology places distribution in MDF', () => {
    const sizing: SizingResult = {
      ...empty,
      coreDevices: [ds('core', 'C9500-32C', 'cisco', 2)],
      distributionDevices: [ds('distribution', 'C9500-24Y4C', 'cisco', 2)],
      accessDevices: [ds('access', 'C9300-48P', 'cisco', 4)],
      firewalls: [ds('firewall', 'FG-401F', 'fortinet', 2)],
    };
    const [mdf] = generateRackElevations(sizing, 'three_tier_core_dist_access');
    expect(mdf.devices.some((d) => d.deviceModel === 'C9500-24Y4C')).toBe(true);
    expect(mdf.devices.some((d) => d.deviceModel === 'C9500-32C')).toBe(true);
  });
});
