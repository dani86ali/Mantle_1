import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/engines/e1/orchestrator', () => ({
  runE1: vi.fn(),
}));
vi.mock('@/engines/e2/orchestrator', () => ({
  runE2: vi.fn(),
}));

import { runE1 } from '@/engines/e1/orchestrator';
import { runE2 } from '@/engines/e2/orchestrator';
import { runPipeline, type PipelineInput } from '@/coordinator/pipeline';
import type { CheckpointStatus, EngineId, PipelineState } from '@/coordinator/types';
import type { E1Output } from '@/engines/e1/orchestrator';
import type { E2Output } from '@/engines/e2/orchestrator';

const mockRunE1 = vi.mocked(runE1);
const mockRunE2 = vi.mocked(runE2);

function makeE1Output(): E1Output {
  return {
    fileClassifications: [],
    missingDocuments: [],
    requirements: [],
    riskFlags: [
      { category: 'disqualification', pattern: 'bid-bond', matchedText: 'bid bond', severity: 'critical', source: 'rfp.docx' },
    ],
    deadlines: [],
    evalCriteria: { methodology: 'unknown', envelopes: [], iktvaRequired: false, source: 'test' },
    vendorPreferences: [
      { vendor: 'Cisco', category: 'switching', status: 'preferred', source: 'BoQ', specificModels: [] },
    ],
    sectorDetection: { sector: 'oil_and_gas', confidence: 0.9, method: 'client_lookup', evidence: 'mock' },
    frameworks: [],
    complianceMatrix: {
      rows: [],
      gaps: { coverageGaps: [], orphanRequirements: [] },
      stats: { total: 0, compliant: 0, partial: 0, nonCompliant: 0, alternative: 0 },
    },
    clarifications: { questions: [], stats: { total: 0, critical: 0, important: 0, niceToHave: 0 } },
    stats: { totalFiles: 0, totalRequirements: 0, mandatoryCount: 0, criticalRisks: 1 },
  };
}

function makeE2Output(): E2Output {
  return {
    bom: [],
    validationResults: [],
    anomalies: { anomalies: [], riskLevel: 'low', summary: 'ok' },
    totals: {
      hardwareTotal: 100, softwareTotal: 50, serviceTotal: 25, subscriptionTotal: 25,
      grandTotalExVat: 200, vatAmount: 30, grandTotalIncVat: 230,
    },
  };
}

const DEVICES: PipelineInput['devices'] = [
  {
    model: 'C9300L-24UXG-4X-A', qty: 1,
    config: {
      dnaTier: 'advantage', networkTier: 'advantage', licenseTerm: 3,
      supportCriticality: 'standard', vendor: 'cisco',
    },
  },
];

const PRICING: PipelineInput['pricingConfig'] = {
  fxRate: 3.75, partnerDiscountPct: 0.35, dealRegDiscountPct: 0.08,
  profitMode: 'margin', profitPct: 0.18, vatRate: 0.15, country: 'SA',
};

function baseInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    opportunityId: 'opp-abc', mode: 'rfp',
    files: [{ path: 'rfp.docx', content: 'sample' }],
    devices: DEVICES, pricingConfig: PRICING,
    ...overrides,
  };
}

beforeEach(() => {
  mockRunE1.mockReset();
  mockRunE2.mockReset();
  mockRunE1.mockResolvedValue(makeE1Output());
  mockRunE2.mockResolvedValue(makeE2Output());
});

