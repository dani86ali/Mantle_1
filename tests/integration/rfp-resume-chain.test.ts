/**
 * Integration test for the RFP pause/resume chain.
 *
 * Reproduces the user-visible bug from P4 (commit bce86d5): after E1 compliance
 * approval, the pipeline should resume and run E5, then expose two pending
 * checkpoints (e5-design-approach, e5-hld — LLD paused for demo per Fix #4).
 * This test stubs the engines and the DB layer so we can assert on the
 * orchestrator's resume behavior in isolation.
 *
 * On current main (before the fix-pack on this branch) this test:
 *   - PASSES the in-memory checkpoint assertion (resumePipeline itself is OK
 *     — the orchestrator wires E5 into the RFP sequence correctly).
 *   - The user-visible failure path is the *next* hop: when the operator tries
 *     to approve any e5-* checkpoint, the API allowlist in
 *     src/app/api/pipeline/[id]/checkpoint/route.ts rejects it with 400
 *     because VALID_CHECKPOINT_IDS hard-codes only e1/e2/e3 ids. That second
 *     hop is verified in tests/app/api/pipeline-checkpoint.test.ts.
 *
 * This file is kept as a regression guard against the resume chain itself
 * regressing — e.g., someone changing loadArtifacts to drop e1Output's
 * structured fields, or someone changing the dispatcher to bail when e1Output
 * is undefined on resume.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/engines/e1/orchestrator', () => ({ runE1: vi.fn() }));
vi.mock('@/engines/e2/orchestrator', () => ({ runE2: vi.fn() }));
vi.mock('@/engines/e3/orchestrator', () => ({ runE3: vi.fn() }));
vi.mock('@/engines/e5/orchestrator', () => ({
  runE5: vi.fn(async () => ({
    engine: 'e5',
    artifacts: {
      hldDocument: '/tmp/bomatic-e5/x/hld.docx',
      diagrams: [],
      designSummary: '{}',
    },
    warnings: [],
  })),
}));

vi.mock('@/coordinator/intake-to-pipeline-input', () => ({
  buildPipelineInputForIntake: vi.fn(),
}));

vi.mock('@/lib/db/queries', () => ({
  updateIntakeStatus: vi.fn(async () => undefined),
}));

const { mockSaveState, mockLoadStateByIntake, mockLoadArtifacts,
  mockSaveE1, mockSaveE2, mockSaveE3 } = vi.hoisted(() => ({
  mockSaveState: vi.fn(async (_s: unknown): Promise<void> => undefined),
  mockLoadStateByIntake: vi.fn(),
  mockLoadArtifacts: vi.fn(),
  mockSaveE1: vi.fn(async () => undefined),
  mockSaveE2: vi.fn(async () => undefined),
  mockSaveE3: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db/pipeline-store', () => ({
  savePipelineState: mockSaveState,
  loadPipelineStateByIntake: mockLoadStateByIntake,
  loadArtifacts: mockLoadArtifacts,
  saveE1Artifacts: mockSaveE1,
  saveE2Artifacts: mockSaveE2,
  saveE3Artifacts: mockSaveE3,
}));

import { runE5 } from '@/engines/e5/orchestrator';
import { buildPipelineInputForIntake } from '@/coordinator/intake-to-pipeline-input';
import { resumeAndPersistPipeline } from '@/coordinator/run-and-persist';
import type { E1Output } from '@/engines/e1/orchestrator';
import type { PipelineState } from '@/coordinator/types';
import type { PipelineInput } from '@/coordinator/pipeline-types';

const mockRunE5 = vi.mocked(runE5);
const mockBuildInput = vi.mocked(buildPipelineInputForIntake);

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const INTAKE_ID = 'intake-rfp-resume-test';

function makeE1Output(): E1Output {
  return {
    fileClassifications: [
      {
        type: 'commercial', subtype: 'boq_template', confidence: 0.9,
        stage: 1, format: 'xlsx',
        path: '/uploads/boq.xlsx', filename: 'boq.xlsx',
      },
    ],
    missingDocuments: [],
    requirements: [
      {
        id: 'R-1', text: 'System shall support 10Gbps uplink',
        classification: 'mandatory', confidence: 0.85,
        sourceFile: 'rfp.docx', indicators: ['shall'], relatedStandards: ['IEEE 802.3'],
      },
    ],
    riskFlags: [],
    deadlines: [],
    evalCriteria: {
      methodology: 'unknown', envelopes: [], iktvaRequired: false, source: 'test',
    },
    vendorPreferences: [],
    sectorDetection: {
      sector: 'telecom', confidence: 0.9,
      method: 'client_lookup', evidence: 'mock',
    },
    frameworks: [],
    complianceMatrix: {
      rows: [],
      gaps: { coverageGaps: [], orphanRequirements: [] },
      stats: { total: 0, compliant: 0, partial: 0, nonCompliant: 0, alternative: 0 },
    },
    clarifications: {
      questions: [],
      stats: { total: 0, critical: 0, important: 0, niceToHave: 0 },
    },
    stats: {
      totalFiles: 1, totalRequirements: 1, mandatoryCount: 1, criticalRisks: 0,
    },
  };
}

function makePausedAtE1State(): PipelineState {
  const now = new Date();
  return {
    id: 'pl-test',
    opportunityId: `intake:${INTAKE_ID}`,
    intakeId: INTAKE_ID,
    mode: 'rfp',
    currentEngine: 'e1',
    status: 'running',
    artifacts: {
      e1: {
        sector: 'telecom',
        complianceMatrix: '{}',
        requirementsBaseline: '{}',
      },
      e2: {}, e3: {}, e4: {}, e5: {},
    },
    checkpoints: [
      {
        id: 'e1-requirements', engine: 'e1', label: 'Requirements baseline review',
        status: 'approved', revisionsUsed: 0, decidedAt: now,
      },
      {
        id: 'e1-compliance', engine: 'e1', label: 'Compliance matrix review',
        status: 'approved', revisionsUsed: 0, decidedAt: now,
      },
    ],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

function makeInput(): PipelineInput {
  return {
    opportunityId: `intake:${INTAKE_ID}`,
    tenantId: TENANT_ID,
    mode: 'rfp',
    clientName: 'Test Customer',
    country: 'SA',
    files: [],
    pricingConfig: {
      fxRate: 3.75, partnerDiscountPct: 0.35, dealRegDiscountPct: 0.08,
      profitMode: 'margin', profitPct: 0.18, vatRate: 0.15, country: 'SA',
    },
  };
}

describe('RFP resume chain (E1 → E5)', () => {
  let capturedStates: PipelineState[];

  beforeEach(() => {
    capturedStates = [];
    mockSaveState.mockReset().mockImplementation(async (s) => {
      capturedStates.push(JSON.parse(JSON.stringify(s)) as PipelineState);
    });
    mockLoadStateByIntake.mockReset().mockResolvedValue(makePausedAtE1State());
    mockLoadArtifacts.mockReset().mockResolvedValue({ e1: makeE1Output() });
    mockBuildInput.mockReset().mockResolvedValue(makeInput());
    mockRunE5.mockClear();
  });

  it('resumes from paused-at-E1 and adds two pending E5 checkpoints', async () => {
    await resumeAndPersistPipeline(TENANT_ID, INTAKE_ID);

    expect(mockRunE5).toHaveBeenCalledTimes(1);

    const finalState = capturedStates[capturedStates.length - 1];
    expect(finalState).toBeDefined();

    const checkpointIds = finalState.checkpoints.map((c) => c.id);
    expect(checkpointIds).toEqual([
      'e1-requirements',
      'e1-compliance',
      'e5-design-approach',
      'e5-hld',
    ]);
    expect(checkpointIds).not.toContain('e5-lld');

    const e5Checkpoints = finalState.checkpoints.filter((c) => c.engine === 'e5');
    expect(e5Checkpoints).toHaveLength(2);
    for (const cp of e5Checkpoints) {
      expect(cp.status).toBe('pending');
    }

    expect(finalState.status).toBe('paused_at_checkpoint');
    expect(finalState.currentEngine).toBe('e5');
  });

  it('passes the rehydrated E1 requirements into E5 input (RFP synthesis path)', async () => {
    await resumeAndPersistPipeline(TENANT_ID, INTAKE_ID);

    expect(mockRunE5).toHaveBeenCalledTimes(1);
    const e5Call = mockRunE5.mock.calls[0][0];
    expect(e5Call.inputData.vendor).toBe('cisco');
    expect(e5Call.inputData.requirementsBaseline).toBeDefined();
    // At least one bucket should contain the mandatory requirement we seeded
    // via E1; "shall support" lives in nonFunctional via the throughput
    // keyword path or functional via the default bucket. Either way the
    // baseline should not be all-empty.
    const buckets = e5Call.inputData.requirementsBaseline;
    const totalEntries =
      (buckets.business?.length ?? 0) +
      (buckets.functional?.length ?? 0) +
      (buckets.nonFunctional?.length ?? 0) +
      (buckets.constraints?.length ?? 0) +
      (buckets.assumptions?.length ?? 0);
    expect(totalEntries).toBeGreaterThan(0);
  });
});
