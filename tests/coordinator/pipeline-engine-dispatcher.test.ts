import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import ExcelJS from 'exceljs';

vi.mock('@/engines/e1/orchestrator', () => ({ runE1: vi.fn() }));
vi.mock('@/engines/e2/orchestrator', () => ({ runE2: vi.fn() }));
vi.mock('@/engines/e3/orchestrator', () => ({ runE3: vi.fn() }));
vi.mock('@/engines/e4/orchestrator', () => ({ runE4: vi.fn() }));
vi.mock('@/engines/e5/orchestrator', () => ({ runE5: vi.fn() }));

// Tenant credentials + price-list lookups inside loadListPrices both resolve
// to []. The adapter then proceeds with stub credentials (the mock below
// ignores them anyway).
vi.mock('@/lib/db/index', () => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  return { db: chain };
});

vi.mock('@/lib/adapters/catalog', () => ({
  getItems: vi.fn(async (skus: string[]) => ({
    success: true,
    data: {
      items: skus.map((sku) => ({
        sku,
        listPrice:
          sku === 'C9300-24P-A' ? 5000
            : sku === 'C9300-48T-A' ? 7000
            : 0,
      })),
    },
    cached: false,
    durationMs: 0,
  })),
}));

import { runE2 } from '@/engines/e2/orchestrator';
import { runE2Stage } from '@/coordinator/pipeline-engine-dispatcher';
import { createInitialState } from '@/coordinator/pipeline-state';
import type { PipelineInput, PipelineResult } from '@/coordinator/pipeline-types';
import type { E1Output } from '@/engines/e1/orchestrator';
import type { E2Output } from '@/engines/e2/orchestrator';

const mockRunE2 = vi.mocked(runE2);

const PRICING: NonNullable<PipelineInput['pricingConfig']> = {
  fxRate: 3.75, partnerDiscountPct: 0.35, dealRegDiscountPct: 0.08,
  profitMode: 'margin', profitPct: 0.18, vatRate: 0.15, country: 'SA',
};

function makeE2Output(): E2Output {
  return {
    bom: [], validationResults: [],
    anomalies: { anomalies: [], riskLevel: 'low', summary: 'ok' },
    totals: {
      hardwareTotal: 0, softwareTotal: 0, serviceTotal: 0, subscriptionTotal: 0,
      grandTotalExVat: 0, vatAmount: 0, grandTotalIncVat: 0,
    },
    validationStatus: 'unvalidated',
    validationWarnings: [],
  };
}

function makeE1Output(boqPath: string): E1Output {
  return {
    fileClassifications: [{
      type: 'commercial', subtype: 'boq_template', confidence: 0.9,
      stage: 1, format: 'xlsx',
      path: boqPath, filename: 'sample-boq.xlsx',
    }],
    missingDocuments: [],
    requirements: [],
    riskFlags: [],
    deadlines: [],
    evalCriteria: { methodology: 'unknown', envelopes: [], iktvaRequired: false, source: 'test' },
    vendorPreferences: [],
    sectorDetection: { sector: 'general', confidence: 0.5, method: 'client_lookup', evidence: 'test' },
    frameworks: [],
    complianceMatrix: {
      rows: [],
      gaps: { coverageGaps: [], orphanRequirements: [] },
      stats: { total: 0, compliant: 0, partial: 0, nonCompliant: 0, alternative: 0 },
    },
    clarifications: { questions: [], stats: { total: 0, critical: 0, important: 0, niceToHave: 0 } },
    stats: { totalFiles: 1, totalRequirements: 0, mandatoryCount: 0, criticalRisks: 0 },
  };
}

async function writeTypeDFixture(filePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Active BoQ');
  sheet.addRow(['Line Number', 'Part Number', 'Description', 'Service Duration', 'Qty']);
  sheet.addRow(['1.1', 'C9300-24P-A', 'Catalyst 9300 24-port', '---', 5]);
  sheet.addRow(['1.2', 'C9300-48T-A', 'Catalyst 9300 48-port', '---', 3]);
  await wb.xlsx.writeFile(filePath);
}

describe('runE2Stage — BoQ-driven pricing (RFP mode)', () => {
  let boqPath: string;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bomatic-boq-fixture-'));
    boqPath = join(dir, 'sample-boq.xlsx');
    await writeTypeDFixture(boqPath);
  });

  beforeEach(() => {
    mockRunE2.mockReset();
    mockRunE2.mockResolvedValue(makeE2Output());
  });

  it('extracts SKUs from the BoQ workbook and passes them to E2 as listPrices', async () => {
    const input: PipelineInput = {
      opportunityId: 'opp-rfp-boq',
      tenantId: 'tenant-x',
      mode: 'rfp',
      pricingConfig: PRICING,
    };
    const state = createInitialState(input.opportunityId, input.mode);
    const out: PipelineResult = { state, e1Output: makeE1Output(boqPath) };

    await runE2Stage(input, state, out);

    expect(mockRunE2).toHaveBeenCalledTimes(1);
    const passed = mockRunE2.mock.calls[0][0];
    expect(passed.listPrices).toBeDefined();
    expect(passed.listPrices?.['C9300-24P-A']).toBe(5000);
    expect(passed.listPrices?.['C9300-48T-A']).toBe(7000);
  });

  it('skips BoQ extraction when no BoQ file is classified', async () => {
    const input: PipelineInput = {
      opportunityId: 'opp-rfp-no-boq',
      tenantId: 'tenant-x',
      mode: 'rfp',
      pricingConfig: PRICING,
    };
    const state = createInitialState(input.opportunityId, input.mode);
    const e1: E1Output = { ...makeE1Output(boqPath), fileClassifications: [] };
    const out: PipelineResult = { state, e1Output: e1 };

    await runE2Stage(input, state, out);

    const passed = mockRunE2.mock.calls[0][0];
    expect(passed.listPrices).toEqual({});
  });
});