describe('runPipeline', () => {
  it('RFP mode runs e1 then e2 in sequence', async () => {
    const result = await runPipeline(baseInput());

    expect(mockRunE1).toHaveBeenCalledTimes(1);
    expect(mockRunE2).toHaveBeenCalledTimes(1);
    expect(result.e1Output).toBeDefined();
    expect(result.e2Output).toBeDefined();
    expect(result.state.artifacts.e1.sector).toBe('oil_and_gas');
    expect(result.state.artifacts.e2.bomWorkbook).toBeDefined();
    // e3 stub: no artifacts produced.
    expect(result.state.artifacts.e3).toEqual({});
  });

  it('passes E1 sector into E2 projectContext', async () => {
    await runPipeline(baseInput());
    expect(mockRunE2).toHaveBeenCalledWith(
      expect.objectContaining({
        projectContext: expect.objectContaining({ sector: 'oil_and_gas' }),
      }),
    );
  });

  it('approved checkpoint advances to next engine', async () => {
    const onCheckpoint = vi.fn(
      async (_state: PipelineState, _engine: EngineId): Promise<CheckpointStatus> => 'approved',
    );

    const result = await runPipeline(baseInput({ onCheckpoint }));

    // e1, e2, e3 checkpoints in RFP sequence.
    expect(onCheckpoint).toHaveBeenCalledTimes(3);
    expect(result.state.checkpoints.map((c) => c.engine)).toEqual(['e1', 'e2', 'e3']);
    expect(result.state.checkpoints.every((c) => c.status === 'approved')).toBe(true);
    expect(mockRunE1).toHaveBeenCalledTimes(1);
    expect(mockRunE2).toHaveBeenCalledTimes(1);
  });

  it('revision_requested reruns the engine, capped at MAX_REVISIONS (3)', async () => {
    // Always request revision on e1, approve everything else.
    const onCheckpoint = vi.fn(async (_state: PipelineState, engine: EngineId) => {
      return engine === 'e1' ? 'revision_requested' : 'approved';
    }) as PipelineInput['onCheckpoint'];

    const result = await runPipeline(baseInput({ onCheckpoint }));

    // 1 initial run + 3 revisions = 4 e1 invocations.
    expect(mockRunE1).toHaveBeenCalledTimes(4);
    // Pipeline continues past e1 once revisions are exhausted.
    expect(mockRunE2).toHaveBeenCalledTimes(1);

    const e1Calls = result.state.engineCalls.filter((c) => c.engine === 'e1');
    expect(e1Calls).toHaveLength(4);
    expect(e1Calls.map((c) => c.retryCount)).toEqual([0, 1, 2, 3]);
  });

  it('rejected checkpoint stops pipeline immediately', async () => {
    const onCheckpoint = vi.fn(async (_state: PipelineState, engine: EngineId) => {
      return engine === 'e1' ? 'rejected' : 'approved';
    }) as PipelineInput['onCheckpoint'];

    const result = await runPipeline(baseInput({ onCheckpoint }));

    expect(mockRunE1).toHaveBeenCalledTimes(1);
    expect(mockRunE2).not.toHaveBeenCalled();
    expect(result.state.checkpoints).toHaveLength(1);
    expect(result.state.checkpoints[0].status).toBe('rejected');
  });

  it('e3 stub logs warning and produces no artifacts', async () => {
    const result = await runPipeline(baseInput());
    expect(result.state.artifacts.e3).toEqual({});
    // engineCalls records the e3 stub invocation.
    expect(result.state.engineCalls.some((c) => c.engine === 'e3')).toBe(true);
  });

  it('engineCalls records each engine in the sequence', async () => {
    const result = await runPipeline(baseInput());
    const engines = result.state.engineCalls.map((c) => c.engine);
    expect(engines).toEqual(['e1', 'e2', 'e3']);
    expect(result.state.engineCalls.every((c) => c.completedAt !== undefined)).toBe(true);
  });

  it('engine error is captured and pipeline continues to checkpoint', async () => {
    mockRunE1.mockRejectedValueOnce(new Error('e1 boom'));
    const onCheckpoint = vi.fn(
      async (_state: PipelineState, _engine: EngineId): Promise<CheckpointStatus> => 'approved',
    );

    const result = await runPipeline(baseInput({ onCheckpoint }));

    expect(onCheckpoint).toHaveBeenCalled();
    const e1Call = result.state.engineCalls.find((c) => c.engine === 'e1');
    expect(e1Call?.outcome).toBe('failed');
    // Checkpoint still invoked after failed engine call.
    expect(result.state.checkpoints[0].engine).toBe('e1');
  });
});
