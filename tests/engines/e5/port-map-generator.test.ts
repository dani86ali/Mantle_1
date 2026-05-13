import { describe, it, expect } from 'vitest';
import { generatePortMaps } from '@/engines/e5/port-map-generator';
import { planIPVlans } from '@/engines/e5/ip-vlan-planner';
import {
  CISCO_ACCESS_SWITCHES,
  CISCO_CORE_SWITCHES,
} from '@/engines/e5/device-specs';
import type { SizingResult, VlanEntry } from '@/engines/e5/types';

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

const dataVlanId = vlans.find((v) => v.name === 'Data')!.id;
const voiceVlanId = vlans.find((v) => v.name === 'Voice')!.id;

function buildSizing(overrides: Partial<SizingResult> = {}): SizingResult {
  return {
    coreDevices: [{ role: 'core', model: 'C9500-24Y4C', vendor: 'cisco', quantity: 2, reasoning: '' }],
    distributionDevices: [],
    accessDevices: [{ role: 'access', model: 'C9300-48P', vendor: 'cisco', quantity: 1, reasoning: '' }],
    firewalls: [{ role: 'firewall', model: 'FG-81F', vendor: 'fortinet', quantity: 2, reasoning: '' }],
    wirelessControllers: [],
    accessPoints: [],
    ...overrides,
  };
}

describe('generatePortMaps — access switch', () => {
  const maps = generatePortMaps(buildSizing(), vlans);
  const access = maps.find((m) => m.model === 'C9300-48P')!;

  it('total port count matches device-specs lookup (C9300-48P → 48 ports)', () => {
    const spec = CISCO_ACCESS_SWITCHES.find((s) => s.model === 'C9300-48P')!;
    expect(access.ports).toHaveLength(spec.ports);
    expect(access.ports).toHaveLength(48);
  });

  it('last 2 ports are trunk uplinks to core', () => {
    expect(access.ports[46].type).toBe('trunk');
    expect(access.ports[47].type).toBe('trunk');
    expect(access.ports[46].connectedTo).toBe('core/distribution');
  });

  it('middle 4 ports are trunk for voice/wireless when those VLANs exist', () => {
    // total=48, uplinks=2, middle=4 → access = 42, trunk middle ports = 43..46
    for (let p = 42; p <= 45; p++) {
      expect(access.ports[p].type).toBe('trunk');
      expect(access.ports[p].description).toContain(`${voiceVlanId}`);
    }
  });

  it('first 42 ports are access on the data VLAN', () => {
    for (let p = 0; p < 42; p++) {
      expect(access.ports[p].type).toBe('access');
      expect(access.ports[p].vlan).toBe(dataVlanId);
    }
  });

  it('port naming follows Cisco Gi1/0/N for 1G access switch', () => {
    expect(access.ports[0].portId).toBe('Gi1/0/1');
    expect(access.ports[47].portId).toBe('Gi1/0/48');
  });
});

describe('generatePortMaps — core switch', () => {
  const maps = generatePortMaps(buildSizing(), vlans);
  const cores = maps.filter((m) => m.model === 'C9500-24Y4C');

  it('one PortMap per physical device (quantity expanded)', () => {
    expect(cores).toHaveLength(2);
    expect(cores[0].deviceId).toBe('core-C9500-24Y4C-1');
    expect(cores[1].deviceId).toBe('core-C9500-24Y4C-2');
  });

  it('total ports match device-specs (24 ports)', () => {
    const spec = CISCO_CORE_SWITCHES.find((s) => s.model === 'C9500-24Y4C')!;
    expect(cores[0].ports).toHaveLength(spec.ports);
    expect(cores[0].ports).toHaveLength(24);
  });

  it('ports are exclusively routed or trunk (no access, no unused)', () => {
    for (const p of cores[0].ports) {
      expect(['routed', 'trunk']).toContain(p.type);
    }
  });

  it('first two ports are trunks to firewall pair, rest routed', () => {
    expect(cores[0].ports[0].type).toBe('trunk');
    expect(cores[0].ports[0].connectedTo).toBe('firewall-1');
    expect(cores[0].ports[1].connectedTo).toBe('firewall-2');
    expect(cores[0].ports[2].type).toBe('routed');
  });

  it('25G core uses Tw prefix per Cisco convention', () => {
    expect(cores[0].ports[0].portId).toBe('Tw1/0/1');
    expect(cores[0].ports[0].speed).toBe('25G');
  });
});

