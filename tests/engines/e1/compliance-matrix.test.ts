import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { generateComplianceMatrix } from '@/engines/e1/compliance-matrix';
import type { Requirement } from '@/engines/e1/requirements-extractor';
import type { SelectedFramework } from '@/engines/e1/framework-selector';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

const NCA_ECC: SelectedFramework = {
  id: 'NCA_ECC',
  name: 'NCA ECC-2:2024',
  source: 'sector_mapping',
  priority: 'primary',
};
const ISO_27001: SelectedFramework = {
  id: 'ISO_27001',
  name: 'ISO 27001:2022',
  source: 'sector_mapping',
  priority: 'secondary',
};

function req(id: string, text: string): Requirement {
  return {
    id,
    text,
    classification: 'mandatory',
    confidence: 0.9,
    sourceFile: 'spec.pdf',
    indicators: ['shall'],
    relatedStandards: [],
  };
}

describe('generateComplianceMatrix — Step 10a keyword matching', () => {
  it('maps an "encryption" requirement to NCA ECC 2-8 and ISO A.8.24', async () => {
    const requirements = [
      req('R-001', 'Vendor shall implement AES-256 encryption for all data at rest.'),
    ];

    const result = await generateComplianceMatrix(requirements, [NCA_ECC, ISO_27001]);

    expect(mockCallAI).not.toHaveBeenCalled();
    const ncaRow = result.rows.find((r) => r.frameworkId === 'NCA_ECC');
    const isoRow = result.rows.find((r) => r.frameworkId === 'ISO_27001');
    expect(ncaRow?.controlId).toBe('2-8');
    expect(ncaRow?.controlName).toMatch(/Cryptography/i);
    expect(isoRow?.controlId).toBe('A.8.24');
    expect(ncaRow?.requirementId).toBe('R-001');
    expect(ncaRow?.tpSection).toBe('§10');
  });

  it('produces a row per (requirement, framework, control) pair', async () => {
    const requirements = [
      req('R-001', 'The solution shall provide network security and firewall protection.'),
    ];
    const result = await generateComplianceMatrix(requirements, [NCA_ECC, ISO_27001]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.controlId).sort()).toEqual(['2-5', 'A.8.20']);
  });
});

describe('generateComplianceMatrix — Step 10b status assignment', () => {
  it('defaults to Partially Compliant when no solutionContext is provided', async () => {
    const requirements = [
      req('R-001', 'Bidder shall maintain audit logging for one year.'),
      req('R-002', 'Vendor must perform vulnerability scans monthly.'),
    ];
    const result = await generateComplianceMatrix(requirements, [NCA_ECC]);

    expect(mockCallAI).not.toHaveBeenCalled();
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.status).toBe('Partially Compliant');
      expect(row.notes).toBe('Requires solution detail review');
    }
    expect(result.stats.partial).toBe(result.rows.length);
  });

  it('calls AI in batches and applies returned status/notes', async () => {
    const requirements = [
      req('R-001', 'Vendor shall implement encryption of data in transit.'),
      req('R-002', 'Vendor shall provide centralized audit logging.'),
    ];

    mockCallAI.mockImplementationOnce(async ({ prompt }) => {
      // The prompt should include the synthetic composite requirementId we send.
      expect(prompt).toContain('R-001#NCA_ECC#2-8');
      expect(prompt).toContain('R-002#NCA_ECC#2-12');
      return {
        success: true,
        data: [
          {
            requirementId: 'R-001#NCA_ECC#2-8',
            status: 'Compliant',
            notes: 'TLS 1.3 in transit + AES-256 at rest covered.',
          },
          {
            requirementId: 'R-002#NCA_ECC#2-12',
            status: 'Alternative Proposed',
            notes: 'Logs centralized via Splunk Cloud, equivalent retention.',
          },
        ],
        tokensUsed: 300,
        latencyMs: 80,
      };
    });

    const result = await generateComplianceMatrix(
      requirements,
      [NCA_ECC],
      'Proposed solution: Cisco Catalyst 9300 with TLS 1.3, AES-256 storage, Splunk Cloud SIEM.',
    );

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const r1 = result.rows.find((r) => r.requirementId === 'R-001');
    const r2 = result.rows.find((r) => r.requirementId === 'R-002');
    expect(r1?.status).toBe('Compliant');
    expect(r2?.status).toBe('Alternative Proposed');
    expect(result.stats.compliant).toBe(1);
    expect(result.stats.alternative).toBe(1);
  });

  it('chunks pairs into batches of 5', async () => {
    const requirements = Array.from({ length: 6 }, (_, i) =>
      req(`R-${String(i + 1).padStart(3, '0')}`, `Vendor shall implement encryption layer ${i}.`),
    );

    mockCallAI.mockResolvedValue({
      success: true,
      data: [],
      tokensUsed: 50,
      latencyMs: 20,
    });

    await generateComplianceMatrix(requirements, [NCA_ECC], 'Solution: TLS everywhere.');

    expect(mockCallAI).toHaveBeenCalledTimes(2);
  });

  it('falls back to Partially Compliant when the AI call fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const result = await generateComplianceMatrix(
      [req('R-001', 'Vendor shall encrypt data with AES-256.')],
      [NCA_ECC],
      'Some solution context here.',
    );

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(result.rows[0].status).toBe('Partially Compliant');
    expect(result.rows[0].notes).toBe('Requires solution detail review');
  });
});

describe('generateComplianceMatrix — Step 10c gap analysis', () => {
  it('detects orphan requirements with no keyword match', async () => {
    const requirements = [
      req('R-001', 'Vendor shall provide on-site spare parts inventory within 24 hours.'),
      req('R-002', 'The solution shall implement encryption for data at rest.'),
    ];
    const result = await generateComplianceMatrix(requirements, [NCA_ECC]);

    expect(result.gaps.orphanRequirements).toHaveLength(1);
    expect(result.gaps.orphanRequirements[0].requirementId).toBe('R-001');
    expect(result.rows.find((r) => r.requirementId === 'R-002')).toBeDefined();
    expect(result.rows.find((r) => r.requirementId === 'R-001')).toBeUndefined();
  });

  it('detects coverage gaps for framework controls with no matching requirement', async () => {
    const requirements = [
      req('R-001', 'Vendor shall implement encryption of data in transit and at rest.'),
    ];
    const result = await generateComplianceMatrix(requirements, [NCA_ECC]);

    // 12 NCA ECC controls in the table; only 1 (encryption / 2-8) matched → 11 coverage gaps.
    expect(result.gaps.coverageGaps.length).toBeGreaterThan(0);
    const matchedControl = result.gaps.coverageGaps.find((g) => g.controlId === '2-8');
    expect(matchedControl).toBeUndefined();
    const networkSecurityGap = result.gaps.coverageGaps.find((g) => g.controlId === '2-5');
    expect(networkSecurityGap).toBeDefined();
    expect(networkSecurityGap?.frameworkId).toBe('NCA_ECC');
  });
});
