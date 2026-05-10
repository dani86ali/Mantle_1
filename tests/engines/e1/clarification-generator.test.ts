import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { generateClarifications } from '@/engines/e1/clarification-generator';
import type { Requirement } from '@/engines/e1/requirements-extractor';
import type { MissingDocument } from '@/engines/e1/missing-doc-detector';
import type { EvalCriteriaResult } from '@/engines/e1/eval-criteria-types';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
  // Default: AI returns nothing so deterministic-only assertions are clean.
  mockCallAI.mockResolvedValue({
    success: true,
    data: [],
    tokensUsed: 0,
    latencyMs: 1,
  });
});

function req(id: string, text: string, confidence = 0.9): Requirement {
  return {
    id,
    text,
    classification: 'mandatory',
    confidence,
    sourceFile: 'spec.pdf',
    indicators: ['shall'],
    relatedStandards: [],
  };
}

function missing(referencedDoc: string, severity: MissingDocument['severity']): MissingDocument {
  return {
    referencedDoc,
    referencedIn: 'rfp.pdf',
    pattern: 'aramco_standard',
    severity,
  };
}

const evalCriteria: EvalCriteriaResult = {
  methodology: 'sequential_envelope',
  envelopes: [
    { name: 'Technical', weight: 70, passThreshold: 75, criteria: [] },
    { name: 'Commercial', weight: 30, passThreshold: 0, criteria: [] },
  ],
  iktvaRequired: false,
  source: 'eval.xlsx',
};

describe('generateClarifications — deterministic missing-doc questions', () => {
  it('generates a critical question per critical/high missing doc without calling AI for that question', async () => {
    const result = await generateClarifications({
      requirements: [],
      missingDocs: [missing('SACS-002', 'critical'), missing('SAES-X-100', 'high')],
    });

    const docQuestions = result.questions.filter((q) => q.category === 'missing_document');
    expect(docQuestions).toHaveLength(2);
    for (const q of docQuestions) {
      expect(q.priority).toBe('critical');
      expect(q.question).toMatch(/Please provide/);
      expect(q.question).toContain('rfp.pdf');
    }
    expect(result.questions[0].id).toBe('CQ-001');
    expect(result.questions[1].id).toBe('CQ-002');
  });

  it('skips medium/low severity missing docs', async () => {
    const result = await generateClarifications({
      requirements: [],
      missingDocs: [missing('ISO 27001', 'medium'), missing('the attached', 'low')],
    });
    expect(result.questions.filter((q) => q.category === 'missing_document')).toHaveLength(0);
  });
});

describe('generateClarifications — deterministic low-confidence questions', () => {
  it('flags requirements with confidence < 0.7 as ambiguous (no AI needed for that question)', async () => {
    const result = await generateClarifications({
      requirements: [req('R-001', 'Vendor should ideally support clustering.', 0.6)],
      missingDocs: [],
    });

    const ambiguous = result.questions.filter((q) => q.category === 'ambiguous_requirement');
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0].priority).toBe('important');
    expect(ambiguous[0].relatedRequirementIds).toEqual(['R-001']);
    expect(ambiguous[0].question).toContain('R-001');
    expect(ambiguous[0].question).toContain('mandatory or optional');
  });

  it('does not flag high-confidence requirements', async () => {
    const result = await generateClarifications({
      requirements: [req('R-001', 'Vendor shall provide encryption.', 0.95)],
      missingDocs: [],
    });
    expect(result.questions.filter((q) => q.category === 'ambiguous_requirement')).toHaveLength(0);
  });
});

