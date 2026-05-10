import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { extractRequirements } from '@/engines/e1/requirements-extractor';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

describe('extractRequirements — deterministic high-confidence paths', () => {
  it("'Vendor shall provide ...' is mandatory at high confidence with no AI call", async () => {
    const result = await extractRequirements(
      'Vendor shall provide 24x7 technical support with 4-hour response time.',
      'requirements.pdf',
    );
    expect(result.requirements).toHaveLength(1);
    const r = result.requirements[0];
    expect(r.classification).toBe('mandatory');
    expect(r.confidence).toBeGreaterThan(0.8);
    expect(r.id).toBe('R-001');
    expect(r.sourceFile).toBe('requirements.pdf');
    expect(r.indicators).toContain('shall');
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("'the solution can optionally ...' is optional at high confidence with no AI call", async () => {
    const result = await extractRequirements(
      'The solution can optionally include a redundant power supply.',
      'spec.pdf',
    );
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].classification).toBe('optional');
    expect(result.requirements[0].confidence).toBeGreaterThan(0.8);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("conditional 'unless otherwise specified' classifies deterministically", async () => {
    const result = await extractRequirements(
      'Unless otherwise specified, all documentation shall be in English.',
      'tc.pdf',
    );
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].classification).toBe('conditional');
    expect(result.requirements[0].confidence).toBeGreaterThan(0.8);
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

describe('extractRequirements — AI fallback path for ambiguous sentences', () => {
  it("'should ideally support' is ambiguous and escalates to AI", async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        classification: 'optional',
        confidence: 0.72,
        reasoning: 'Soft language ("should ideally") signals preference, not obligation.',
      },
      tokensUsed: 80,
      latencyMs: 30,
    });

    const result = await extractRequirements(
      'The solution should ideally support future expansion to 10000 users.',
      'spec.pdf',
    );

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].classification).toBe('optional');
    expect(result.requirements[0].confidence).toBe(0.72);
    expect(result.requirements[0].indicators).toContain('ai-classified');

    const callArgs = mockCallAI.mock.calls[0][0];
    expect(callArgs.prompt).toContain('should ideally support');
  });

  it('falls back to initial regex classification when AI fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const result = await extractRequirements(
      'The solution should ideally support future expansion.',
      'spec.pdf',
    );

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].classification).toBe('optional');
    expect(result.requirements[0].confidence).toBeCloseTo(0.65, 2);
  });
});

describe('extractRequirements — exclusions and skips', () => {
  it("negated 'shall not be required' is excluded", async () => {
    const result = await extractRequirements(
      'The vendor shall not be required to provide on-site training.',
      'tc.pdf',
    );
    expect(result.requirements).toHaveLength(0);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('sentence with no requirement language is skipped', async () => {
    const result = await extractRequirements(
      'This document describes the proposed network topology.',
      'spec.pdf',
    );
    expect(result.requirements).toHaveLength(0);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('legitimate prohibition ("shall not subcontract") still classifies as mandatory', async () => {
    const result = await extractRequirements(
      'Vendor shall not subcontract any portion of the work without written approval.',
      'tc.pdf',
    );
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].classification).toBe('mandatory');
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

describe('extractRequirements — standard reference extraction', () => {
  it('extracts SACS-002 reference from a mandatory sentence', async () => {
    const result = await extractRequirements(
      'Vendor shall comply with SACS-002 cybersecurity requirements.',
      'spec.pdf',
    );
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].relatedStandards).toContain('SACS-002');
  });

  it('extracts ISO 27001 reference', async () => {
    const result = await extractRequirements(
      'The vendor must align with ISO 27001:2022 controls.',
      'spec.pdf',
    );
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].relatedStandards.some((s) => s.includes('ISO'))).toBe(true);
  });

  it('returns empty relatedStandards when none referenced', async () => {
    const result = await extractRequirements(
      'Vendor shall provide weekly status reports.',
      'spec.pdf',
    );
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].relatedStandards).toEqual([]);
  });
});

describe('extractRequirements — IDs and stats', () => {
  it('auto-increments IDs as R-001, R-002, ...', async () => {
    const text =
      'Vendor shall provide installation services. ' +
      'The system must support IPv6. ' +
      'It is mandatory that the solution be highly available.';
    const result = await extractRequirements(text, 'spec.pdf');
    expect(result.requirements.map((r) => r.id)).toEqual(['R-001', 'R-002', 'R-003']);
  });

  it('computes stats correctly across mixed classifications', async () => {
    const text =
      'Vendor shall provide installation. ' +
      'Operator training is recommended for all sites. ' +
      'If applicable, vendor shall comply with IKTVA.';
    const result = await extractRequirements(text, 'spec.pdf');

    expect(result.stats.total).toBe(3);
    expect(result.stats.mandatory).toBe(1);
    expect(result.stats.optional).toBe(1);
    expect(result.stats.conditional).toBe(1);
    expect(result.stats.lowConfidence).toBe(0);
  });

  it('counts low-confidence (<0.7) requirements in stats', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        classification: 'optional',
        confidence: 0.6,
        reasoning: 'Soft preference language.',
      },
      tokensUsed: 50,
      latencyMs: 20,
    });

    const result = await extractRequirements(
      'The solution should ideally support clustering.',
      'spec.pdf',
    );
    expect(result.stats.lowConfidence).toBe(1);
  });
});
