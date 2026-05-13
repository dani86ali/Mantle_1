/**
 * E5 phase 2 — LLD generation through the e5-lld checkpoint.
 * Steps 9-17 per Runtime Architecture §4.5 (Playbook §3.7). The 14-16 inner
 * block re-runs on revision; max 3 revisions.
 */

import { planIPVlans } from '@/engines/e5/ip-vlan-planner';
import { generatePortMaps } from '@/engines/e5/port-map-generator';
import { generateCableSchedule } from '@/engines/e5/cable-schedule-generator';
import { generateQoSPolicy } from '@/engines/e5/qos-policy-generator';
import { selectMigrationApproach } from '@/engines/e5/migration-selector';
import { generateLLDNarrative } from '@/engines/e5/lld-narrative-generator';
import { generateLLDDocx } from '@/engines/e5/lld-docx-generator';
import { generateRackElevations } from '@/engines/e5/rack-elevation-generator';
import { validateCompatibility } from '@/engines/e5/compatibility-validator';
import { recordSkip, runStep, type E5StepLog } from './orchestrator-helpers';
import type { EngineInput } from '@/coordinator/types';
import type {
  CableScheduleEntry, CompatibilityResult, IPVlanPlan, LLDSection,
  MigrationApproach, PortMap, QoSPolicy, RackElevation, SizingResult,
  TopologyPattern,
} from '@/engines/e5/types';
import type { E5InputData } from './orchestrator-types';

const MAX_REVISIONS = 3;

export interface Phase2Result {
  ipVlanPlan: IPVlanPlan;
  portMaps: PortMap[];
  cableSchedule: CableScheduleEntry[];
  qosPolicy: QoSPolicy;
  migrationApproach: MigrationApproach;
  lldSections: LLDSection[];
  lldDocPath: string;
  rackElevations: RackElevation[];
  finalCompatibility: CompatibilityResult;
  lldRevisions: number;
}

const EMPTY_VLAN_PLAN: IPVlanPlan = { vlans: [], subnets: [], vrfs: [] };
const EMPTY_QOS: QoSPolicy = { vendor: 'cisco', classes: [], markingPolicy: '', queuingPolicy: '' };
const EMPTY_MIGRATION: MigrationApproach = {
  method: 'cutover', phases: [], riskLevel: 'low', reasoning: 'fallback',
};

function buildOutputPath(data: E5InputData): string {
  const safe = `${data.customerName}-${data.projectName}`.replace(/[^A-Za-z0-9_-]+/g, '_');
  return `./out/${safe}-lld.docx`;
}

async function runStepsFourteenFifteenSixteen(
  data: E5InputData,
  topology: TopologyPattern,
  sizing: SizingResult,
  ipVlanPlan: IPVlanPlan,
  qosPolicy: QoSPolicy,
  migrationApproach: MigrationApproach,
  logs: E5StepLog[],
  input: EngineInput,
  warnings: string[],
): Promise<{ sections: LLDSection[]; docPath: string; racks: RackElevation[] }> {
  const step14 = await runStep(14, 'generateLLDNarrative', () =>
    generateLLDNarrative({
      topology, sizing, vendor: data.vendor, ipVlanPlan, qosPolicy,
      migrationApproach, customerName: data.customerName, siteCount: data.siteCount,
    }), logs, input);
  const sections: LLDSection[] = step14.ok && step14.result ? step14.result : [];
  if (!step14.ok) warnings.push('Step 14 generateLLDNarrative failed; emitting empty LLD sections');

  const docPath = buildOutputPath(data);
  const step15 = await runStep(15, 'generateLLDDocx', () =>
    generateLLDDocx(sections, {
      customerName: data.customerName, projectName: data.projectName,
      version: '1.0', date: new Date().toISOString().slice(0, 10),
    }, docPath), logs, input);
  const resolvedDocPath: string = step15.ok && step15.result ? step15.result : '';
  if (!step15.ok) warnings.push('Step 15 generateLLDDocx failed; no LLD .docx produced');

  const step16 = await runStep(16, 'generateRackElevations', () =>
    generateRackElevations(sizing, topology), logs, input);
  const racks: RackElevation[] = step16.ok && step16.result ? step16.result : [];
  if (!step16.ok) warnings.push('Step 16 generateRackElevations failed; emitting empty rack list');

  return { sections, docPath: resolvedDocPath, racks };
}

