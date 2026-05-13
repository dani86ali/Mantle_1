import { describe, it, expect } from 'vitest';
import {
  SizingInputSchema,
  DesignApproachSchema,
  TopologyPatternSchema,
  DesignFrameworkSchema,
  type TopologyPattern,
  type DesignFramework,
  type DesignApproach,
  type SizingInput,
  type SizingResult,
  type IPVlanPlan,
  type PortMap,
  type CableScheduleEntry,
  type QoSPolicy,
  type MigrationApproach,
  type RackElevation,
  type HLDSection,
  type LLDSection,
  type ComponentListItem,
  type E5Config,
} from '@/engines/e5/types';

describe('TopologyPattern enum (Design_Patterns.md §6.2)', () => {
  it('has exactly the 6 valid patterns', () => {
    const values: TopologyPattern[] = [
      'two_tier_collapsed_core',
      'three_tier_core_dist_access',
      'fat_tree_superpod',
      'slingshot_dragonfly',
      'hub_and_spoke_gpon',
      'ot_it_segmented',
    ];
    expect(values).toHaveLength(6);
    expect(new Set(values).size).toBe(6);
  });

  it('Zod schema accepts every valid pattern', () => {
    for (const p of [
      'two_tier_collapsed_core',
      'three_tier_core_dist_access',
      'fat_tree_superpod',
      'slingshot_dragonfly',
      'hub_and_spoke_gpon',
      'ot_it_segmented',
    ]) {
      expect(TopologyPatternSchema.parse(p)).toBe(p);
    }
  });

  it('Zod schema rejects an unknown pattern', () => {
    expect(() => TopologyPatternSchema.parse('mesh')).toThrow();
  });
});

describe('DesignFramework enum (Playbook §3.1)', () => {
  it('has exactly 5 frameworks', () => {
    const fws: DesignFramework[] = [
      'ppdioo', 'togaf_adm', 'cisco_safe', 'nist_sp800_207', 'itil_v4',
    ];
    expect(fws).toHaveLength(5);
    expect(new Set(fws).size).toBe(5);
  });

  it('Zod schema rejects unknown framework', () => {
    expect(() => DesignFrameworkSchema.parse('zachman')).toThrow();
  });
});

describe('SizingInputSchema', () => {
  it('accepts a minimal valid payload', () => {
    const valid: SizingInput = {
      userCount: 100, portCount: 200, bandwidthGbps: 10, siteCount: 1,
    };
    expect(SizingInputSchema.parse(valid)).toEqual(valid);
  });

  it('accepts the full payload with optional flags', () => {
    const full: SizingInput = {
      userCount: 5000, portCount: 8000, bandwidthGbps: 100, siteCount: 12,
      idfRoomsPerFloor: 4, hasOT: true, hasWireless: true, hasDC: true,
    };
    expect(SizingInputSchema.parse(full)).toEqual(full);
  });

  it('rejects negative counts', () => {
    expect(() => SizingInputSchema.parse({
      userCount: -1, portCount: 0, bandwidthGbps: 0, siteCount: 0,
    })).toThrow();
  });

  it('rejects non-integer userCount', () => {
    expect(() => SizingInputSchema.parse({
      userCount: 1.5, portCount: 0, bandwidthGbps: 0, siteCount: 0,
    })).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => SizingInputSchema.parse({ userCount: 1 })).toThrow();
  });
});

describe('DesignApproachSchema', () => {
  it('accepts a fully populated approach', () => {
    const a: DesignApproach = {
      methodology: 'ppdioo',
      approach: 'top_down',
      frameworks: ['ppdioo', 'cisco_safe'],
      topologyPattern: 'three_tier_core_dist_access',
      vendor: 'cisco',
      projectType: 'greenfield_campus',
    };
    expect(DesignApproachSchema.parse(a)).toEqual(a);
  });

  it('accepts null topologyPattern (filled later)', () => {
    const a: DesignApproach = {
      methodology: 'ppdioo',
      approach: 'hybrid',
      frameworks: ['ppdioo'],
      topologyPattern: null,
      vendor: 'fortinet',
      projectType: 'general',
    };
    expect(DesignApproachSchema.parse(a)).toEqual(a);
  });

  it('rejects empty frameworks list', () => {
    expect(() => DesignApproachSchema.parse({
      methodology: 'ppdioo', approach: 'top_down', frameworks: [],
      topologyPattern: null, vendor: 'cisco', projectType: 'x',
    })).toThrow();
  });

  it('rejects unknown vendor', () => {
    expect(() => DesignApproachSchema.parse({
      methodology: 'ppdioo', approach: 'top_down', frameworks: ['ppdioo'],
      topologyPattern: null, vendor: 'huawei', projectType: 'x',
    })).toThrow();
  });

  it('rejects non-PPDIOO methodology literal', () => {
    expect(() => DesignApproachSchema.parse({
      methodology: 'togaf', approach: 'top_down', frameworks: ['ppdioo'],
      topologyPattern: null, vendor: 'cisco', projectType: 'x',
    })).toThrow();
  });
});