describe('generateClarifications — AI scope-gap questions', () => {
  it('adds AI-generated scope and commercial questions on top of deterministic ones', async () => {
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [
        {
          question: 'Please confirm the expected go-live date for production cutover.',
          priority: 'important',
          category: 'missing_scope',
          relatedRequirementIds: [],
          reasoning: 'Schedule is unstated.',
        },
        {
          question: 'Are payment terms net 30, net 60, or milestone-based?',
          priority: 'important',
          category: 'commercial',
          relatedRequirementIds: [],
          reasoning: 'Commercial terms ambiguous.',
        },
      ],
      tokensUsed: 200,
      latencyMs: 50,
    });

    const result = await generateClarifications({
      requirements: [req('R-001', 'Vendor shall implement the solution.', 0.9)],
      missingDocs: [missing('SACS-002', 'critical')],
      evalCriteria,
      projectContext: 'Saudi Aramco network refresh RFP.',
    });

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(result.questions.some((q) => q.category === 'missing_scope')).toBe(true);
    expect(result.questions.some((q) => q.category === 'commercial')).toBe(true);
    // Deterministic critical question still present.
    expect(result.questions.some((q) => q.category === 'missing_document')).toBe(true);

    // Sorted: critical before important.
    const priorities = result.questions.map((q) => q.priority);
    const firstImportant = priorities.indexOf('important');
    const lastCritical = priorities.lastIndexOf('critical');
    expect(lastCritical).toBeLessThan(firstImportant);
  });

  it('forwards requirement and missing-doc context to the AI prompt', async () => {
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [],
      tokensUsed: 0,
      latencyMs: 1,
    });

    await generateClarifications({
      requirements: [req('R-042', 'Vendor shall provide deployment.', 0.9)],
      missingDocs: [missing('SACS-002', 'critical')],
      evalCriteria,
      projectContext: 'Aramco refresh',
    });

    const args = mockCallAI.mock.calls[0][0];
    expect(args.prompt).toContain('R-042');
    expect(args.prompt).toContain('SACS-002');
    expect(args.prompt).toContain('Aramco refresh');
    expect(args.prompt).toContain('sequential_envelope');
  });
});

describe('generateClarifications — AI failure resilience', () => {
  it('still returns deterministic questions when AI fails', async () => {
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const result = await generateClarifications({
      requirements: [req('R-001', 'Vendor should maybe support X.', 0.55)],
      missingDocs: [missing('SACS-002', 'critical')],
    });

    expect(result.questions).toHaveLength(2);
    expect(result.stats.critical).toBe(1);
    expect(result.stats.important).toBe(1);
  });
});

describe('generateClarifications — empty inputs', () => {
  it('returns an empty list and does not call AI when nothing is provided', async () => {
    mockCallAI.mockReset();

    const result = await generateClarifications({
      requirements: [],
      missingDocs: [],
    });

    expect(result.questions).toEqual([]);
    expect(result.stats).toEqual({ total: 0, critical: 0, important: 0, niceToHave: 0 });
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

describe('generateClarifications — IDs, dedupe, stats', () => {
  it('auto-increments IDs as CQ-001, CQ-002, ...', async () => {
    const result = await generateClarifications({
      requirements: [
        req('R-001', 'Vendor should maybe deploy.', 0.55),
        req('R-002', 'Vendor should perhaps integrate.', 0.6),
      ],
      missingDocs: [missing('SACS-002', 'critical')],
    });
    expect(result.questions.map((q) => q.id)).toEqual(['CQ-001', 'CQ-002', 'CQ-003']);
  });

  it('deduplicates AI questions that closely match deterministic ones', async () => {
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [
        {
          question:
            'Please provide SACS-002 referenced in rfp.pdf — required for compliance assessment.',
          priority: 'critical',
          category: 'missing_document',
          relatedRequirementIds: [],
          reasoning: 'duplicate of deterministic',
        },
      ],
      tokensUsed: 50,
      latencyMs: 10,
    });

    const result = await generateClarifications({
      requirements: [],
      missingDocs: [missing('SACS-002', 'critical')],
    });

    expect(result.questions).toHaveLength(1);
  });

  it('computes priority stats correctly', async () => {
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [
        {
          question: 'Would training onsite be useful for the operations team?',
          priority: 'nice_to_have',
          category: 'missing_scope',
          relatedRequirementIds: [],
          reasoning: 'optional value-add',
        },
      ],
      tokensUsed: 50,
      latencyMs: 10,
    });

    const result = await generateClarifications({
      requirements: [req('R-001', 'Vendor should perhaps support X.', 0.55)],
      missingDocs: [missing('SACS-002', 'critical')],
    });

    expect(result.stats.total).toBe(3);
    expect(result.stats.critical).toBe(1);
    expect(result.stats.important).toBe(1);
    expect(result.stats.niceToHave).toBe(1);
  });
});
