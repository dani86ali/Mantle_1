/**
 * E5 — Deterministic LLD section builders.
 *
 * Templates + AI fallbacks for lld-narrative-generator.ts. Pure functions.
 * Source: Playbook §3.7 (21-section LLD outline). No I/O, no AI calls.
 */
import type {
  IPVlanPlan, LLDSection, MigrationApproach, QoSPolicy, SizingResult, TopologyPattern,
} from '@/engines/e5/types';

const today = (): string => new Date().toISOString().slice(0, 10);

export function lldDocumentControl(customerName: string): LLDSection {
  return {
    sectionNumber: 1,
    title: 'Document Control',
    content:
      `Customer: ${customerName}\nDocument: Low-Level Design (LLD)\n` +
      `Version: 1.0\nDate: ${today()}\nAuthor: <pre-sales engineer>\n` +
      `Reviewer: <design authority>\nDistribution: delivery team.`,
  };
}

export function lldHldReference(): LLDSection {
  return { sectionNumber: 2, title: 'Reference to HLD',
    content: 'This LLD elaborates the architecture in HLD §6. Deviations documented in §21.' };
}

export function physicalTopology(): LLDSection {
  return { sectionNumber: 3, title: 'Detailed Physical Topology',
    content: 'Diagram placeholder: per-site, per-rack physical topology from diagram engine.' };
}

export function logicalTopology(): LLDSection {
  return { sectionNumber: 4, title: 'Detailed Logical Topology',
    content: 'Diagram placeholder: per-VRF, per-VLAN, per-fabric logical topology from diagram engine.' };
}

export function deviceInventory(sizing: SizingResult): LLDSection {
  const rows: string[] = ['Role | Vendor | Model | Qty'];
  const push = (role: string, list: SizingResult[keyof SizingResult]): void => {
    for (const d of list) rows.push(`${role} | ${d.vendor} | ${d.model} | ${d.quantity}`);
  };
  push('Core', sizing.coreDevices);
  push('Distribution', sizing.distributionDevices);
  push('Access', sizing.accessDevices);
  push('Firewall', sizing.firewalls);
  push('Wireless Controller', sizing.wirelessControllers);
  push('Access Point', sizing.accessPoints);
  return { sectionNumber: 5, title: 'Device Inventory', content: rows.join('\n') };
}

export function ipAddressingPlan(plan: IPVlanPlan): LLDSection {
  const rows = ['CIDR | Gateway | Usable Hosts | Assigned To'];
  for (const s of plan.subnets) rows.push(`${s.cidr} | ${s.gateway} | ${s.usableHosts} | ${s.assignedTo}`);
  return { sectionNumber: 6, title: 'IP Addressing Plan', content: rows.join('\n') };
}

export function vlanVrfDesign(plan: IPVlanPlan): LLDSection {
  const vlanRows = ['VLAN | Name | Subnet | Gateway | Purpose | VRF'];
  for (const v of plan.vlans) {
    vlanRows.push(`${v.id} | ${v.name} | ${v.subnet} | ${v.gateway} | ${v.purpose} | ${v.vrf ?? '-'}`);
  }
  const vrfRows = ['VRF | RD | Route Targets | VLANs'];
  for (const v of plan.vrfs) {
    vrfRows.push(`${v.name} | ${v.routeDistinguisher} | ${v.routeTargets.join(',')} | ${v.vlans.join(',')}`);
  }
  return { sectionNumber: 7, title: 'VLAN and VRF Design',
    content: `VLANs:\n${vlanRows.join('\n')}\n\nVRFs:\n${vrfRows.join('\n')}` };
}

export function multicastDesign(topology: TopologyPattern): LLDSection {
  const content = topology === 'fat_tree_superpod'
    ? 'Multicast: PIM-SM with anycast RP across spines; required for NCCL multicast collectives.'
    : 'Multicast: not applicable to this design.';
  return { sectionNumber: 9, title: 'Multicast Design', content };
}

export function qosDesign(policy: QoSPolicy): LLDSection {
  const rows = ['Class | DSCP | BW% | Priority | Description'];
  for (const c of policy.classes) {
    rows.push(`${c.name} | ${c.dscp} | ${c.bandwidthPercent} | ${c.priority ? 'yes' : 'no'} | ${c.description}`);
  }
  return { sectionNumber: 10, title: 'QoS Design',
    content: `Vendor: ${policy.vendor}\nMarking: ${policy.markingPolicy}\nQueuing: ${policy.queuingPolicy}\n\nClasses:\n${rows.join('\n')}` };
}