describe('generatePortMaps — firewall zones', () => {
  const maps = generatePortMaps(buildSizing(), vlans);
  const fws = maps.filter((m) => m.model === 'FG-81F');

  it('expanded per quantity (2 firewalls → 2 maps)', () => {
    expect(fws).toHaveLength(2);
  });

  it('first 4 ports assigned to outside/inside/dmz/management', () => {
    const zones = fws[0].ports.slice(0, 4).map((p) => p.connectedTo);
    expect(zones).toEqual(['outside', 'inside', 'dmz', 'management']);
  });

  it('inside port is trunk, others are routed', () => {
    expect(fws[0].ports[0].type).toBe('routed'); // outside
    expect(fws[0].ports[1].type).toBe('trunk');  // inside
    expect(fws[0].ports[2].type).toBe('routed'); // dmz
    expect(fws[0].ports[3].type).toBe('routed'); // management
  });

  it('remaining ports (5–8) are marked unused', () => {
    for (let p = 4; p < 8; p++) {
      expect(fws[0].ports[p].type).toBe('unused');
      expect(fws[0].ports[p].connectedTo).toBe('');
    }
  });
});

describe('generatePortMaps — naming convention by speed', () => {
  it('100G core uses Hu prefix', () => {
    const maps = generatePortMaps(
      buildSizing({
        coreDevices: [{ role: 'core', model: 'C9500-32C', vendor: 'cisco', quantity: 1, reasoning: '' }],
      }),
      vlans,
    );
    const core = maps.find((m) => m.model === 'C9500-32C')!;
    expect(core.ports[0].portId).toBe('Hu1/0/1');
    expect(core.ports[0].speed).toBe('100G');
  });

  it('1G access switch uses Gi prefix', () => {
    const maps = generatePortMaps(buildSizing(), vlans);
    const access = maps.find((m) => m.model === 'C9300-48P')!;
    expect(access.ports[0].portId).toMatch(/^Gi/);
    expect(access.ports[0].speed).toBe('1G');
  });
});

describe('generatePortMaps — invariants', () => {
  it('skips devices whose model is not in lookup tables', () => {
    const maps = generatePortMaps(
      buildSizing({
        accessDevices: [{ role: 'access', model: 'UNKNOWN-MODEL', vendor: 'cisco', quantity: 1, reasoning: '' }],
      }),
      vlans,
    );
    expect(maps.find((m) => m.model === 'UNKNOWN-MODEL')).toBeUndefined();
  });

  it('access-only VLAN list (no voice/wireless) → all non-uplink ports become access', () => {
    const dataOnlyVlans = planIPVlans({
      siteCount: 1,
      topology: 'two_tier_collapsed_core',
      hasWireless: false, hasVoice: false, hasOT: false, hasDC: false, hasGuest: false,
      vrfEnabled: false,
    }).vlans;
    const maps = generatePortMaps(buildSizing(), dataOnlyVlans);
    const access = maps.find((m) => m.model === 'C9300-48P')!;
    // ports 1..46 access, 47..48 uplinks
    expect(access.ports[0].type).toBe('access');
    expect(access.ports[45].type).toBe('access');
    expect(access.ports[46].type).toBe('trunk');
  });

  it('pure function — identical inputs produce identical outputs', () => {
    const a = generatePortMaps(buildSizing(), vlans);
    const b = generatePortMaps(buildSizing(), vlans);
    expect(a).toEqual(b);
  });
});
