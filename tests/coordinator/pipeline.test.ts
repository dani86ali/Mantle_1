import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'path';

vi.mock('@/engines/e1/orchestrator', () => ({
  runE1: vi.fn(),
}));
vi.mock('@/engines/e2/orchestrator', () => ({
  runE2: vi.fn(),
}));
vi.mock('@/engines/e3/orchestrator', () => ({
  runE3: vi.fn(),
}));
// The new pause/resume path persists state mid-run; tests don't run against a
// real DB, so make persistence a no-op.
vi.mock('@/lib/db/pipeline-store', () => ({
  savePipelineState: vi.fn(async () => undefined),
  saveE1Artifacts: vi.fn(async () => undefined),
  saveE2Artifacts: vi.fn(async () => undefined),
  saveE3Artifacts: vi.fn(async () => undefined),
  loadArtifacts: vi.fn(async () => ({})),
  loadPipelineStateByIntake: vi.fn(async () => null),
  loadPipelineStateForTenant: vi.fn(async () => null),
}));

import { runE1 } from '@/engines/e1/orchestrator';
import { runE2 } from '@/engines/e2/orchestrator';
import { runE3 } from '@/engines/e3/orchestrator';
import { runPipeline, type PipelineInput } from '@/coordinator/pipeline';
import type { CheckpointStatus, EngineId, PipelineState } from '@/coordinator/types';
import type { E1Output } from '@/engines/e1/orchestrator';
import type { E2Output } from '@/engines/e2/orchestrator';
import type { E3Output } from '@/engines/e3/orchestrator';

const mockRunE1 = vi.mocked(runE1);
const mockRunE2 = vi.mocked(runE2);
const mockRunE3 = vi.mocked(runE3);

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
    exportPath: '/tmp/bomatic-e2/x/bom.xlsx',
    validationStatus: 'unvalidated',
    validationWarnings: ['EoX status not verified — stub lookup used'],
  };
}

function makeE3Output(): E3Output {
  return {
    sections: [],
    tiers: { tiers: [], comparison: [] } as unknown as E3Output['tiers'],
    margin: {
      totalCost: 100, totalSell: 200, grossMargin: 100, grossMarginPct: 0.5,
      hardwareMarginPct: 0.5, servicesMarginPct: 0.5, servicesAttachRate: 0.5,
      approvalLevel: 'presales_lead', requiresStrategicJustification: false, flags: [],
    },
    proposalPath: '/tmp/bomatic-e3/x/proposal.docx',
    financialPath: '/tmp/bomatic-e3/x/financial.xlsx',
    warnings: [],
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

// Default an auto-approve onCheckpoint so existing tests exercise the
// end-to-end run path. Production callers omit onCheckpoint, which triggers
// the new pause-after-first-engine behavior; tests that need to verify that
// path can explicitly omit it via `{ onCheckpoint: undefined }`.
const autoApproveCheckpoint: PipelineInput['onCheckpoint'] = async () => 'approved';

function baseInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    opportunityId: 'opp-abc', mode: 'rfp',
    files: [{ path: 'rfp.docx', content: 'sample' }],
    devices: DEVICES, pricingConfig: PRICING,
    onCheckpoint: autoApproveCheckpoint,
    ...overrides,
  };
}

beforeEach(() => {
  mockRunE1.mockReset();
  mockRunE2.mockReset();
  mockRunE3.mockReset();
  mockRunE1.mockResolvedValue(makeE1Output());
  mockRunE2.mockResolvedValue(makeE2Output());
  mockRunE3.mockResolvedValue(makeE3Output());
});

