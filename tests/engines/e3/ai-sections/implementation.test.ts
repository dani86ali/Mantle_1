import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import {
  buildDeterministicBrief,
  computeTimelineWeeks,
  generateImplementation,
  type ImplementationInput,
} from '@/engines/e3/ai-sections/implementation';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

const baseInput: ImplementationInput = {
  projectName: 'Both-TA Network Refresh',
  deviceCount: 60,
  siteCount: 4,
  migrationApproach: 'phased',
};

describe('computeTimelineWeeks', () => {
  it('returns 8 for small (<20)', () => {
    expect(computeTimelineWeeks(5)).toBe(8);
    expect(computeTimelineWeeks(19)).toBe(8);
  });
  it('returns 12 for medium (20-100)', () => {
    expect(computeTimelineWeeks(20)).toBe(12);
    expect(computeTimelineWeeks(60)).toBe(12);
    expect(computeTimelineWeeks(100)).toBe(12);
  });
  it('returns 16 for large (>100)', () => {
    expect(computeTimelineWeeks(101)).toBe(16);
    expect(computeTimelineWeeks(500)).toBe(16);
  });
});

describe('buildDeterministicBrief', () => {
  it('contains 7 default phases', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('Initiation');
    expect(brief).toContain('Design Finalization');
    expect(brief).toContain('Staging');
    expect(brief).toContain('Implementation');
    expect(brief).toContain('Testing');
    expect(brief).toContain('Documentation & KT');
    expect(brief).toContain('Hypercare');
  });

  it('renders 7 numbered phase rows in the table', () => {
    const brief = buildDeterministicBrief(baseInput);
    for (let i = 1; i <= 7; i++) {
      expect(brief).toMatch(new RegExp(`\\| ${i} \\|`));
    }
  });

  it('reflects timeline 8 weeks for small project', () => {
    const brief = buildDeterministicBrief({ ...baseInput, deviceCount: 10 });
    expect(brief).toContain('8-week');
    expect(brief).toContain('small');
  });

  it('reflects timeline 12 weeks for medium project', () => {
    const brief = buildDeterministicBrief({ ...baseInput, deviceCount: 60 });
    expect(brief).toContain('12-week');
    expect(brief).toContain('medium');
  });

  it('reflects timeline 16 weeks for large project', () => {
    const brief = buildDeterministicBrief({ ...baseInput, deviceCount: 250 });
    expect(brief).toContain('16-week');
    expect(brief).toContain('large');
  });

  it('honours explicit timelineWeeks override', () => {
    const brief = buildDeterministicBrief({ ...baseInput, deviceCount: 60, timelineWeeks: 20 });
    expect(brief).toContain('20-week');
  });

  it('mentions PPDIOO methodology and governance', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('PPDIOO');
    expect(brief).toContain('Weekly status meetings');
    expect(brief).toContain('change-control');
    expect(brief).toContain('RACI');
  });

  it('includes default team roles', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('Project Manager');
    expect(brief).toContain('Solution Architect');
    expect(brief).toContain('Senior Network Engineer');
    expect(brief).toContain('Junior Network Engineer');
  });

  it('reflects custom phases when provided', () => {
    const brief = buildDeterministicBrief({
      ...baseInput,
      phases: ['Discovery', 'Build', 'Cutover'],
    });
    expect(brief).toContain('Discovery');
    expect(brief).toContain('Build');
    expect(brief).toContain('Cutover');
    expect(brief).not.toContain('Hypercare');
  });

  it('mentions migration approach narrative', () => {
    const cutover = buildDeterministicBrief({ ...baseInput, migrationApproach: 'cutover' });
    expect(cutover).toContain('cutover');
    const parallel = buildDeterministicBrief({ ...baseInput, migrationApproach: 'parallel' });
    expect(parallel).toContain('parallel-run');
  });
});

describe('generateImplementation — AI success path', () => {
  it('returns AI content when callAI succeeds', async () => {
    const aiContent = '## Implementation Approach\n\n' + 'X'.repeat(200);
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: aiContent },
      tokensUsed: 1000,
      latencyMs: 500,
    });

    const section = await generateImplementation(baseInput);
    expect(section.content).toBe(aiContent);
    expect(section.id).toBe(6);
    expect(section.slug).toBe('implementation');
    expect(section.title).toBe('Implementation Approach');
  });

  it('passes a system prompt mentioning 600 words and project delivery manager', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: 'Y'.repeat(200) },
      tokensUsed: 100,
      latencyMs: 50,
    });

    await generateImplementation(baseInput);
    const args = mockCallAI.mock.calls[0][0];
    expect(args.systemPrompt).toMatch(/600 words/);
    expect(args.systemPrompt).toMatch(/project delivery manager/i);
    expect(args.taskId).toContain('implementation');
  });
});

describe('generateImplementation — AI failure fallback', () => {
  it('returns deterministic brief when callAI fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'timeout',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const section = await generateImplementation(baseInput);
    expect(section.id).toBe(6);
    expect(section.slug).toBe('implementation');
    expect(section.content).toContain('## Implementation Approach');
    expect(section.content).toContain('PPDIOO');
    expect(section.content).toContain('Initiation');
    expect(section.content).toContain('Hypercare');
  });

  it('fallback preserves project size classification', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'x',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const section = await generateImplementation({ ...baseInput, deviceCount: 250 });
    expect(section.content).toContain('16-week');
    expect(section.content).toContain('large');
  });
});

describe('generateImplementation — section metadata', () => {
  it('returns id=6, slug=implementation, status=generated, method=semi', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'x',
      retryCount: 1,
      fallback: 'engineer_review',
    });
    const section = await generateImplementation(baseInput);
    expect(section.id).toBe(6);
    expect(section.slug).toBe('implementation');
    expect(section.title).toBe('Implementation Approach');
    expect(section.status).toBe('generated');
    expect(section.generationMethod).toBe('semi');
  });
});
