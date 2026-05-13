import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('@/engines/e1/orchestrator', () => ({ runE1: vi.fn() }));
vi.mock('@/engines/e2/orchestrator', () => ({ runE2: vi.fn() }));
vi.mock('@/engines/e3/orchestrator', () => ({ runE3: vi.fn() }));
vi.mock('@/engines/e4/orchestrator', () => ({ runE4: vi.fn() }));
vi.mock('@/engines/e5/orchestrator', () => ({ runE5: vi.fn() }));

import { runE1 } from '@/engines/e1/orchestrator';
import { runE2 } from '@/engines/e2/orchestrator';
import { runE3 } from '@/engines/e3/orchestrator';
import { runE4 } from '@/engines/e4/orchestrator';
import { runE5 } from '@/engines/e5/orchestrator';
import { runPipeline, type PipelineInput } from '@/coordinator/pipeline';
import type { EngineOutput } from '@/coordinator/types';
import type { E2Output } from '@/engines/e2/orchestrator';
import type { E3Output } from '@/engines/e3/orchestrator';

const mockRunE1 = vi.mocked(runE1);
const mockRunE2 = vi.mocked(runE2);
const mockRunE3 = vi.mocked(runE3);
const mockRunE4 = vi.mocked(runE4);
const mockRunE5 = vi.mocked(runE5);

const PRICING: PipelineInput['pricingConfig'] = {
  fxRate: 3.75, partnerDiscountPct: 0.35, dealRegDiscountPct: 0.08,
  profitMode: 'margin', profitPct: 0.18, vatRate: 0.15, country: 'SA',
};

function makeE2Output(): E2Output {
  return {
    bom: [], validationResults: [],
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
  };
}

function makeE4Output(): EngineOutput<'e4'> {
  return {
    engine: 'e4',
    artifacts: {
      questionnaire: '# RFI questionnaire',
      requirementsBaseline: JSON.stringify({ business: [{ id: 'b1' }] }),
    },
    warnings: [],
  };
}

function makeE5Output(): EngineOutput<'e5'> {
  return {
    engine: 'e5',
    artifacts: {
      hldDocument: '/tmp/bomatic-e5/x/hld.docx',
      lldDocument: '/tmp/bomatic-e5/x/lld.docx',
      diagrams: ['<diagram/>'],
      ipVlanPlan: '{}',
      componentList: JSON.stringify([
        { model: 'C9300-48P-A', vendor: 'cisco', quantity: 2, role: 'access', fromDesignStep: 'sizing-calculator' },
      ]),
    },
    warnings: [],
  };
}

function rfiInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    opportunityId: 'opp-rfi',
    mode: 'rfi',
    clientName: 'Acme',
    country: 'SA',
    solutionContext: 'campus refresh',
    pricingConfig: PRICING,
    siteCount: 1, buildingCount: 1, portCount: 100, userCount: 50, bandwidthGbps: 5,
    ...overrides,
  };
}

beforeEach(() => {
  mockRunE1.mockReset();
  mockRunE2.mockReset();
  mockRunE3.mockReset();
  mockRunE4.mockReset();
  mockRunE5.mockReset();
  mockRunE2.mockResolvedValue(makeE2Output());
  mockRunE3.mockResolvedValue(makeE3Output());
  mockRunE4.mockResolvedValue(makeE4Output());
  mockRunE5.mockResolvedValue(makeE5Output());
});

