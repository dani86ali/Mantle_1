import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({ callAI: vi.fn() }));

import { callAI } from '@/lib/ai/client';
import {
  generateLLDNarrative,
  type LLDNarrativeInput,
} from '@/engines/e5/lld-narrative-generator';
import type {
  CableScheduleEntry, IPVlanPlan, MigrationApproach, QoSPolicy,
  RackElevation, SizingResult,
} from '@/engines/e5/types';

const mockCallAI = vi.mocked(callAI);

const sizing: SizingResult = {
  coreDevices: [{ role: 'core', model: 'C9500-48Y4C', vendor: 'cisco', quantity: 2, reasoning: '' }],
  distributionDevices: [],
  accessDevices: [{ role: 'access', model: 'C9300-48P', vendor: 'cisco', quantity: 6, reasoning: '' }],
  firewalls: [{ role: 'firewall', model: 'FPR-2110', vendor: 'cisco', quantity: 2, reasoning: '' }],
  wirelessControllers: [],
  accessPoints: [],
};

const ipVlanPlan: IPVlanPlan = {
  vlans: [
    { id: 10, name: 'MGMT', subnet: '10.0.10.0/24', gateway: '10.0.10.1', purpose: 'Management', vrf: 'MGMT' },
    { id: 20, name: 'DATA', subnet: '10.0.20.0/24', gateway: '10.0.20.1', purpose: 'User data', vrf: 'CORP' },
  ],
  subnets: [
    { cidr: '10.0.10.0/24', gateway: '10.0.10.1', usableHosts: 254, assignedTo: 'VLAN10 MGMT' },
    { cidr: '10.0.20.0/24', gateway: '10.0.20.1', usableHosts: 254, assignedTo: 'VLAN20 DATA' },
  ],
  vrfs: [
    { name: 'MGMT', routeDistinguisher: '65000:1', routeTargets: ['65000:1'], vlans: [10] },
    { name: 'CORP', routeDistinguisher: '65000:2', routeTargets: ['65000:2'], vlans: [20] },
  ],
};

const qosPolicy: QoSPolicy = {
  vendor: 'cisco',
  classes: [
    { name: 'Voice', dscp: 46, bandwidthPercent: 10, priority: true, description: 'EF — RTP voice' },
    { name: 'Best Effort', dscp: 0, bandwidthPercent: 90, priority: false, description: 'Default' },
  ],
  markingPolicy: 'trust dscp',
  queuingPolicy: 'CBWFQ + LLQ',
};

const migration: MigrationApproach = {
  method: 'cutover',
  riskLevel: 'low',
  phases: [
    { name: 'Staging', description: 'Pre-build new gear', durationDays: 5, rollbackPlan: 'Isolated.' },
    { name: 'Go-Live', description: 'Cutover', durationDays: 1, rollbackPlan: 'Reschedule.' },
  ],
  reasoning: 'Greenfield single staged cutover.',
};

const cableSchedule: CableScheduleEntry[] = [
  {
    cableId: 'CBL-001', type: 'fiber_mm',
    fromDevice: 'access-1', fromPort: 'Gi1/49',
    toDevice: 'core-1', toPort: '?',
    lengthMeters: 30, label: 'access-1:Gi1/49 <-> core-1:?',
  },
];

const rackElevations: RackElevation[] = [
  {
    rackId: 'MDF-R1', totalU: 42,
    devices: [{ deviceModel: 'C9500-48Y4C', startU: 40, heightU: 1, side: 'front', label: 'C9500-48Y4C (core#1)' }],
  },
];

const baseInput: LLDNarrativeInput = {
  topology: 'two_tier_collapsed_core',
  sizing,
  vendor: 'cisco',
  ipVlanPlan,
  qosPolicy,
  migrationApproach: migration,
  cableSchedule,
  rackElevations,
  customerName: 'Acme Corp',
  siteCount: 1,
};

function aiOk(content: string): Awaited<ReturnType<typeof callAI>> {
  return { success: true, data: { content }, tokensUsed: 100, latencyMs: 50 } as never;
}
function aiFail(): Awaited<ReturnType<typeof callAI>> {
  return { success: false, error: 'mock failure', retryCount: 1, fallback: 'engineer_review' } as never;
}

beforeEach(() => { mockCallAI.mockReset(); });

