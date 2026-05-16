/**
 * E5 phase 1 — HLD generation through the e5-design-approach and e5-hld
 * checkpoints. Steps 1-7 per Runtime Architecture §4.5 (Playbook §3.6).
 * Each checkpoint allows up to 3 revisions.
 */

import { selectMethodology } from '@/engines/e5/methodology-selector';
import { recommendTopology } from '@/engines/e5/topology-recommender';
import { calculateSizing } from '@/engines/e5/sizing-calculator';
import { validateCompatibility } from '@/engines/e5/compatibility-validator';
import { selectMigrationApproach } from '@/engines/e5/migration-selector';
import { generateHLDNarrative } from '@/engines/e5/hld-narrative-generator';
import { generateHLDDocx } from '@/engines/e5/hld-docx-generator';
import { generateDiagrams } from '@/engines/e5/diagram-generator';
import { join } from 'node:path';
import { recordSkip, runStep, type E5StepLog } from './orchestrator-helpers';
import type { EngineInput } from '@/coordinator/types';
import type {
  CompatibilityResult,
  DesignApproach,
  HLDSection,
  MigrationApproach,
  SizingResult,
  TopologyPattern,
} from '@/engines/e5/types';
import type { E5InputData } from './orchestrator-types';

const MAX_REVISIONS = 3;

export interface Phase1Result {
  designApproach: DesignApproach;
  topology: TopologyPattern;
  sizing: SizingResult;
  compatibility: CompatibilityResult;
  migrationApproach: MigrationApproach;
  hldSections: HLDSection[];
  hldDocPath: string;
  diagramXml: string;
  designApproachRevisions: number;
  hldRevisions: number;
}

function buildOutputPath(data: E5InputData, kind: 'hld' | 'lld', outputDir: string): string {
  const safe = `${data.customerName}-${data.projectName}`.replace(/[^A-Za-z0-9_-]+/g, '_');
  return join(outputDir, `${safe}-${kind}.docx`);
}

async function runStepsOneAndTwo(
  data: E5InputData,
  logs: E5StepLog[],
  input: EngineInput,
  warnings: string[],
): Promise<{ approach: DesignApproach; topology: TopologyPattern }> {
  const step1 = await runStep(1, 'selectMethodology', () =>
    selectMethodology(data.projectType, {
      hasOT: data.hasOT, siteCount: data.siteCount, isGreenfield: data.isGreenfield,
      hasDC: data.hasDC, hasHPC: data.hasHPC, hasGPON: data.hasGPON,
    }), logs, input);
  const baseApproach: DesignApproach = step1.ok && step1.result
    ? { ...step1.result, vendor: data.vendor }
    : { methodology: 'ppdioo', approach: 'hybrid', frameworks: ['ppdioo'],
        topologyPattern: null, vendor: data.vendor, projectType: data.projectType };
  if (!step1.ok) warnings.push('Step 1 selectMethodology failed; using fallback approach');

  const step2 = await runStep(2, 'recommendTopology', () =>
    recommendTopology({
      projectType: data.projectType, portCount: data.portCount, siteCount: data.siteCount,
      buildingCount: data.buildingCount, userCount: data.userCount,
      bandwidthGbps: data.bandwidthGbps, hasOT: !!data.hasOT, hasHPC: !!data.hasHPC,
      hasGPON: !!data.hasGPON, isNvidia: data.isNvidia, idfRoomsPerFloor: data.idfRoomsPerFloor,
    }), logs, input);
  const topology: TopologyPattern = step2.ok && step2.result
    ? step2.result.pattern
    : 'two_tier_collapsed_core';
  if (!step2.ok) warnings.push('Step 2 recommendTopology failed; using two_tier_collapsed_core fallback');

  return { approach: { ...baseApproach, topologyPattern: topology }, topology };
}

async function runStepsFiveSixSeven(
  data: E5InputData,
  topology: TopologyPattern,
  sizing: SizingResult,
  migrationApproach: MigrationApproach,
  logs: E5StepLog[],
  input: EngineInput,
  warnings: string[],
  outputDir: string,
): Promise<{ sections: HLDSection[]; docPath: string; diagramXml: string }> {
  const step5 = await runStep(5, 'generateHLDNarrative', () =>
    generateHLDNarrative({
      topology, sizing, vendor: data.vendor, projectType: data.projectType,
      customerName: data.customerName, migrationApproach,
    }), logs, input);
  const sections: HLDSection[] = step5.ok && step5.result ? step5.result : [];
  if (!step5.ok) warnings.push('Step 5 generateHLDNarrative failed; emitting empty HLD sections');

  const docPath = buildOutputPath(data, 'hld', outputDir);
  const step6 = await runStep(6, 'generateHLDDocx', () =>
    generateHLDDocx(sections, {
      customerName: data.customerName, projectName: data.projectName,
      version: '1.0', date: new Date().toISOString().slice(0, 10),
    }, docPath), logs, input);
  const resolvedDocPath: string = step6.ok && step6.result ? step6.result : '';
  if (!step6.ok) warnings.push('Step 6 generateHLDDocx failed; no HLD .docx produced');

  const step7 = await runStep(7, 'generateDiagrams', () =>
    generateDiagrams(topology, sizing), logs, input);
  const diagramXml = step7.ok && step7.result ? step7.result.logicalTopology : '';
  if (!step7.ok) warnings.push('Step 7 generateDiagrams failed; no diagram XML produced');

  return { sections, docPath: resolvedDocPath, diagramXml };
}

