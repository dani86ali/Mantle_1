import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { analyzeEvalCriteria } from '@/engines/e1/eval-criteria-analyzer';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

describe('analyzeEvalCriteria — deterministic Excel sheet path', () => {
  it('parses weights from a sheet whose name matches /evaluation/', async () => {
    const sheetData = {
      'Technical Evaluation Questionnaire': [
        ['Category', 'Weight'],
        ['Technical', '60'],
        ['Commercial', '40'],
      ],
    };

    const result = await analyzeEvalCriteria([], sheetData);

    expect(mockCallAI).not.toHaveBeenCalled();
    expect(result.methodology).toBe('weighted_score');
    expect(result.envelopes).toHaveLength(2);
    expect(result.envelopes[0]).toMatchObject({ name: 'Technical', weight: 60 });
    expect(result.envelopes[1]).toMatchObject({ name: 'Commercial', weight: 40 });
    expect(result.source).toMatch(/^excel_sheet:/);
    expect(result.iktvaRequired).toBe(false);
  });

  it('detects sequential_envelope when sheet lists Administrative, Technical, Commercial', async () => {
    const sheetData = {
      Scoring: [
        ['Envelope', 'Weight', 'Threshold'],
        ['Administrative', '0', '0'],
        ['Technical', '70', '70'],
        ['Commercial', '30', '0'],
      ],
    };

    const result = await analyzeEvalCriteria([], sheetData);

    expect(mockCallAI).not.toHaveBeenCalled();
    expect(result.methodology).toBe('sequential_envelope');
    expect(result.envelopes).toHaveLength(3);
    expect(result.envelopes.find((e) => e.name === 'Technical')?.passThreshold).toBe(70);
  });

  it('flags iktvaRequired when an IKTVA row appears in the sheet', async () => {
    const sheetData = {
      Evaluation: [
        ['Category', 'Weight'],
        ['Technical', '50'],
        ['Commercial', '30'],
        ['IKTVA', '20'],
      ],
    };

    const result = await analyzeEvalCriteria([], sheetData);
    expect(result.iktvaRequired).toBe(true);
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

describe('analyzeEvalCriteria — regex path on text', () => {
  it("parses 'Technical 60% Commercial 40%' deterministically without AI", async () => {
    const result = await analyzeEvalCriteria([
      {
        filename: 'rfp.pdf',
        content:
          'The evaluation criteria are weighted as follows: Technical 60% Commercial 40%.',
      },
    ]);

    expect(mockCallAI).not.toHaveBeenCalled();
    expect(result.methodology).toBe('weighted_score');
    expect(result.envelopes.find((e) => e.name === 'Technical')?.weight).toBe(60);
    expect(result.envelopes.find((e) => e.name === 'Commercial')?.weight).toBe(40);
    expect(result.source).toBe('text_regex');
  });

  it('detects Aramco sequential envelope pattern from text', async () => {
    const text =
      'Bids will be evaluated in three envelopes. ' +
      'Envelope 1 (Administrative) is pass/fail. ' +
      'Envelope 2 (Technical) will be scored against the questionnaire; minimum passing score of 70%. ' +
      'Envelope 3 (Commercial) will only be opened if the technical envelope passes.';

    const result = await analyzeEvalCriteria([{ filename: 'rfp.pdf', content: text }]);

    expect(mockCallAI).not.toHaveBeenCalled();
    expect(result.methodology).toBe('sequential_envelope');
    expect(result.envelopes.map((e) => e.name)).toEqual([
      'Administrative',
      'Technical',
      'Commercial',
    ]);
    expect(result.passingThreshold).toBe(70);
    expect(result.envelopes[1].passThreshold).toBe(70);
    expect(result.source).toBe('text_regex');
  });

  it('detects IKTVA mention even without an explicit evaluation section', async () => {
    const text =
      'Bidders must achieve a minimum IKTVA score of 30% covering local content and Saudization.';
    const result = await analyzeEvalCriteria([{ filename: 'rfp.pdf', content: text }]);
    expect(mockCallAI).not.toHaveBeenCalled();
    expect(result.iktvaRequired).toBe(true);
    expect(result.methodology).toBe('unknown');
  });
});

describe('analyzeEvalCriteria — AI fallback for ambiguous text', () => {
  it('escalates to AI when an evaluation section exists but weights cannot be parsed', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        methodology: 'weighted_score',
        envelopes: [
          { name: 'Technical', weight: 70, passThreshold: 0, criteria: ['Architecture'] },
          { name: 'Commercial', weight: 30, passThreshold: 0, criteria: [] },
        ],
        iktvaRequired: false,
      },
      tokensUsed: 200,
      latencyMs: 50,
    });

    const text =
      'Section 5: Evaluation Criteria. ' +
      'The weighted score will be determined by combining technical merit and commercial value ' +
      'in proportions to be communicated to qualified bidders during the clarification phase.';

    const result = await analyzeEvalCriteria([{ filename: 'rfp.pdf', content: text }]);

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(result.methodology).toBe('weighted_score');
    expect(result.envelopes).toHaveLength(2);
    expect(result.source).toBe('ai_extraction');

    const callArgs = mockCallAI.mock.calls[0][0];
    expect(callArgs.prompt.length).toBeLessThan(3000);
    expect(callArgs.prompt).toContain('Evaluation Criteria');
  });

  it('returns engineer_review when AI also fails on ambiguous text', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const text =
      'Evaluation criteria will be communicated separately. Scoring methodology to follow.';

    const result = await analyzeEvalCriteria([{ filename: 'rfp.pdf', content: text }]);
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(result.methodology).toBe('unknown');
    expect(result.source).toBe('engineer_review');
  });
});

describe('analyzeEvalCriteria — empty / no-evaluation cases', () => {
  it("returns methodology 'unknown' with empty envelopes when no evaluation content is present", async () => {
    const result = await analyzeEvalCriteria([
      {
        filename: 'spec.pdf',
        content: 'This document describes the proposed network topology and hardware list.',
      },
    ]);

    expect(mockCallAI).not.toHaveBeenCalled();
    expect(result.methodology).toBe('unknown');
    expect(result.envelopes).toEqual([]);
    expect(result.iktvaRequired).toBe(false);
    expect(result.source).toBe('none');
  });

  it('handles empty input gracefully', async () => {
    const result = await analyzeEvalCriteria([]);
    expect(result.methodology).toBe('unknown');
    expect(result.envelopes).toEqual([]);
    expect(result.source).toBe('none');
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});
