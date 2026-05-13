import { describe, it, expect } from 'vitest';
import { generateCableSchedule } from '@/engines/e5/cable-schedule-generator';
import { generatePortMaps } from '@/engines/e5/port-map-generator';
import { planIPVlans } from '@/engines/e5/ip-vlan-planner';
import type {
  PortMap,
  SizingResult,
  VlanEntry,
} from '@/engines/e5/types';

const vlans: VlanEntry[] = planIPVlans({
  siteCount: 1,
  topology: 'two_tier_collapsed_core',
  hasWireless: true,
  hasVoice: true,
  hasOT: false,
  hasDC: false,
  hasGuest: false,
  vrfEnabled: false,
}).vlans;

const sizing: SizingResult = {
  coreDevices: [{ role: 'core', model: 'C9500-24Y4C', vendor: 'cisco', quantity: 2, reasoning: '' }],
  distributionDevices: [],
  accessDevices: [{ role: 'access', model: 'C9300-48P', vendor: 'cisco', quantity: 1, reasoning: '' }],
  firewalls: [{ role: 'firewall', model: 'FG-81F', vendor: 'fortinet', quantity: 2, reasoning: '' }],
  wirelessControllers: [],
  accessPoints: [],
};

const portMaps: PortMap[] = generatePortMaps(sizing, vlans);

describe('generateCableSchedule — coverage', () => {
  const cables = generateCableSchedule(portMaps, 'two_tier_collapsed_core');

  it('emits exactly one power cable per physical device', () => {
    const power = cables.filter((c) => c.type === 'power');
    expect(power).toHaveLength(portMaps.length);
    for (const p of power) {
      expect(p.lengthMeters).toBe(3);
      expect(p.fromPort).toBe('PSU');
      expect(p.toDevice).toBe('PDU');
    }
  });

  it('signal cables exist only for trunk/routed ports with a connectedTo value', () => {
    const signalCount = cables.filter((c) => c.type !== 'power').length;
    const expected = portMaps
      .flatMap((m) => m.ports)
      .filter((p) => (p.type === 'trunk' || p.type === 'routed') && !!p.connectedTo)
      .length;
    expect(signalCount).toBe(expected);
  });

  it('skips access-VLAN ports and unused firewall ports', () => {
    expect(cables.find((c) => c.toDevice === 'end-user/workstation')).toBeUndefined();
    expect(cables.find((c) => c.toDevice === '')).toBeUndefined();
  });
});

describe('generateCableSchedule — IDs and labels', () => {
  const cables = generateCableSchedule(portMaps, 'two_tier_collapsed_core');

  it('cableIds are sequential CBL-001, CBL-002, ...', () => {
    cables.forEach((c, i) => {
      expect(c.cableId).toBe(`CBL-${String(i + 1).padStart(3, '0')}`);
    });
  });

  it('label format = FROM:PORT <-> TO:PORT', () => {
    for (const c of cables) {
      expect(c.label).toBe(`${c.fromDevice}:${c.fromPort} <-> ${c.toDevice}:${c.toPort}`);
    }
  });
});

describe('generateCableSchedule — cable type by run length', () => {
  it('two-tier access uplinks → fiber_mm at 30m', () => {
    const cables = generateCableSchedule(portMaps, 'two_tier_collapsed_core');
    const uplinks = cables.filter(
      (c) => c.fromDevice.startsWith('access-') && c.toDevice === 'core/distribution',
    );
    expect(uplinks.length).toBeGreaterThan(0);
    for (const c of uplinks) {
      expect(c.type).toBe('fiber_mm');
      expect(c.lengthMeters).toBe(30);
    }
  });

  it('three-tier access uplinks bump to 50m, still fiber_mm', () => {
    const cables = generateCableSchedule(portMaps, 'three_tier_core_dist_access');
    const uplinks = cables.filter(
      (c) => c.fromDevice.startsWith('access-') && c.toDevice === 'core/distribution',
    );
    expect(uplinks.length).toBeGreaterThan(0);
    for (const c of uplinks) {
      expect(c.type).toBe('fiber_mm');
      expect(c.lengthMeters).toBe(50);
    }
  });

  it('core ↔ firewall uses cat6a at 1m (same rack)', () => {
    const cables = generateCableSchedule(portMaps, 'two_tier_collapsed_core');
    const fwLinks = cables.filter((c) => c.toDevice.startsWith('firewall-'));
    expect(fwLinks).toHaveLength(4); // 2 cores × 2 firewall trunks
    for (const c of fwLinks) {
      expect(c.type).toBe('cat6a');
      expect(c.lengthMeters).toBe(1);
    }
  });

  it('firewall-zone ports use cat6a at 1m', () => {
    const cables = generateCableSchedule(portMaps, 'two_tier_collapsed_core');
    const zoneLinks = cables.filter((c) =>
      ['outside', 'inside', 'dmz', 'management'].includes(c.toDevice),
    );
    expect(zoneLinks.length).toBeGreaterThan(0);
    for (const c of zoneLinks) {
      expect(c.type).toBe('cat6a');
      expect(c.lengthMeters).toBe(1);
    }
  });

  it('phone/AP drops are cat6a at 10m', () => {
    const cables = generateCableSchedule(portMaps, 'two_tier_collapsed_core');
    const drops = cables.filter((c) => c.toDevice === 'phone/AP');
    expect(drops.length).toBeGreaterThan(0);
    for (const c of drops) {
      expect(c.type).toBe('cat6a');
      expect(c.lengthMeters).toBe(10);
    }
  });
});

describe('generateCableSchedule — invariants', () => {
  it('pure function: identical inputs produce identical outputs', () => {
    const a = generateCableSchedule(portMaps, 'two_tier_collapsed_core');
    const b = generateCableSchedule(portMaps, 'two_tier_collapsed_core');
    expect(a).toEqual(b);
  });

  it('signal cables emitted before power cables', () => {
    const cables = generateCableSchedule(portMaps, 'two_tier_collapsed_core');
    const firstPower = cables.findIndex((c) => c.type === 'power');
    const lastSignal = cables.map((c) => c.type !== 'power').lastIndexOf(true);
    expect(firstPower).toBeGreaterThan(lastSignal);
  });
});
