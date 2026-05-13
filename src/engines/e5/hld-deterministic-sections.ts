/**
 * E5 — Deterministic HLD section builders.
 *
 * Templates + fallbacks used by hld-narrative-generator.ts. Pure functions.
 * Source: Playbook §3.6 (12-section HLD outline) and §3.2 (7 design
 * principles). No I/O, no AI calls.
 */
import type {
  HLDSection,
  SizingResult,
  TopologyPattern,
} from '@/engines/e5/types';

export const TOPOLOGY_DISPLAY: Record<TopologyPattern, string> = {
  two_tier_collapsed_core: 'Two-Tier Collapsed Core',
  three_tier_core_dist_access: 'Three-Tier Core-Distribution-Access',
  fat_tree_superpod: 'Fat-Tree SuperPOD',
  slingshot_dragonfly: 'Slingshot Dragonfly',
  hub_and_spoke_gpon: 'Hub-and-Spoke GPON',
  ot_it_segmented: 'OT/IT Segmented',
};

export const DESIGN_PRINCIPLES = [
  'hierarchical',
  'modular',
  'resilient',
  'scalable',
  'secure-by-design',
  'manageable',
  'cost-optimized',
];

function deviceSummaryLines(sizing: SizingResult): string {
  const groups: Array<[string, SizingResult[keyof SizingResult]]> = [
    ['Core', sizing.coreDevices],
    ['Distribution', sizing.distributionDevices],
    ['Access', sizing.accessDevices],
    ['Firewall', sizing.firewalls],
    ['Wireless Controller', sizing.wirelessControllers],
    ['Access Point', sizing.accessPoints],
  ];
  const lines: string[] = [];
  for (const [role, devs] of groups) {
    for (const d of devs) lines.push(`- ${role}: ${d.quantity}× ${d.model} (${d.vendor})`);
  }
  return lines.length ? lines.join('\n') : '- (no devices sized)';
}

function totalPortBudget(sizing: SizingResult): number {
  const all = [
    ...sizing.coreDevices, ...sizing.distributionDevices, ...sizing.accessDevices,
  ];
  return all.reduce((s, d) => s + d.quantity, 0);
}

export function documentControlSection(customerName: string): HLDSection {
  const today = new Date().toISOString().slice(0, 10);
  return {
    sectionNumber: 1,
    title: 'Document Control',
    content:
      `Customer: ${customerName}\n` +
      `Document: High-Level Design (HLD)\n` +
      `Version: 1.0\nDate: ${today}\n` +
      `Author: <pre-sales engineer>\nReviewer: <design authority>\n` +
      `Distribution: customer technical stakeholders, internal delivery team.`,
  };
}

export function scopeSection(projectType: string, vendor: string): HLDSection {
  return {
    sectionNumber: 3,
    title: 'Scope, Assumptions, Exclusions, Constraints',
    content:
      `Scope: design of a ${vendor} network for a ${projectType} engagement.\n\n` +
      `Assumptions:\n` +
      `- Customer-provided power, cooling, and rack space meet vendor specs.\n` +
      `- WAN circuits and IP addressing are available prior to cutover.\n` +
      `- Existing cabling plant is reusable unless explicitly noted.\n\n` +
      `Exclusions:\n` +
      `- End-user device procurement and configuration.\n` +
      `- Application-layer integration beyond network reachability.\n` +
      `- Long-haul transmission outside the customer premises.\n\n` +
      `Constraints: vendor lead times, maintenance windows, regulatory compliance.`,
  };
}

export function currentStateSection(): HLDSection {
  return {
    sectionNumber: 4,
    title: 'Current-State Summary',
    content:
      'Reference: see Site Survey deliverable for the as-is environment.\n' +
      'Engineer-fill: device inventory, link map, known issues, dependencies.',
  };
}

