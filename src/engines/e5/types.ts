/**
 * E5 — Design Engine type definitions.
 * Mirrors Playbook §3.1–3.7 (PPDIOO methodology + HLD/LLD outlines)
 * and Design_Patterns.md §6 (methodology decision tree, 6 topology patterns).
 */
import { z } from 'zod';

/** Six valid topology patterns from Design_Patterns.md §6.2. */
export type TopologyPattern =
  | 'two_tier_collapsed_core'
  | 'three_tier_core_dist_access'
  | 'fat_tree_superpod'
  | 'slingshot_dragonfly'
  | 'hub_and_spoke_gpon'
  | 'ot_it_segmented';

/** Architecture/security frameworks cited in Playbook §3.1. */
export type DesignFramework =
  | 'ppdioo'
  | 'togaf_adm'
  | 'cisco_safe'
  | 'nist_sp800_207'
  | 'itil_v4';

export interface DesignApproach {
  methodology: 'ppdioo';
  approach: 'top_down' | 'bottom_up' | 'hybrid';
  frameworks: DesignFramework[];
  topologyPattern: TopologyPattern | null;
  vendor: 'cisco' | 'fortinet';
  projectType: string;
}
export interface SizingInput {
  userCount: number;
  portCount: number;
  bandwidthGbps: number;
  siteCount: number;
  idfRoomsPerFloor?: number;
  hasOT?: boolean;
  hasWireless?: boolean;
  hasDC?: boolean;
}
export interface DeviceSelection {
  role: string;
  model: string;
  vendor: string;
  quantity: number;
  reasoning: string;
}
export interface SizingResult {
  coreDevices: DeviceSelection[];
  distributionDevices: DeviceSelection[];
  accessDevices: DeviceSelection[];
  firewalls: DeviceSelection[];
  wirelessControllers: DeviceSelection[];
  accessPoints: DeviceSelection[];
}
export interface VlanEntry {
  id: number;
  name: string;
  subnet: string;
  gateway: string;
  purpose: string;
  vrf?: string;
}
export interface SubnetEntry {
  cidr: string;
  gateway: string;
  usableHosts: number;
  assignedTo: string;
}
export interface VrfEntry {
  name: string;
  routeDistinguisher: string;
  routeTargets: string[];
  vlans: number[];
}
export interface IPVlanPlan {
  vlans: VlanEntry[];
  subnets: SubnetEntry[];
  vrfs: VrfEntry[];
}
export interface PortAssignment {
  portId: string;
  type: 'access' | 'trunk' | 'routed' | 'unused';
  connectedTo: string;
  vlan?: number;
  speed: string;
  description: string;
}
export interface PortMap {
  deviceId: string;
  model: string;
  ports: PortAssignment[];
}
export interface CableScheduleEntry {
  cableId: string;
  type: 'fiber_sm' | 'fiber_mm' | 'cat6a' | 'cat6' | 'dac' | 'power';
  fromDevice: string;
  fromPort: string;
  toDevice: string;
  toPort: string;
  lengthMeters: number;
  label: string;
}
export interface QoSClass {
  name: string;
  dscp: number;
  bandwidthPercent: number;
  priority: boolean;
  description: string;
}
export interface QoSPolicy {
  vendor: string;
  classes: QoSClass[];
  markingPolicy: string;
  queuingPolicy: string;
}
export interface MigrationPhase {
  name: string;
  description: string;
  durationDays: number;
  rollbackPlan: string;
}
export interface MigrationApproach {
  method: 'cutover' | 'parallel_run' | 'phased';
  phases: MigrationPhase[];
  riskLevel: 'low' | 'medium' | 'high';
  reasoning: string;
}
export interface RackDevice {
  deviceModel: string;
  startU: number;
  heightU: number;
  side: 'front' | 'rear';
  label: string;
}
export interface RackElevation {
  rackId: string;
  totalU: number;
  devices: RackDevice[];
}
export interface HLDSection {
  sectionNumber: number;
  title: string;
  content: string;
  diagrams?: string[];
}
export interface LLDSection {
  sectionNumber: number;
  title: string;
  content: string;
  diagrams?: string[];
}
export interface ComponentListItem {
  model: string;
  vendor: string;
  quantity: number;
  role: string;
  fromDesignStep: string;
}
export interface E5Config {
  maxRevisions: number;
  vendor: 'cisco' | 'fortinet';
  hldSectionCount: 12;
  lldSectionCount: 21;
}

// ─── Zod schemas (external-input boundaries) ─────────────────────────────
export const TopologyPatternSchema = z.enum([
  'two_tier_collapsed_core', 'three_tier_core_dist_access', 'fat_tree_superpod',
  'slingshot_dragonfly', 'hub_and_spoke_gpon', 'ot_it_segmented',
]);
export const DesignFrameworkSchema = z.enum([
  'ppdioo', 'togaf_adm', 'cisco_safe', 'nist_sp800_207', 'itil_v4',
]);
export const SizingInputSchema = z.object({
  userCount: z.number().int().nonnegative(),
  portCount: z.number().int().nonnegative(),
  bandwidthGbps: z.number().nonnegative(),
  siteCount: z.number().int().nonnegative(),
  idfRoomsPerFloor: z.number().int().nonnegative().optional(),
  hasOT: z.boolean().optional(),
  hasWireless: z.boolean().optional(),
  hasDC: z.boolean().optional(),
});
export const DesignApproachSchema = z.object({
  methodology: z.literal('ppdioo'),
  approach: z.enum(['top_down', 'bottom_up', 'hybrid']),
  frameworks: z.array(DesignFrameworkSchema).min(1),
  topologyPattern: TopologyPatternSchema.nullable(),
  vendor: z.enum(['cisco', 'fortinet']),
  projectType: z.string(),
});
