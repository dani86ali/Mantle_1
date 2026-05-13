import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { enhancedGapDetection } from '@/engines/e4/gap-detector-ai';
import type { ClientResponse, Question } from '@/engines/e4/types';

const mockCallAI = vi.mocked(callAI);

const QUESTIONS: Question[] = [
  {
    id: 'A1',
    section: 'A',
    text: 'Industry vertical and headcount.',
    priority: 'required',
    responseType: 'text',
  },
  {
    id: 'A2',
    section: 'A',
    text: 'Business drivers.',
    priority: 'required',
    responseType: 'text',
  },
  {
    id: 'B1',
    section: 'B',
    text: 'WAN topology.',
    priority: 'required',
    responseType: 'text',
  },
];

const r = (
  questionId: string,
  answer: ClientResponse['answer'],
): ClientResponse => ({
  questionId,
  answer,
  source: 'structured',
  confidence: 1.0,
});

beforeEach(() => {
  mockCallAI.mockReset();
});

describe('enhancedGapDetection — deterministic findings', () => {
  it('flags missing required answers without AI input', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { additionalGaps: [], contradictions: [], unstatedAssumptions: [] },
      tokensUsed: 50,
      latencyMs: 10,
    });

    const responses = [r('A1', 'Banking, 2500 staff')];

    const out = await enhancedGapDetection(responses, QUESTIONS);

    expect(out.incompleteQuestions).toContain('A2');
    expect(out.incompleteQuestions).toContain('B1');
    expect(out.completeQuestions).toContain('A1');
  });
});

describe('enhancedGapDetection — AI augments the analysis', () => {
  it('merges AI contradictions, assumptions, and additional gaps', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        additionalGaps: [
          { questionId: 'A1', reason: 'Headcount stated but vertical sub-segment missing' },
        ],
        contradictions: [
          {
            questionIds: ['A1', 'B1'],
            description: 'Reports 14 sites but WAN topology only lists 8 circuits',
          },
        ],
        unstatedAssumptions: [
          'Existing identity provider will be reused',
          'Internet breakout occurs centrally in HQ',
        ],
      },
      tokensUsed: 200,
      latencyMs: 50,
    });

    const responses = [
      r('A1', 'Banking'),
      r('A2', 'Modernization'),
      r('B1', 'MPLS to 8 sites'),
    ];

    const out = await enhancedGapDetection(responses, QUESTIONS, 'campus refresh, KSA');

    expect(out.contradictions).toHaveLength(1);
    expect(out.contradictions[0].questionIds).toEqual(['A1', 'B1']);
    expect(out.unstatedAssumptions).toHaveLength(2);
    expect(out.vagueAnswers.some((v) => v.questionId === 'A1')).toBe(true);
  });

  it('passes project context into the prompt', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { additionalGaps: [], contradictions: [], unstatedAssumptions: [] },
      tokensUsed: 50,
      latencyMs: 10,
    });

    await enhancedGapDetection([r('A1', 'Banking')], QUESTIONS, 'SD-WAN for retail');

    const args = mockCallAI.mock.calls[0][0];
    expect(args.prompt).toContain('SD-WAN for retail');
  });
});

describe('enhancedGapDetection — graceful degradation', () => {
  it('preserves deterministic gaps when AI fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const responses = [r('A1', 'Banking')];

    const out = await enhancedGapDetection(responses, QUESTIONS);

    expect(out.incompleteQuestions).toContain('A2');
    expect(out.incompleteQuestions).toContain('B1');
    expect(out.contradictions).toEqual([]);
    expect(out.unstatedAssumptions).toEqual([]);
  });
});
