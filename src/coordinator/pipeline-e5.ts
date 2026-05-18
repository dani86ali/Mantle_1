/** Coordinator → E5 bridge.
 *  Maps pipeline inputs + E4 artifacts into the EngineInput shape consumed by
 *  runE5 (phase='full'), and turns the EngineOutput<'e5'> back into the
 *  E5Artifacts the coordinator tracks.
 */

import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  E4Artifacts, E5Artifacts, EngineInput, EngineOutput, PipelineState,
} from '@/coordinator/types';
import type { E1Output } from '@/engines/e1/orchestrator';
import type { Requirement } from '@/engines/e1/requirements-extractor';
import {
  RequirementsBaselineSchema,
  type BaselineEntry,
  type E5InputData,
  type RequirementsBaseline,
} from '@/engines/e5/orchestrator-types';

export async function resolveE5OutputDir(
  ctx: { intakeId?: string; pipelineId: string },
): Promise<string> {
  const slug = ctx.intakeId ?? ctx.pipelineId;
  const dir = join(tmpdir(), 'bomatic-e5', slug);
  await mkdir(dir, { recursive: true });
  return dir;
}

export interface E5BuildInput {
  clientName?: string;
  projectName?: string;
  projectType?: string;
  vendor?: 'cisco' | 'fortinet';
  isGreenfield?: boolean;
  siteCount?: number;
  buildingCount?: number;
  portCount?: number;
  userCount?: number;
  bandwidthGbps?: number;
  hasOT?: boolean;
  hasHPC?: boolean;
  hasGPON?: boolean;
  hasWireless?: boolean;
  hasVoice?: boolean;
  hasDC?: boolean;
  hasGuest?: boolean;
  isNvidia?: boolean;
  idfRoomsPerFloor?: number;
  baseSubnet?: string;
  vrfEnabled?: boolean;
  hasVideo?: boolean;
  hasRedundancy?: boolean;
  downTimeToleranceHours?: number;
}

const EMPTY_BASELINE: RequirementsBaseline = {
  business: [], functional: [], nonFunctional: [], constraints: [], assumptions: [],
};

function parseBaseline(ref?: string): RequirementsBaseline {
  if (!ref) return EMPTY_BASELINE;
  let raw: unknown;
  try {
    raw = JSON.parse(ref);
  } catch {
    console.warn('[pipeline-e5] requirementsBaseline JSON.parse failed; returning empty categories');
    return EMPTY_BASELINE;
  }
  const result = RequirementsBaselineSchema.safeParse(raw);
  if (!result.success) {
    console.warn(
      '[pipeline-e5] requirementsBaseline failed Zod validation; returning empty categories',
      result.error.issues,
    );
    return EMPTY_BASELINE;
  }
  return result.data;
}

export function buildE5Input(
  input: E5BuildInput,
  state: PipelineState,
  e4Artifacts?: E4Artifacts,
  outputDir?: string,
): EngineInput<E5InputData> {
  const customerName = input.clientName ?? 'Customer';
  const data: E5InputData = {
    requirementsBaseline: parseBaseline(e4Artifacts?.requirementsBaseline),
    vendor: input.vendor ?? 'cisco',
    customerName,
    projectName: input.projectName ?? `${customerName} Network Solution`,
    projectType: input.projectType ?? 'general',
    isGreenfield: input.isGreenfield,
    siteCount: input.siteCount ?? 1,
    buildingCount: input.buildingCount ?? 1,
    portCount: input.portCount ?? 100,
    userCount: input.userCount ?? 50,
    bandwidthGbps: input.bandwidthGbps ?? 1,
    hasOT: input.hasOT,
    hasHPC: input.hasHPC,
    hasGPON: input.hasGPON,
    hasWireless: input.hasWireless,
    hasVoice: input.hasVoice,
    hasDC: input.hasDC,
    hasGuest: input.hasGuest,
    isNvidia: input.isNvidia,
    idfRoomsPerFloor: input.idfRoomsPerFloor,
    baseSubnet: input.baseSubnet,
    vrfEnabled: input.vrfEnabled,
    hasVideo: input.hasVideo,
    hasRedundancy: input.hasRedundancy,
    downTimeToleranceHours: input.downTimeToleranceHours,
    phase: 'full',
    outputDir,
  };
  return {
    engine: 'e5',
    pipelineState: state,
    inputData: data,
  };
}

export function toE5Artifacts(out: EngineOutput<'e5'>): E5Artifacts {
  return { ...out.artifacts };
}

// ─── RFP-mode synthesis ─────────────────────────────────────────────────
// In RFP mode E4 never runs, so E5 has no questionnaire baseline. Synthesise
// one from E1's requirements: keep the mandatory ones plus anything that
// references a technical standard (those are de-facto technical requirements),
// then bucket each into the five RequirementsBaseline categories the E5
// orchestrator expects.

const CONSTRAINT_KEYWORDS = /\b(shall\s+not|must\s+not|prohibited|forbidden|restriction|restricted|disqualif)\b/i;
const ASSUMPTION_KEYWORDS = /\b(assume|assumption|assumed|provided\s+that|given\s+that)\b/i;
const NONFUNCTIONAL_KEYWORDS = /\b(performance|scalab|availab|reliab|secur|latency|throughput|uptime|recovery|sla|response\s+time|redundan|capacity)\b/i;
const BUSINESS_KEYWORDS = /\b(budget|cost|pricing|roi|warranty|contract|schedule|timeline|milestone|invoice|payment|delivery|iktva|saudization)\b/i;

type BaselineCategory = Exclude<keyof RequirementsBaseline, never>;

function categoriseRequirement(text: string): BaselineCategory {
  if (CONSTRAINT_KEYWORDS.test(text)) return 'constraints';
  if (ASSUMPTION_KEYWORDS.test(text)) return 'assumptions';
  if (NONFUNCTIONAL_KEYWORDS.test(text)) return 'nonFunctional';
  if (BUSINESS_KEYWORDS.test(text)) return 'business';
  return 'functional';
}

function toBaselineEntry(r: Requirement): BaselineEntry {
  return {
    id: r.id,
    text: r.text,
    priority: r.classification,
    source: r.sourceFile,
    confidence: r.confidence,
  };
}

function isTechnical(r: Requirement): boolean {
  return r.relatedStandards.length > 0;
}

export function baselineFromE1(e1: E1Output): RequirementsBaseline {
  const baseline: Record<BaselineCategory, BaselineEntry[]> = {
    business: [], functional: [], nonFunctional: [], constraints: [], assumptions: [],
  };
  const filtered = e1.requirements.filter(
    (r) => r.classification === 'mandatory' || isTechnical(r),
  );
  for (const r of filtered) {
    baseline[categoriseRequirement(r.text)].push(toBaselineEntry(r));
  }
  return baseline;
}

export function synthesizeE5InputFromE1(
  e1: E1Output,
  input: E5BuildInput,
  state: PipelineState,
  outputDir: string,
): EngineInput<E5InputData> {
  const stub: E4Artifacts = {
    requirementsBaseline: JSON.stringify(baselineFromE1(e1)),
  };
  return buildE5Input(input, state, stub, outputDir);
}