export async function runPhase2(
  data: E5InputData,
  topology: TopologyPattern,
  sizing: SizingResult,
  logs: E5StepLog[],
  warnings: string[],
  input: EngineInput,
): Promise<Phase2Result> {
  // Step 9 — IP/VLAN plan.
  const step9 = await runStep(9, 'planIPVlans', () =>
    planIPVlans({
      baseSubnet: data.baseSubnet, siteCount: Math.max(1, data.siteCount), topology,
      hasWireless: !!data.hasWireless, hasVoice: !!data.hasVoice, hasOT: !!data.hasOT,
      hasDC: !!data.hasDC, hasGuest: !!data.hasGuest, vrfEnabled: !!data.vrfEnabled,
    }), logs, input);
  const ipVlanPlan: IPVlanPlan = step9.ok && step9.result ? step9.result : EMPTY_VLAN_PLAN;
  if (!step9.ok) warnings.push('Step 9 planIPVlans failed; using empty VLAN plan');

  // Step 10 — port maps.
  const step10 = await runStep(10, 'generatePortMaps', () =>
    generatePortMaps(sizing, ipVlanPlan.vlans), logs, input);
  const portMaps: PortMap[] = step10.ok && step10.result ? step10.result : [];
  if (!step10.ok) warnings.push('Step 10 generatePortMaps failed; emitting empty port maps');

  // Step 11 — cable schedule.
  const step11 = await runStep(11, 'generateCableSchedule', () =>
    generateCableSchedule(portMaps, topology), logs, input);
  const cableSchedule: CableScheduleEntry[] = step11.ok && step11.result ? step11.result : [];
  if (!step11.ok) warnings.push('Step 11 generateCableSchedule failed; emitting empty cable schedule');

  // Step 12 — QoS policy.
  const step12 = await runStep(12, 'generateQoSPolicy', () =>
    generateQoSPolicy(data.vendor, !!data.hasVoice, !!data.hasVideo), logs, input);
  const qosPolicy: QoSPolicy = step12.ok && step12.result ? step12.result : EMPTY_QOS;
  if (!step12.ok) warnings.push('Step 12 generateQoSPolicy failed; using empty QoS policy');

  // Step 13 — migration approach.
  const totalDevices =
    sizing.coreDevices.reduce((s, d) => s + d.quantity, 0) +
    sizing.distributionDevices.reduce((s, d) => s + d.quantity, 0) +
    sizing.accessDevices.reduce((s, d) => s + d.quantity, 0) +
    sizing.firewalls.reduce((s, d) => s + d.quantity, 0);
  const step13 = await runStep(13, 'selectMigrationApproach', () =>
    selectMigrationApproach({
      isGreenfield: !!data.isGreenfield, siteCount: data.siteCount,
      hasRedundancy: !!data.hasRedundancy,
      downTimeToleranceHours: data.downTimeToleranceHours ?? 0,
      deviceCount: totalDevices,
    }), logs, input);
  const migrationApproach: MigrationApproach = step13.ok && step13.result
    ? step13.result
    : EMPTY_MIGRATION;
  if (!step13.ok) warnings.push('Step 13 selectMigrationApproach failed; using cutover fallback');

  // Steps 14-16 loop with e5-lld checkpoint.
  let sections: LLDSection[] = [];
  let lldDocPath = '';
  let racks: RackElevation[] = [];
  let lldRevisions = 0;
  while (true) {
    const r = await runStepsFourteenFifteenSixteen(
      data, topology, sizing, ipVlanPlan, qosPolicy, migrationApproach,
      logs, input, warnings,
    );
    sections = r.sections;
    lldDocPath = r.docPath;
    racks = r.racks;
    if (!data.onCheckpoint || lldRevisions >= MAX_REVISIONS) break;
    const decision = await data.onCheckpoint(
      'e5-lld',
      JSON.stringify({ lldDocPath, rackCount: racks.length, cableCount: cableSchedule.length }),
      lldRevisions,
    );
    if (decision.decision !== 'revision_requested') break;
    lldRevisions++;
  }

  // Step 17 — second-pass compatibility validation.
  const step17 = await runStep(17, 'validateCompatibility', () =>
    validateCompatibility(sizing, topology, data.vendor), logs, input);
  const finalCompatibility: CompatibilityResult = step17.ok && step17.result
    ? step17.result
    : { valid: true, errors: [], warnings: [] };
  if (!step17.ok) warnings.push('Step 17 validateCompatibility failed; using empty result');

  recordSkip(18, 'checkpoint:e5-lld', logs);

  return {
    ipVlanPlan, portMaps, cableSchedule, qosPolicy, migrationApproach,
    lldSections: sections, lldDocPath, rackElevations: racks,
    finalCompatibility, lldRevisions,
  };
}