export function wirelessDesign(sizing: SizingResult): LLDSection {
  if (sizing.accessPoints.length === 0 && sizing.wirelessControllers.length === 0) {
    return { sectionNumber: 12, title: 'Wireless Design', content: 'Not in scope.' };
  }
  const wlc = sizing.wirelessControllers.map((d) => `${d.quantity}× ${d.model}`).join(', ') || 'embedded WLC';
  const aps = sizing.accessPoints.reduce((s, d) => s + d.quantity, 0);
  return { sectionNumber: 12, title: 'Wireless Design',
    content: `Controllers: ${wlc}\nAccess points: ${aps}\nSSID/VLAN map and RF plan: engineer-fill.` };
}

export function wanDesign(siteCount: number): LLDSection {
  const content = siteCount > 1
    ? `WAN/SD-WAN: ${siteCount}-site design; transport, app-aware steering, QoE targets per site profile.`
    : 'Not in scope (single-site deployment).';
  return { sectionNumber: 13, title: 'WAN/SD-WAN Policy', content };
}

export function managementPlane(): LLDSection {
  return { sectionNumber: 14, title: 'Management Plane',
    content:
      'NTP: 2 internal + 1 public stratum-1 backup.\n' +
      'Syslog: TLS-secured central collector, RFC 5424.\n' +
      'SNMPv3 AuthPriv only.\nNetFlow/IPFIX: 1:1000 access, 1:100 core.\n' +
      'AAA: TACACS+ primary, local fallback; per-role privilege.' };
}

export function baseConfigs(): LLDSection {
  return { sectionNumber: 15, title: 'Per-Device Base Configurations',
    content: 'Per-device base configs generated from Jinja templates (engineer-fill prior to staging).' };
}

export function cableSchedulePlaceholder(): LLDSection {
  return { sectionNumber: 16, title: 'Cable Schedule',
    content: 'Cable schedule populated from generateCableSchedule() output.' };
}

export function rackElevationsPlaceholder(): LLDSection {
  return { sectionNumber: 17, title: 'Rack Elevations',
    content: 'Rack elevations populated from generateRackElevation() output.' };
}

export function testPlan(): LLDSection {
  return { sectionNumber: 18, title: 'Test Plan',
    content:
      'Unit: per-device base-config validation.\nIntegration: link, routing adjacency, VLAN propagation.\n' +
      'UAT: end-user reachability against business apps.\nFailover: HA pair, uplink, firewall HA, power loss.' };
}

export function cutoverRunbook(migration: MigrationApproach): LLDSection {
  const phases = migration.phases.map((p, i) =>
    `Phase ${i + 1}: ${p.name} (${p.durationDays}d) — ${p.description}\n  Rollback: ${p.rollbackPlan}`,
  ).join('\n');
  return { sectionNumber: 19, title: 'Cutover/Runbook',
    content: `Method: ${migration.method} (risk: ${migration.riskLevel}).\nReasoning: ${migration.reasoning}\n\n${phases}` };
}

export function acceptanceCriteria(): LLDSection {
  return { sectionNumber: 20, title: 'Acceptance Criteria',
    content:
      '1. HA pairs converge sub-second on link/device failure.\n2. End-to-end reachability per VLAN matches the IP plan.\n' +
      '3. QoS markings preserved end-to-end.\n4. Management plane reachable via OOB.\n5. UAT scenarios pass with sign-off.' };
}

export function lldAppendices(): LLDSection {
  return { sectionNumber: 21, title: 'Appendices',
    content: 'Full configs, command outputs, and reference diagrams attached separately.' };
}

export function routingFallback(topology: TopologyPattern): string {
  if (topology === 'three_tier_core_dist_access') {
    return 'Routing design: OSPF multi-area (area 0 + per-distribution areas) with iBGP overlay for policy.';
  }
  if (topology === 'fat_tree_superpod') {
    return 'Routing design: eBGP per-leaf to spine ASNs; ECMP load-sharing; IS-IS as IGP for underlay loopbacks.';
  }
  return 'Routing design: OSPF single-area (area 0) across collapsed-core. Default route from firewall pair via OSPF.';
}

export function securityFallbackLLD(vendor: string): string {
  const product = vendor === 'fortinet' ? 'FortiGate (FortiOS)' : 'Cisco Secure Firewall / Firepower (FTD)';
  return `Security policy: zone-based ${product} ruleset. Inter-zone deny-by-default; ` +
    'NAC role-mapping to SGT/groups; IPS profile applied at perimeter; TLS inspection on outbound user zones.';
}