describe('runPipeline', () => {
  it('RFP mode runs e1, e2, e3 in sequence', async () => {
    const result = await runPipeline(baseInput());

    expect(mockRunE1).toHaveBeenCalledTimes(1);
    expect(mockRunE2).toHaveBeenCalledTimes(1);
    expect(mockRunE3).toHaveBeenCalledTimes(1);
    expect(result.e1Output).toBeDefined();
    expect(result.e2Output).toBeDefined();
    expect(result.e3Output).toBeDefined();
    expect(result.state.artifacts.e1.sector).toBe('oil_and_gas');
    expect(result.state.artifacts.e2.bomWorkbook).toBeDefined();
    expect(result.state.artifacts.e3.technicalProposal).toBe('/tmp/bomatic-e3/x/proposal.docx');
    expect(result.state.artifacts.e3.financialProposal).toBe('/tmp/bomatic-e3/x/financial.xlsx');
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

    // onCheckpoint runs once per engine (e1, e2, e3) in RFP sequence; each
    // engine creates its own set of checkpoint records.
    expect(onCheckpoint).toHaveBeenCalledTimes(3);
    expect(result.state.checkpoints.map((c) => c.id)).toEqual([
      'e1-requirements', 'e1-compliance',
      'e2-sku-confirmation', 'e2-pricing-review',
      'e3-proposal',
    ]);
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
    expect(result.state.checkpoints.map((c) => c.id)).toEqual([
      'e1-requirements', 'e1-compliance',
    ]);
    expect(result.state.checkpoints.every((c) => c.status === 'rejected')).toBe(true);
  });

  it('e3 receives metadata, cost stack, and mapped E1/E2 data', async () => {
    await runPipeline(baseInput({ clientName: 'Aramco', country: 'SA' }));
    expect(mockRunE3).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          customerName: 'Aramco',
          country: 'SA',
          currency: 'SAR',
        }),
        costStack: expect.objectContaining({
          hardwareCost: expect.any(Number),
          softwareCost: expect.any(Number),
        }),
        e1: expect.objectContaining({ sectorDetection: expect.any(Object) }),
        e2: expect.objectContaining({ totals: expect.any(Object) }),
        outputDir: expect.stringContaining('bomatic-e3'),
      }),
    );
  });

  it('cost stack derives from E2 totals using profitPct (margin mode)', async () => {
    // PRICING: profitMode=margin, profitPct=0.18 → cost = sell * 0.82
    await runPipeline(baseInput());
    const args = mockRunE3.mock.calls[0][0];
    expect(args.costStack.hardwareCost).toBeCloseTo(100 * 0.82);
    expect(args.costStack.softwareCost).toBeCloseTo(50 * 0.82);
    expect(args.costStack.servicesCost).toBeCloseTo(25 * 0.82);
    expect(args.costStack.subscriptionCost).toBeCloseTo(25 * 0.82);
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

  it('an unrecoverable error during checkpoint marks state.error and completes', async () => {
    const onCheckpoint = vi.fn(async (_state: PipelineState, engine: EngineId) => {
      if (engine === 'e1') throw new Error('checkpoint blew up');
      return 'approved' as CheckpointStatus;
    }) as PipelineInput['onCheckpoint'];

    const result = await runPipeline(baseInput({ onCheckpoint }));

    expect(result.state.error).toBeDefined();
    expect(result.state.error?.message).toContain('checkpoint blew up');
    expect(result.state.timestamps.completedAt).toBeInstanceOf(Date);
    // Pipeline aborts — E2 should not have been run.
    expect(mockRunE2).not.toHaveBeenCalled();
  });

  it('successful pipeline does not set state.error', async () => {
    const result = await runPipeline(baseInput());
    expect(result.state.error).toBeUndefined();
  });

  it("buildE2Input precondition failure flows to state.error (not silently swallowed)", async () => {
    // RFP mode without pricingConfig — buildE2Input throws inside the per-engine
    // try/catch. The pipeline must still surface this as a failure so the intake
    // row is marked FAILED instead of stuck PENDING.
    const result = await runPipeline({
      opportunityId: 'opp-no-pricing', mode: 'rfp',
      files: [{ path: 'rfp.docx', content: 'sample' }],
      onCheckpoint: autoApproveCheckpoint,
    });
    expect(result.state.error).toBeDefined();
    expect(result.state.error?.message).toContain('E2 requires devices and pricingConfig');
    const e2Call = result.state.engineCalls.find((c) => c.engine === 'e2');
    expect(e2Call?.outcome).toBe('failed');
  });

  it("quick_bom mode parses uploaded XLSX BoQ into E2 devices when intake devices are empty", async () => {
    const xlsxPath = resolve(__dirname, '../fixtures/boq/Aramco_4203079088.xlsx');
    const result = await runPipeline({
      opportunityId: 'opp-quick-bom-xlsx',
      mode: 'quick_bom',
      files: [{ path: xlsxPath }],
      pricingConfig: PRICING,
      onCheckpoint: autoApproveCheckpoint,
    });
    expect(result.state.error).toBeUndefined();
    expect(mockRunE2).toHaveBeenCalledWith(
      expect.objectContaining({
        devices: expect.arrayContaining([
          expect.objectContaining({ model: 'CS-DESKPRO-K9', qty: 2 }),
        ]),
      }),
    );
  });

  it("RFP mode threads BoQ-classified file path into E2 input and e2 artifacts", async () => {
    const boqPath = '/uploads/Aramco_BoQ_pricing.xlsx';
    mockRunE1.mockResolvedValueOnce({
      ...makeE1Output(),
      fileClassifications: [
        {
          type: 'commercial', subtype: 'boq_template', confidence: 0.9,
          stage: 1, format: 'xlsx',
          path: boqPath, filename: 'Aramco_BoQ_pricing.xlsx',
        },
        {
          type: 'technical', subtype: 'requirements', confidence: 0.8,
          stage: 1, format: 'pdf',
          path: '/uploads/rfp.pdf', filename: 'rfp.pdf',
        },
      ],
    });
    const result = await runPipeline({
      opportunityId: 'opp-rfp-boq', mode: 'rfp',
      files: [{ path: boqPath }, { path: '/uploads/rfp.pdf' }],
      pricingConfig: PRICING,
      onCheckpoint: autoApproveCheckpoint,
    });
    expect(mockRunE2).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: boqPath }),
    );
    expect(result.state.artifacts.e2.clientBoqInputPath).toBe(boqPath);
  });

  it("RFP mode without a BoQ-classified file passes filePath=undefined to E2", async () => {
    mockRunE1.mockResolvedValueOnce({
      ...makeE1Output(),
      fileClassifications: [
        {
          type: 'technical', subtype: 'requirements', confidence: 0.8,
          stage: 1, format: 'pdf',
          path: '/uploads/rfp.pdf', filename: 'rfp.pdf',
        },
      ],
    });
    await runPipeline({
      opportunityId: 'opp-rfp-no-boq', mode: 'rfp',
      files: [{ path: '/uploads/rfp.pdf' }],
      pricingConfig: PRICING,
      onCheckpoint: autoApproveCheckpoint,
    });
    expect(mockRunE2).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: undefined }),
    );
  });

  it("empty devices with pricingConfig is accepted — E2 runs with devices=[]", async () => {
    // In RFP mode devices come from the parsed BoQ inside E2; intake-level
    // devices can be empty. buildE2Input must NOT throw in this case.
    const result = await runPipeline({
      opportunityId: 'opp-empty-devices', mode: 'rfp',
      files: [{ path: 'rfp.docx', content: 'sample' }],
      pricingConfig: PRICING,
      devices: [],
      onCheckpoint: autoApproveCheckpoint,
    });
    expect(result.state.error).toBeUndefined();
    expect(mockRunE2).toHaveBeenCalledWith(
      expect.objectContaining({ devices: [] }),
    );
    const e2Call = result.state.engineCalls.find((c) => c.engine === 'e2');
    expect(e2Call?.outcome).toBe('pass');
  });
});