export function resilienceSection(topology: TopologyPattern): HLDSection {
  const isThreeTier = topology === 'three_tier_core_dist_access';
  const isHPC = topology === 'fat_tree_superpod' || topology === 'slingshot_dragonfly';
  const body = isHPC
    ? 'HPC fabric: non-blocking multi-rail topology, ECMP across spines, hot-swap PSU/fan, BFD on fabric links.'
    : isThreeTier
      ? 'Redundant core pair (StackWise Virtual / VPC), dual-homed distribution, dual uplinks per access switch, HA firewall pair, sub-second convergence target.'
      : 'Collapsed-core HA pair with redundant power and uplinks, HA firewall pair, sub-second convergence target.';
  return {
    sectionNumber: 7,
    title: 'Resilience & High-Availability Design',
    content: `${body}\nNo single point of failure on the data, control, or management plane.`,
  };
}

export function capacitySection(sizing: SizingResult, portCount: number, bandwidthGbps: number): HLDSection {
  const totalDevices = totalPortBudget(sizing);
  return {
    sectionNumber: 8,
    title: 'Capacity & Scalability Analysis',
    content:
      `Sized for ${portCount} ports and ${bandwidthGbps} Gbps aggregate.\n` +
      `Total network devices: ${totalDevices}.\n` +
      `Headroom: minimum 30% spare ports at access, 50% spare uplink bandwidth.\n` +
      `Scale-out path: add access stack members or distribution pairs without forklift.\n\n` +
      `Device summary:\n${deviceSummaryLines(sizing)}`,
  };
}

export function migrationPlaceholderSection(): HLDSection {
  return {
    sectionNumber: 10,
    title: 'Migration Approach',
    content: 'See LLD §19 cutover/runbook for detailed phases. Method, risk, and reasoning populated from selectMigrationApproach().',
  };
}

export function risksSection(): HLDSection {
  return {
    sectionNumber: 11,
    title: 'Risks & Mitigations',
    content:
      '1. Vendor lead time — mitigation: place PO ≥8 weeks before cutover.\n' +
      '2. Scope creep — mitigation: change control via signed CRs.\n' +
      '3. Integration with legacy systems — mitigation: pre-cutover compatibility test.\n' +
      '4. Skills gap on new platform — mitigation: vendor-led knowledge transfer and runbooks.\n' +
      '5. Timeline slip — mitigation: phased rollback plan per LLD §19.',
  };
}

export function appendicesSection(sizing: SizingResult): HLDSection {
  return {
    sectionNumber: 12,
    title: 'Appendices',
    content:
      'A. IP Plan Summary — see LLD §6 for detailed plan.\n' +
      `B. Product Summary:\n${deviceSummaryLines(sizing)}\n` +
      'C. Glossary — see Playbook §10.',
  };
}

export function executiveFallback(topology: TopologyPattern, vendor: string, customerName: string): string {
  return (
    `Executive summary: ${customerName} engagement adopts a ${TOPOLOGY_DISPLAY[topology]} ` +
    `architecture on ${vendor} platforms. The design satisfies resilience, scalability, ` +
    `and secure-by-design requirements while minimising total cost of ownership.`
  );
}

export function requirementsFallback(sizing: SizingResult): string {
  return (
    'Solution requirements (auto-generated):\n' +
    `- Port capacity: ${totalPortBudget(sizing)} access/dist/core devices.\n` +
    '- Resilient HA pair at core and firewall layers.\n' +
    '- Standards-based segmentation (VLAN/VRF).\n' +
    '- Centralised management plane (NTP, syslog, SNMP, AAA).'
  );
}

export function architectureFallback(topology: TopologyPattern, vendor: string): string {
  return (
    `Architecture: ${TOPOLOGY_DISPLAY[topology]} on ${vendor}. ` +
    'Aligns with design principles: hierarchical, modular, resilient, scalable, ' +
    'secure-by-design, manageable, cost-optimized. Module designs are described in LLD §3–§7.'
  );
}

export function securityFallback(vendor: string): string {
  const product = vendor === 'fortinet' ? 'FortiGate' : 'Cisco Firepower / Secure Firewall';
  return (
    `Security architecture: zoned design (user, server, DMZ, management, guest, OT). ` +
    `${product} enforces inter-zone policy with IPS, URL filtering, and TLS inspection. ` +
    'Compliance mapping: NCA / SAMA / NESA / PCI / ISO 27001 controls referenced in LLD §11.'
  );
}
