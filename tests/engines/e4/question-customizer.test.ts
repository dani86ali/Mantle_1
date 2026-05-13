import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import { customizeQuestions } from '@/engines/e4/question-customizer';
import type { E4Config, Question } from '@/engines/e4/types';

const mockCallAI = vi.mocked(callAI);

const BASE: Question[] = [
  {
    id: 'A1',
    section: 'A',
    text: 'Industry vertical and headcount.',
    priority: 'required',
    responseType: 'text',
  },
  {
    id: 'B1',
    section: 'B',
    text: 'WAN topology and circuits.',
    priority: 'required',
    responseType: 'text',
  },
];

const CONFIG: E4Config = {
  projectType: 'sd_wan',
  clientName: 'Acme',
  country: 'KSA',
  sector: 'finance',
};

beforeEach(() => {
  mockCallAI.mockReset();
});

describe('customizeQuestions — AI augments base questions', () => {
  it('appends 3 AI-suggested questions to the base list', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'ignored-1',
          text: 'Are SAMA cybersecurity controls already mapped to your WAN?',
          section: 'E',
          priority: 'required',
          responseType: 'text',
        },
        {
          id: 'ignored-2',
          text: 'Which branches require sovereign-cloud egress?',
          section: 'D',
          priority: 'recommended',
          responseType: 'multiselect',
        },
        {
          id: 'ignored-3',
          text: 'Are there branches in Riyadh data-residency zones?',
          section: 'E',
          priority: 'recommended',
          responseType: 'text',
          helpText: 'Apply NCA ECC localization rules.',
        },
      ],
      tokensUsed: 220,
      latencyMs: 70,
    });

    const out = await customizeQuestions(BASE, CONFIG);

    expect(out).toHaveLength(5);
    expect(out.slice(0, 2)).toEqual(BASE);
    expect(out[2].text).toContain('SAMA');
    expect(out[2].section).toBe('E');
    expect(out[4].helpText).toBe('Apply NCA ECC localization rules.');
  });

  it('assigns unique CQ-NNN ids to all AI-suggested questions', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [
        { id: 'x', text: 'q1', section: 'A', priority: 'required', responseType: 'text' },
        { id: 'x', text: 'q2', section: 'B', priority: 'required', responseType: 'text' },
        { id: 'x', text: 'q3', section: 'C', priority: 'required', responseType: 'text' },
        { id: 'x', text: 'q4', section: 'D', priority: 'optional', responseType: 'text' },
      ],
      tokensUsed: 200,
      latencyMs: 50,
    });

    const out = await customizeQuestions(BASE, CONFIG);

    const customIds = out.slice(BASE.length).map((q) => q.id);
    expect(customIds).toEqual(['CQ-001', 'CQ-002', 'CQ-003', 'CQ-004']);
    const all = new Set(out.map((q) => q.id));
    expect(all.size).toBe(out.length);
  });

  it('passes sector and country into the system prompt', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [
        { id: 'x', text: 'q', section: 'A', priority: 'required', responseType: 'text' },
        { id: 'x', text: 'q', section: 'A', priority: 'required', responseType: 'text' },
        { id: 'x', text: 'q', section: 'A', priority: 'required', responseType: 'text' },
      ],
      tokensUsed: 100,
      latencyMs: 30,
    });

    await customizeQuestions(BASE, CONFIG);

    const args = mockCallAI.mock.calls[0][0];
    expect(args.systemPrompt).toContain('finance');
    expect(args.systemPrompt).toContain('KSA');
    expect(args.systemPrompt).toContain(String(BASE.length));
  });
});

describe('customizeQuestions — graceful degradation', () => {
  it('returns base questions unchanged when AI fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const out = await customizeQuestions(BASE, CONFIG);

    expect(out).toEqual(BASE);
  });

  it('returns base questions unchanged when AI returns malformed payload (schema-rejected)', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'schema mismatch',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const out = await customizeQuestions(BASE, CONFIG);

    expect(out).toEqual(BASE);
  });
});
