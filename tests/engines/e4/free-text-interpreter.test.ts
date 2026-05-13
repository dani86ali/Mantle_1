import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { interpretFreeText } from '@/engines/e4/free-text-interpreter';
import type { Question } from '@/engines/e4/types';

const mockCallAI = vi.mocked(callAI);

// Questions chosen so keyword overlap matches some sentences but not others.
const QUESTIONS: Question[] = [
  {
    id: 'A1',
    section: 'A',
    text: 'Industry vertical and headcount and sites in scope.',
    priority: 'required',
    responseType: 'text',
  },
  {
    id: 'B1',
    section: 'B',
    text: 'WAN topology and circuits and carrier bandwidth contract.',
    priority: 'required',
    responseType: 'text',
  },
  {
    id: 'D4',
    section: 'D',
    text: 'Required SLAs availability latency RTO RPO.',
    priority: 'required',
    responseType: 'text',
  },
];

beforeEach(() => {
  mockCallAI.mockReset();
});

describe('interpretFreeText — deterministic-first', () => {
  it('keyword-matched sentences become free_text responses with confidence 1.0', async () => {
    mockCallAI.mockResolvedValue({
      success: true,
      data: [],
      tokensUsed: 10,
      latencyMs: 5,
    });

    const text =
      'Our industry vertical is banking with 2500 headcount across 14 sites in scope.';

    const out = await interpretFreeText(text, QUESTIONS);

    const a1 = out.find((r) => r.questionId === 'A1');
    expect(a1).toBeDefined();
    expect(a1?.source).toBe('free_text');
    expect(a1?.confidence).toBe(1.0);
    expect(a1?.answer).toContain('banking');
  });

  it('does not call AI when every question is matched deterministically', async () => {
    const text = [
      'Our industry vertical is banking with 2500 headcount across 14 sites in scope.',
      'WAN topology is MPLS with carrier bandwidth on a three year contract.',
      'Required SLAs are 99.99 availability latency under 50ms RTO 4h RPO 1h.',
    ].join(' ');

    await interpretFreeText(text, QUESTIONS);

    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

describe('interpretFreeText — AI fills unmatched questions', () => {
  it('unmatched questions are sent to AI; null answers are skipped', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [
        { questionId: 'B1', answer: 'MPLS via STC, 100Mbps per site', confidence: 0.7 },
        { questionId: 'D4', answer: null, confidence: 0.2 },
      ],
      tokensUsed: 80,
      latencyMs: 20,
    });

    // Free-form text with no keyword overlap with any question.
    const text = 'Everything totally vague — no specifics anywhere.';

    const out = await interpretFreeText(text, QUESTIONS);

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const aiAnswers = out.filter((r) => r.source === 'ai_interpreted');
    expect(aiAnswers).toHaveLength(1);
    expect(aiAnswers[0].questionId).toBe('B1');
    expect(aiAnswers[0].confidence).toBe(0.7);
  });

  it('batches AI calls in groups of 10 questions', async () => {
    const many: Question[] = Array.from({ length: 23 }, (_, i) => ({
      id: `Q${i + 1}`,
      section: 'A',
      text: `placeholder ${i + 1}`,
      priority: 'optional' as const,
      responseType: 'text' as const,
    }));

    mockCallAI.mockResolvedValue({
      success: true,
      data: [],
      tokensUsed: 10,
      latencyMs: 5,
    });

    await interpretFreeText('totally unrelated freeform paragraph here.', many);

    expect(mockCallAI).toHaveBeenCalledTimes(3);
  });
});

describe('interpretFreeText — graceful degradation', () => {
  it('returns only deterministic matches when AI fails', async () => {
    mockCallAI.mockResolvedValue({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const text = 'Our industry vertical is banking with 2500 headcount across 14 sites in scope.';

    const out = await interpretFreeText(text, QUESTIONS);

    expect(mockCallAI).toHaveBeenCalled();
    expect(out.every((r) => r.source !== 'ai_interpreted')).toBe(true);
    expect(out.find((r) => r.questionId === 'A1')).toBeDefined();
  });
});