describe('generateLLDNarrative', () => {
  it('returns all 21 sections sorted by sectionNumber', async () => {
    mockCallAI.mockResolvedValue(aiOk('OSPF single-area routing on Cisco platform. '.repeat(3)));
    const sections = await generateLLDNarrative(baseInput);
    expect(sections).toHaveLength(21);
    expect(sections.map((s) => s.sectionNumber))
      .toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]);
  });

  it('IP/VLAN sections render data from IPVlanPlan', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative(baseInput);
    const ipSec = sections.find((s) => s.sectionNumber === 6)!;
    const vlanSec = sections.find((s) => s.sectionNumber === 7)!;
    expect(ipSec.content).toContain('10.0.10.0/24');
    expect(ipSec.content).toContain('10.0.20.0/24');
    expect(vlanSec.content).toContain('MGMT');
    expect(vlanSec.content).toContain('CORP');
    expect(vlanSec.content).toContain('65000:1');
  });

  it('QoS section renders policy classes', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative(baseInput);
    const qos = sections.find((s) => s.sectionNumber === 10)!;
    expect(qos.content).toContain('Voice');
    expect(qos.content).toContain('46');
    expect(qos.content).toContain('CBWFQ + LLQ');
  });

  it('Device inventory renders SizingResult', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative(baseInput);
    const dev = sections.find((s) => s.sectionNumber === 5)!;
    expect(dev.content).toContain('C9500-48Y4C');
    expect(dev.content).toContain('C9300-48P');
    expect(dev.content).toContain('FPR-2110');
  });

  it('AI failure → routing and security sections have fallback content', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative(baseInput);
    const routing = sections.find((s) => s.sectionNumber === 8)!;
    const sec = sections.find((s) => s.sectionNumber === 11)!;
    expect(routing.content).toMatch(/OSPF|BGP|IS-IS/);
    expect(sec.content.toLowerCase()).toContain('firepower');
  });

  it('routing post-gate: AI without protocol → fallback used', async () => {
    mockCallAI.mockImplementation(async (cfg) => {
      if (cfg.taskId === 'lld-narrative:section-8') {
        return aiOk('Routing is performed using a hierarchical scheme without naming any protocol. '.repeat(2));
      }
      return aiOk('FortiGate enforces zone-based policy. '.repeat(3));
    });
    const sections = await generateLLDNarrative(baseInput);
    const routing = sections.find((s) => s.sectionNumber === 8)!;
    expect(routing.content).toMatch(/OSPF/);
  });

  it('security post-gate: AI without vendor product → fallback used', async () => {
    mockCallAI.mockImplementation(async (cfg) => {
      if (cfg.taskId === 'lld-narrative:section-11') {
        return aiOk('Generic firewall rules enforce inter-zone deny-by-default without naming a vendor product. '.repeat(2));
      }
      return aiOk('OSPF single-area routing on the collapsed core. '.repeat(3));
    });
    const sections = await generateLLDNarrative(baseInput);
    const sec = sections.find((s) => s.sectionNumber === 11)!;
    expect(sec.content.toLowerCase()).toContain('firepower');
  });

  it('multicast "not applicable" for non-HPC topologies', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative(baseInput);
    const mc = sections.find((s) => s.sectionNumber === 9)!;
    expect(mc.content).toMatch(/not applicable/i);
  });

  it('multicast describes PIM-SM for fat_tree_superpod', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative({ ...baseInput, topology: 'fat_tree_superpod' });
    const mc = sections.find((s) => s.sectionNumber === 9)!;
    expect(mc.content).toMatch(/PIM-SM/);
  });

  it('cutover section renders migration phases', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative(baseInput);
    const cut = sections.find((s) => s.sectionNumber === 19)!;
    expect(cut.content).toContain('Staging');
    expect(cut.content).toContain('Go-Live');
    expect(cut.content).toContain('cutover');
  });

  it('cable schedule section renders entries when present', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative(baseInput);
    const cable = sections.find((s) => s.sectionNumber === 16)!;
    expect(cable.content).toContain('CBL-001');
    expect(cable.content).toContain('access-1');
    expect(cable.content).toContain('fiber_mm');
    expect(cable.content).not.toMatch(/generateCableSchedule/);
  });

  it('cable schedule falls back to survey message when empty', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative({ ...baseInput, cableSchedule: [] });
    const cable = sections.find((s) => s.sectionNumber === 16)!;
    expect(cable.content).toMatch(/site survey/i);
  });

  it('rack elevations section renders racks and devices when present', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative(baseInput);
    const racks = sections.find((s) => s.sectionNumber === 17)!;
    expect(racks.content).toContain('MDF-R1');
    expect(racks.content).toContain('C9500-48Y4C');
    expect(racks.content).not.toMatch(/generateRackElevation/);
  });

  it('rack elevations falls back to survey message when empty', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative({ ...baseInput, rackElevations: [] });
    const racks = sections.find((s) => s.sectionNumber === 17)!;
    expect(racks.content).toMatch(/site survey/i);
  });

  it('fortinet vendor: security fallback names FortiGate', async () => {
    mockCallAI.mockResolvedValue(aiFail());
    const sections = await generateLLDNarrative({ ...baseInput, vendor: 'fortinet' });
    const sec = sections.find((s) => s.sectionNumber === 11)!;
    expect(sec.content).toContain('FortiGate');
  });
});