describe('Type constructability', () => {
  it('constructs a SizingResult', () => {
    const r: SizingResult = {
      coreDevices: [], distributionDevices: [], accessDevices: [],
      firewalls: [], wirelessControllers: [], accessPoints: [],
    };
    expect(Object.keys(r)).toHaveLength(6);
  });

  it('constructs an IPVlanPlan', () => {
    const p: IPVlanPlan = { vlans: [], subnets: [], vrfs: [] };
    expect(p.vlans).toEqual([]);
  });

  it('constructs a PortMap with one port', () => {
    const pm: PortMap = {
      deviceId: 'sw-01', model: 'C9300-48',
      ports: [{
        portId: 'Gi1/0/1', type: 'access', connectedTo: 'pc-12',
        vlan: 10, speed: '1G', description: 'user',
      }],
    };
    expect(pm.ports[0].vlan).toBe(10);
  });

  it('constructs a CableScheduleEntry', () => {
    const c: CableScheduleEntry = {
      cableId: 'C-001', type: 'fiber_sm', fromDevice: 'sw-01',
      fromPort: 'Te1/1/1', toDevice: 'sw-02', toPort: 'Te1/1/1',
      lengthMeters: 25, label: 'core uplink',
    };
    expect(c.type).toBe('fiber_sm');
  });

  it('constructs a QoSPolicy', () => {
    const q: QoSPolicy = {
      vendor: 'cisco', markingPolicy: 'dscp', queuingPolicy: 'pq-cbwfq',
      classes: [{
        name: 'voice', dscp: 46, bandwidthPercent: 10,
        priority: true, description: 'EF',
      }],
    };
    expect(q.classes[0].dscp).toBe(46);
  });

  it('constructs a MigrationApproach', () => {
    const m: MigrationApproach = {
      method: 'phased', riskLevel: 'medium',
      reasoning: 'multi-site, no maintenance window',
      phases: [{
        name: 'parallel-build', description: 'stand up new fabric',
        durationDays: 30, rollbackPlan: 'keep legacy live',
      }],
    };
    expect(m.phases).toHaveLength(1);
  });

  it('constructs a RackElevation', () => {
    const r: RackElevation = {
      rackId: 'R-A1', totalU: 42,
      devices: [{
        deviceModel: 'C9500-48Y4C', startU: 40,
        heightU: 1, side: 'front', label: 'core-1',
      }],
    };
    expect(r.devices[0].startU).toBe(40);
  });

  it('constructs HLD/LLD sections with diagrams', () => {
    const h: HLDSection = {
      sectionNumber: 6, title: 'Solution architecture',
      content: '...', diagrams: ['logical.drawio'],
    };
    const l: LLDSection = {
      sectionNumber: 16, title: 'Cable schedule', content: '...',
    };
    expect(h.diagrams).toEqual(['logical.drawio']);
    expect(l.diagrams).toBeUndefined();
  });

  it('constructs a ComponentListItem', () => {
    const c: ComponentListItem = {
      model: 'C9300-48UXM', vendor: 'cisco', quantity: 4,
      role: 'access', fromDesignStep: 'sizing',
    };
    expect(c.quantity).toBe(4);
  });

  it('constructs an E5Config with literal section counts', () => {
    const c: E5Config = {
      maxRevisions: 2, vendor: 'cisco',
      hldSectionCount: 12, lldSectionCount: 21,
    };
    expect(c.hldSectionCount).toBe(12);
    expect(c.lldSectionCount).toBe(21);
  });
});
