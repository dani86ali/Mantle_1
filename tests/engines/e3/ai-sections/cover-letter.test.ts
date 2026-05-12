import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import {
  buildDeterministicBrief,
  generateCoverLetter,
  type CoverLetterInput,
} from '@/engines/e3/ai-sections/cover-letter';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

const baseInput: CoverLetterInput = {
  customerName: 'Saudi Aramco',
  projectName: 'Both-TA Network Refresh',
  tenantName: 'Nexus Global',
  contactName: 'Eng. Khalid Al-Otaibi',
  date: '12 May 2026',
  sector: 'Energy',
  keyStrengths: [
    'regional delivery experience in KSA',
    'Cisco Gold + Fortinet Expert certifications',
    '24x7 NOC presence in Dammam',
  ],
};

describe('cover-letter buildDeterministicBrief', () => {
  it('includes customer, project, tenant, date, and key strengths', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('Saudi Aramco');
    expect(brief).toContain('Both-TA Network Refresh');
    expect(brief).toContain('Nexus Global');
    expect(brief).toContain('12 May 2026');
    expect(brief).toContain('regional delivery experience in KSA');
    expect(brief).toContain('Cisco Gold + Fortinet Expert certifications');
  });

  it('addresses named contact when provided', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('Dear Eng. Khalid Al-Otaibi,');
  });

  it('falls back to procurement team when no contact', () => {
    const brief = buildDeterministicBrief({ ...baseInput, contactName: undefined });
    expect(brief).toContain('Dear Saudi Aramco Procurement Team,');
  });

  it('has cover letter heading and signature block', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('## Cover Letter');
    expect(brief).toContain('Sincerely,');
    expect(brief).toMatch(/Sincerely,\s+Nexus Global/);
  });
});

describe('generateCoverLetter — AI success path', () => {
  it('returns AI content when callAI succeeds', async () => {
    const aiContent =
      '## Cover Letter\n\n12 May 2026\n\nDear Eng. Khalid Al-Otaibi,\n\n' +
      'Nexus Global is honoured to submit this proposal to Saudi Aramco for the ' +
      'Both-TA Network Refresh. We bring deep regional experience and look forward to delivery.';
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: aiContent },
      tokensUsed: 800,
      latencyMs: 500,
    });

    const section = await generateCoverLetter(baseInput);

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(section.content).toBe(aiContent);
    expect(section.id).toBe(1);
    expect(section.title).toBe('Cover Letter / Introduction');
    expect(section.slug).toBe('cover_letter');
  });

  it('passes a system prompt mentioning tenant + customer and a taskId', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: 'X'.repeat(100) },
      tokensUsed: 100,
      latencyMs: 50,
    });

    await generateCoverLetter(baseInput);
    const args = mockCallAI.mock.calls[0][0];
    expect(args.systemPrompt).toContain('Nexus Global');
    expect(args.systemPrompt).toContain('Saudi Aramco');
    expect(args.systemPrompt).toMatch(/250 words/);
    expect(args.taskId).toContain('cover-letter');
    expect(args.prompt).toContain('Saudi Aramco');
    expect(args.prompt).toContain('Both-TA Network Refresh');
  });
});

describe('generateCoverLetter — AI failure fallback', () => {
  it('returns the deterministic brief when callAI fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'API timeout',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const section = await generateCoverLetter(baseInput);

    expect(section.id).toBe(1);
    expect(section.slug).toBe('cover_letter');
    expect(section.content).toContain('Saudi Aramco');
    expect(section.content).toContain('Both-TA Network Refresh');
    expect(section.content).toContain('Nexus Global');
    expect(section.content).toContain('12 May 2026');
    expect(section.content).toContain('## Cover Letter');
    expect(section.content).toContain('regional delivery experience in KSA');
  });
});

describe('generateCoverLetter — section metadata', () => {
  it('always returns id=1, slug=cover_letter, status=generated', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'x',
      retryCount: 1,
      fallback: 'engineer_review',
    });
    const section = await generateCoverLetter(baseInput);
    expect(section.id).toBe(1);
    expect(section.slug).toBe('cover_letter');
    expect(section.title).toBe('Cover Letter / Introduction');
    expect(section.status).toBe('generated');
    expect(section.generationMethod).toBe('ai');
  });
});