export async function runPhase1(
  data: E5InputData,
  logs: E5StepLog[],
  warnings: string[],
  input: EngineInput,
  outputDir: string = './out',
): Promise<Phase1Result> {
  // Steps 1-2 loop with e5-design-approach checkpoint.
  let approach!: DesignApproach;
  let topology!: TopologyPattern;
  let designApproachRevisions = 0;
  while (true) {
    const r = await runStepsOneAndTwo(data, logs, input, warnings);
    approach = r.approach;
    topology = r.topology;
    if (!data.onCheckpoint || designApproachRevisions >= MAX_REVISIONS) break;
    const decision = await data.onCheckpoint(
      'e5-design-approach',
      JSON.stringify({ approach, topology }),
      designApproachRevisions,
    );
    if (decision.decision !== 'revision_requested') break;
    designApproachRevisions++;
  }

  // Step 3 — sizing.
  const step3 = await runStep(3, 'calculateSizing', () =>
    calculateSizing({
      userCount: data.userCount, portCount: data.portCount, bandwidthGbps: data.bandwidthGbps,
      siteCount: Math.max(1, data.siteCount), idfRoomsPerFloor: data.idfRoomsPerFloor,
      hasOT: data.hasOT, hasWireless: data.hasWireless, hasDC: data.hasDC,
    }, topology, data.vendor), logs, input);
  const sizing: SizingResult = step3.ok && step3.result ? step3.result : {
    coreDevices: [], distributionDevices: [], accessDevices: [],
    firewalls: [], wirelessControllers: [], accessPoints: [],
  };
  if (!step3.ok) warnings.push('Step 3 calculateSizing failed; emitting empty sizing');

  // Step 4 — compatibility (first pass).
  const step4 = await runStep(4, 'validateCompatibility', () =>
    validateCompatibility(sizing, topology, data.vendor), logs, input);
  const compatibility: CompatibilityResult = step4.ok && step4.result
    ? step4.result
    : { valid: true, errors: [], warnings: [] };
  if (!step4.ok) warnings.push('Step 4 validateCompatibility failed; using empty result');

  // Pre-compute migration approach for HLD §10. Pure function — no runStep
  // wrapper; the canonical "step 13" entry is logged in phase 2.
  const totalDevices =
    sizing.coreDevices.reduce((s, d) => s + d.quantity, 0) +
    sizing.distributionDevices.reduce((s, d) => s + d.quantity, 0) +
    sizing.accessDevices.reduce((s, d) => s + d.quantity, 0) +
    sizing.firewalls.reduce((s, d) => s + d.quantity, 0);
  const migrationApproach: MigrationApproach = selectMigrationApproach({
    isGreenfield: !!data.isGreenfield,
    siteCount: data.siteCount,
    hasRedundancy: !!data.hasRedundancy,
    downTimeToleranceHours: data.downTimeToleranceHours ?? 0,
    deviceCount: totalDevices,
  });

  // Steps 5-7 loop with e5-hld checkpoint.
  let sections: HLDSection[] = [];
  let hldDocPath = '';
  let diagramXml = '';
  let hldRevisions = 0;
  while (true) {
    const r = await runStepsFiveSixSeven(data, topology, sizing, migrationApproach, logs, input, warnings, outputDir);
    sections = r.sections;
    hldDocPath = r.docPath;
    diagramXml = r.diagramXml;
    if (!data.onCheckpoint || hldRevisions >= MAX_REVISIONS) break;
    const decision = await data.onCheckpoint(
      'e5-hld',
      JSON.stringify({ hldDocPath, diagramXml, compatibility }),
      hldRevisions,
    );
    if (decision.decision !== 'revision_requested') break;
    hldRevisions++;
  }

  recordSkip(8, 'checkpoint:e5-hld', logs);

  return {
    designApproach: approach,
    topology,
    sizing,
    compatibility,
    migrationApproach,
    hldSections: sections,
    hldDocPath,
    diagramXml,
    designApproachRevisions,
    hldRevisions,
  };
}