describe('runPipeline RFI integration', () => {
  it('STUB_ENGINES no longer exists in pipeline.ts source', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'coordinator', 'pipeline.ts'), 'utf8');
    expect(src.includes('STUB_ENGINES')).toBe(false);
  });

  it('RFI mode runs e4, e5, e2, e3 in sequence (no e1)', async () => {
    const result = await runPipeline(rfiInput());
    expect(mockRunE1).not.toHaveBeenCalled();
    expect(mockRunE4).toHaveBeenCalledTimes(1);
    expect(mockRunE5).toHaveBeenCalledTimes(1);
    expect(mockRunE2).toHaveBeenCalledTimes(1);
    expect(mockRunE3).toHaveBeenCalledTimes(1);
    expect(result.state.engineCalls.map((c) => c.engine)).toEqual(['e4', 'e5', 'e2', 'e3']);
  });

  it('stores E4 artifacts in state.artifacts.e4', async () => {
    const result = await runPipeline(rfiInput());
    expect(result.state.artifacts.e4.questionnaire).toBe('# RFI questionnaire');
    expect(result.state.artifacts.e4.requirementsBaseline).toContain('business');
  });

  it('stores E5 artifacts in state.artifacts.e5 with real paths', async () => {
    const result = await runPipeline(rfiInput());
    expect(result.state.artifacts.e5.hldDocument).toBe('/tmp/bomatic-e5/x/hld.docx');
    expect(result.state.artifacts.e5.lldDocument).toBe('/tmp/bomatic-e5/x/lld.docx');
    expect(result.state.artifacts.e5.componentList).toContain('C9300-48P-A');
  });

  it('E5 receives E4 requirementsBaseline as parsed object', async () => {
    await runPipeline(rfiInput());
    const e5Args = mockRunE5.mock.calls[0][0];
    const data = e5Args.inputData as { requirementsBaseline: { business: { id: string }[] } };
    expect(data.requirementsBaseline.business[0].id).toBe('b1');
  });

  it('E4 receives clientName, country, and description from intake', async () => {
    await runPipeline(rfiInput({ sector: 'oil_and_gas' }));
    const e4Args = mockRunE4.mock.calls[0][0];
    const data = e4Args.inputData as {
      clientName: string; country: string; description: string; sector: string;
    };
    expect(data.clientName).toBe('Acme');
    expect(data.country).toBe('SA');
    expect(data.description).toBe('campus refresh');
    expect(data.sector).toBe('oil_and_gas');
  });

  it('E2 receives devices derived from E5 componentList when none supplied', async () => {
    await runPipeline(rfiInput());
    const e2Args = mockRunE2.mock.calls[0][0];
    expect(e2Args.devices).toHaveLength(1);
    expect(e2Args.devices[0].model).toBe('C9300-48P-A');
    expect(e2Args.devices[0].qty).toBe(2);
    expect(e2Args.devices[0].config.vendor).toBe('cisco');
  });

  it('RFP mode (e1/e2/e3) does not invoke E4 or E5', async () => {
    mockRunE1.mockResolvedValue({
      fileClassifications: [], missingDocuments: [], requirements: [],
      riskFlags: [], deadlines: [],
      evalCriteria: { methodology: 'unknown', envelopes: [], iktvaRequired: false, source: '' },
      vendorPreferences: [],
      sectorDetection: { sector: 'general', confidence: 0, method: 'client_lookup', evidence: '' },
      frameworks: [],
      complianceMatrix: { rows: [], gaps: { coverageGaps: [], orphanRequirements: [] },
        stats: { total: 0, compliant: 0, partial: 0, nonCompliant: 0, alternative: 0 } },
      clarifications: { questions: [], stats: { total: 0, critical: 0, important: 0, niceToHave: 0 } },
      stats: { totalFiles: 0, totalRequirements: 0, mandatoryCount: 0, criticalRisks: 0 },
    });

    await runPipeline({
      opportunityId: 'opp-rfp', mode: 'rfp',
      files: [{ path: 'rfp.docx', content: 'sample' }],
      devices: [{ model: 'C9300', qty: 1, config: {
        dnaTier: 'advantage', networkTier: 'advantage', licenseTerm: 3,
        supportCriticality: 'standard', vendor: 'cisco',
      } }],
      pricingConfig: PRICING,
    });
    expect(mockRunE4).not.toHaveBeenCalled();
    expect(mockRunE5).not.toHaveBeenCalled();
    expect(mockRunE1).toHaveBeenCalledTimes(1);
  });

  it('E4 error returned in EngineOutput surfaces as pipeline error', async () => {
    mockRunE4.mockResolvedValue({
      engine: 'e4', artifacts: {}, warnings: [], error: 'phase1 failed',
    });
    const result = await runPipeline(rfiInput());
    expect(result.state.error?.message).toContain('phase1 failed');
    const e4Call = result.state.engineCalls.find((c) => c.engine === 'e4');
    expect(e4Call?.outcome).toBe('failed');
  });
});
