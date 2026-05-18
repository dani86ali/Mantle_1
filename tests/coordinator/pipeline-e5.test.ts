import { describe, it, expect } from 'vitest';
import { baselineFromE1, synthesizeE5InputFromE1 } from '@/coordinator/pipeline-e5';
import { RequirementsBaselineSchema } from '@/engines/e5/orchestrator-types';
import type { E1Output } from '@/engines/e1/orchestrator';
import type { Requirement } from '@/engines/e1/requirements-extractor';
import type { PipelineState } from '@/coordinator/types';
import type { E5BuildInput } from '@/coordinator/pipeline-e5';

function mkRequirement(overrides: Partial<Requirement> & { id: string; text: string }): Requirement {
  return {
    classification: 'mandatory',
    confidence: 0.9,
    sourceFile: 'rfp.pdf',
    indicators: ['shall'],
    relatedStandards: [],
    ...overrides,
  };
}

function mkE1(requirements: Requirement[]): E1Output {
  return {
    fileClassifications: [],
    missingDocuments: [],
    requirements,
    riskFlags: [],
    deadlines: [],
    evalCriteria: {
      methodology: 'unknown',
      envelopes: [],
      iktvaRequired: false,
      source: 'default',
    },
    vendorPreferences: [],
    sectorDetection: {
      sector: 'general',
      confidence: 0,
      method: 'content_keywords',
      evidence: '',
    },
    frameworks: [],
    complianceMatrix: {} as unknown as E1Output['complianceMatrix'],
    clarifications: {} as unknown as E1Output['clarifications'],
    stats: {
      totalFiles: 0,
      totalRequirements: requirements.length,
      mandatoryCount: requirements.filter((r) => r.classification === 'mandatory').length,
      criticalRisks: 0,
    },
  };
}

function mkState(): PipelineState {
  return {
    id: 'pipe-1',
    opportunityId: 'opp-1',
    mode: 'rfp',
    currentEngine: 'e5',
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: new Date('2026-05-18'), updatedAt: new Date('2026-05-18') },
  };
}

function mkBuildInput(): E5BuildInput {
  return {
    clientName: 'Acme',
    vendor: 'cisco',
    siteCount: 1,
    buildingCount: 1,
    portCount: 100,
    userCount: 50,
    bandwidthGbps: 1,
  };
}

describe('synthesizeE5InputFromE1', () => {
  const reqs: Requirement[] = [
    mkRequirement({ id: 'R-001', text: 'The system shall support 1000 concurrent users.' }),
    mkRequirement({ id: 'R-002', text: 'Performance shall meet 99.9% availability SLA.' }),
    mkRequirement({
      id: 'R-003',
      text: 'The vendor shall provide a 5-year warranty contract per the purchase order.',
    }),
  ];

  it('produces a valid E5Input from 3 mandatory requirements', () => {
    const out = synthesizeE5InputFromE1(mkE1(reqs), mkBuildInput(), mkState(), '/tmp/out');
    expect(out.engine).toBe('e5');
    expect(out.inputData.requirementsBaseline).toBeDefined();
    expect(out.inputData.outputDir).toBe('/tmp/out');
    expect(out.inputData.phase).toBe('full');
  });

  it('categories sum to the input count (no requirements dropped)', () => {
    const baseline = baselineFromE1(mkE1(reqs));
    const total = (baseline.business?.length ?? 0)
      + (baseline.functional?.length ?? 0)
      + (baseline.nonFunctional?.length ?? 0)
      + (baseline.constraints?.length ?? 0)
      + (baseline.assumptions?.length ?? 0);
    expect(total).toBe(reqs.length);
  });

  it('produces a requirementsBaseline that passes the Zod schema', () => {
    const out = synthesizeE5InputFromE1(mkE1(reqs), mkBuildInput(), mkState(), '/tmp/out');
    const parsed = RequirementsBaselineSchema.safeParse(out.inputData.requirementsBaseline);
    expect(parsed.success).toBe(true);
  });

  it('keeps technical (standards-referencing) requirements even when non-mandatory', () => {
    const mix: Requirement[] = [
      mkRequirement({ id: 'R-100', text: 'Vendor shall comply.', classification: 'mandatory' }),
      mkRequirement({
        id: 'R-101',
        text: 'Equipment may follow IEEE 802.1Q tagging.',
        classification: 'optional',
        relatedStandards: ['IEEE 802.1Q'],
      }),
      mkRequirement({
        id: 'R-102',
        text: 'Bidder may submit optional extras.',
        classification: 'optional',
        relatedStandards: [],
      }),
    ];
    const baseline = baselineFromE1(mkE1(mix));
    const total = (baseline.business?.length ?? 0)
      + (baseline.functional?.length ?? 0)
      + (baseline.nonFunctional?.length ?? 0)
      + (baseline.constraints?.length ?? 0)
      + (baseline.assumptions?.length ?? 0);
    expect(total).toBe(2);
  });
});
