import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));
vi.mock('@/lib/io/excel-reader', () => ({
  readExcelFile: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { readExcelFile } from '@/lib/io/excel-reader';
import { runE1 } from '@/engines/e1/orchestrator';

const mockCallAI = vi.mocked(callAI);
const mockReadExcelFile = vi.mocked(readExcelFile);

const RFP_TEXT = [
  'Saudi Aramco — Storage Expansion RFP.',
  'The Vendor shall provide 24x7 technical support with 4-hour response time.',
  'All equipment must be new and unused, in accordance with SACS-002 and ISO 27001.',
  'The submission deadline is 15-March-2026 at 14:00 AST.',
  'A bid bond of 2% is required at submission. Failure to comply will result in disqualification.',
  'The system should ideally support future expansion to 10,000 users.',
  'Vendors may propose alternative solutions that meet the same objectives.',
  'All administrative access shall require multi-factor authentication and strong password controls.',
  'The solution must support data encryption in transit using TLS 1.3.',
  'If applicable, the vendor shall comply with IKTVA requirements.',
  'Refer to Annex A for the detailed scope of work.',
].join(' ');

interface CallAIArgs { taskId: string }

function aiRouter(args: CallAIArgs) {
  if (args.taskId.startsWith('requirements-extractor')) {
    return {
      success: true as const,
      data: { classification: 'optional' as const, confidence: 0.7, reasoning: 'mock' },
      tokensUsed: 10,
      latencyMs: 5,
    };
  }
  if (args.taskId.startsWith('compliance-matrix-status')) {
    return {
      success: true as const,
      data: [],
      tokensUsed: 10,
      latencyMs: 5,
    };
  }
  if (args.taskId.startsWith('eval-criteria-analyzer')) {
    return {
      success: true as const,
      data: { methodology: 'unknown' as const, envelopes: [], iktvaRequired: false },
      tokensUsed: 10,
      latencyMs: 5,
    };
  }
  if (args.taskId === 'clarification-generator') {
    return {
      success: true as const,
      data: [
        {
          question: 'When is the expected go-live date?',
          priority: 'important' as const,
          category: 'missing_scope' as const,
          relatedRequirementIds: [],
          reasoning: 'Schedule unstated.',
        },
      ],
      tokensUsed: 10,
      latencyMs: 5,
    };
  }
  return { success: true as const, data: [], tokensUsed: 0, latencyMs: 0 };
}

beforeEach(() => {
  mockCallAI.mockReset();
  mockCallAI.mockImplementation(async (args: unknown) => aiRouter(args as CallAIArgs));

  mockReadExcelFile.mockReset();
  mockReadExcelFile.mockReturnValue({
    sheetNames: ['BoQ', 'Product_Vendors'],
    sheets: {
      BoQ: [
        ['Item', 'Description', 'Vendor', 'Qty'],
        ['1', 'Switch 48-port', 'Cisco', '10'],
      ],
      Product_Vendors: [
        ['Category', 'Vendor'],
        ['Switching', 'Cisco'],
        ['Firewall', 'Fortinet'],
      ],
    },
    fileName: 'BoQ.xlsx',
  });
});

describe('runE1 — orchestrator', () => {
  it('populates every output section and computes stats correctly', async () => {
    const result = await runE1({
      files: [
        { path: 'C:/rfp/Documents/Purchase_Requisition.docx', content: RFP_TEXT },
        { path: 'C:/rfp/Pricing/BoQ.xlsx' },
      ],
      clientName: 'Saudi Aramco',
      country: 'KSA',
      solutionContext: 'Cisco Catalyst-based campus refresh with FortiGate perimeter.',
    });

    expect(result.fileClassifications).toHaveLength(2);
    const docFile = result.fileClassifications.find((f) => f.filename.endsWith('.docx'));
    const xlsxFile = result.fileClassifications.find((f) => f.format === 'xlsx');
    expect(docFile).toBeDefined();
    expect(xlsxFile).toBeDefined();
    expect(xlsxFile?.subtype).toBe('boq_template');

    expect(result.missingDocuments.length).toBeGreaterThan(0);
    expect(
      result.missingDocuments.some((m) => /SACS-002/.test(m.referencedDoc)),
    ).toBe(true);

    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.requirements.some((r) => r.classification === 'mandatory')).toBe(true);
    expect(result.requirements[0].id).toBe('R-001');

    expect(result.riskFlags.some((r) => r.severity === 'critical')).toBe(true);
    expect(result.deadlines.length).toBeGreaterThan(0);

    expect(result.evalCriteria).toBeDefined();
    expect(result.evalCriteria.iktvaRequired).toBe(true);

    expect(result.vendorPreferences.length).toBeGreaterThan(0);
    expect(result.vendorPreferences.some((v) => v.vendor === 'Cisco')).toBe(true);

    expect(result.sectorDetection.sector).toBe('oil_and_gas');
    expect(result.frameworks.some((f) => f.id === 'NCA_ECC')).toBe(true);
    expect(result.frameworks.some((f) => f.id === 'SACS_002')).toBe(true);

    expect(result.complianceMatrix.rows.length).toBeGreaterThan(0);
    expect(result.clarifications.questions.length).toBeGreaterThan(0);

    expect(result.stats.totalFiles).toBe(2);
    expect(result.stats.totalRequirements).toBe(result.requirements.length);
    expect(result.stats.mandatoryCount).toBe(
      result.requirements.filter((r) => r.classification === 'mandatory').length,
    );
    expect(result.stats.criticalRisks).toBe(
      result.riskFlags.filter((r) => r.severity === 'critical').length,
    );

    // AI was used for ambiguous requirements ("should", "may") and for compliance status.
    const taskIds = mockCallAI.mock.calls.map((c) => (c[0] as CallAIArgs).taskId);
    expect(taskIds.some((id) => id.startsWith('requirements-extractor'))).toBe(true);
    expect(taskIds.some((id) => id.startsWith('compliance-matrix-status'))).toBe(true);

    // Excel reader was invoked for the .xlsx file only.
    expect(mockReadExcelFile).toHaveBeenCalledTimes(1);
    expect(mockReadExcelFile).toHaveBeenCalledWith('C:/rfp/Pricing/BoQ.xlsx');
  });

  it('handles empty inputs without throwing', async () => {
    const result = await runE1({ files: [] });
    expect(result.stats).toEqual({
      totalFiles: 0,
      totalRequirements: 0,
      mandatoryCount: 0,
      criticalRisks: 0,
    });
    expect(result.fileClassifications).toEqual([]);
    expect(result.requirements).toEqual([]);
    expect(result.frameworks.length).toBeGreaterThan(0); // default KSA frameworks
  });
});
