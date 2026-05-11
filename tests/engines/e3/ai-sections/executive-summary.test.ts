import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import {
  buildDeterministicBrief,
  generateExecutiveSummary,
  type ExecSummaryInput,
} from '@/engines/e3/ai-sections/executive-summary';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

const baseInput: ExecSummaryInput = {
  customerName: 'Saudi Aramco',
  projectName: 'Both-TA Network Refresh',
  sector: 'Energy',
  country: 'Saudi Arabia',
  requirements: {
    mandatory: 42,
    optional: 18,
    total: 60,
    topRequirements: ['24x7 high availability', 'IPsec VPN', 'SD-WAN'],
  },
  solution: {
    deviceCount: 124,
    vendors: ['Cisco', 'Fortinet'],
    categories: ['routing', 'switching', 'security'],
    keyCapabilities: ['zero-trust segmentation', '40Gbps throughput'],
  },
  commercial: {
    grandTotal: 4_250_000,
    currency: 'SAR',
    tiers: { good: 3_800_000, better: 4_250_000, best: 5_100_000 },
  },
  compliance: {
    coveragePct: 96.7,
    frameworks: ['SAEP-99', 'NCA ECC-1:2018'],
  },
  timeline: '14 weeks',
};

describe('buildDeterministicBrief', () => {
  it('includes customer name, grand total, and framework names', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('Saudi Aramco');
    expect(brief).toContain('SAR 4,250,000.00');
    expect(brief).toContain('SAEP-99');
    expect(brief).toContain('NCA ECC-1:2018');
  });

  it('reflects all four structural paragraphs', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('### Challenge');
    expect(brief).toContain('### Proposed Solution');
    expect(brief).toContain('### Commercial Summary');
    expect(brief).toContain('### Compliance');
  });

  it('includes requirements counts, vendors, categories, and compliance coverage', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('60 requirements');
    expect(brief).toContain('42 mandatory');
    expect(brief).toContain('18 optional');
    expect(brief).toContain('Cisco');
    expect(brief).toContain('Fortinet');
    expect(brief).toContain('routing');
    expect(brief).toContain('96.7%');
  });

  it('renders three pricing tiers when supplied', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('SAR 3,800,000.00');
    expect(brief).toContain('SAR 5,100,000.00');
    expect(brief).toMatch(/Good[\s\S]*Better[\s\S]*Best/);
  });

  it('omits tiers paragraph when not supplied', () => {
    const noTiers: ExecSummaryInput = {
      ...baseInput,
      commercial: { grandTotal: 1_000_000, currency: 'AED' },
    };
    const brief = buildDeterministicBrief(noTiers);
    expect(brief).not.toMatch(/Good \(/);
    expect(brief).toContain('AED 1,000,000.00');
  });

  it('includes timeline when present', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('14 weeks');
  });
});

describe('generateExecutiveSummary — AI success path', () => {
  it('returns the AI-enhanced content when callAI succeeds', async () => {
    const aiContent =
      '## Executive Summary\n\nYour network will be transformed. ' +
      'This proposal addresses Saudi Aramco\'s requirements with a Cisco/Fortinet ' +
      'solution totalling SAR 4,250,000.00, achieving 96.7% compliance against ' +
      'SAEP-99 and NCA ECC-1:2018. Delivery: 14 weeks.';
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: aiContent, wordCount: 38 },
      tokensUsed: 1200,
      latencyMs: 800,
    });

    const section = await generateExecutiveSummary(baseInput);

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(section.content).toBe(aiContent);
    expect(section.id).toBe(2);
    expect(section.title).toBe('Executive Summary');
    expect(section.slug).toBe('executive_summary');
  });

  it('passes a system prompt mentioning second-person tone and ~500 words', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: 'X'.repeat(200), wordCount: 100 },
      tokensUsed: 100,
      latencyMs: 50,
    });

    await generateExecutiveSummary(baseInput);
    const args = mockCallAI.mock.calls[0][0];
    expect(args.systemPrompt).toMatch(/second-person/i);
    expect(args.systemPrompt).toMatch(/500 words/);
    expect(args.taskId).toContain('executive-summary');
    expect(args.prompt).toContain('Saudi Aramco');
    expect(args.prompt).toContain('SAR 4,250,000.00');
  });
});

describe('generateExecutiveSummary — AI failure fallback', () => {
  it('returns the deterministic brief when callAI fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'API timeout',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const section = await generateExecutiveSummary(baseInput);

    expect(section.id).toBe(2);
    expect(section.slug).toBe('executive_summary');
    expect(section.content).toContain('Saudi Aramco');
    expect(section.content).toContain('SAR 4,250,000.00');
    expect(section.content).toContain('SAEP-99');
    expect(section.content).toContain('NCA ECC-1:2018');
    expect(section.content).toContain('Cisco');
    expect(section.content).toContain('Fortinet');
    expect(section.content).toContain('124 device');
    expect(section.content).toContain('14 weeks');
    expect(section.content).toContain('## Executive Summary');
  });

  it('returns a fallback that contains all four structured paragraphs', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'schema rejection',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const section = await generateExecutiveSummary(baseInput);
    expect(section.content).toContain('### Challenge');
    expect(section.content).toContain('### Proposed Solution');
    expect(section.content).toContain('### Commercial Summary');
    expect(section.content).toContain('### Compliance');
  });
});

describe('generateExecutiveSummary — section metadata', () => {
  it('always returns id=2, slug=executive_summary, status=generated', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'x',
      retryCount: 1,
      fallback: 'engineer_review',
    });
    const section = await generateExecutiveSummary(baseInput);
    expect(section.id).toBe(2);
    expect(section.slug).toBe('executive_summary');
    expect(section.title).toBe('Executive Summary');
    expect(section.status).toBe('generated');
    expect(section.generationMethod).toBe('ai');
  });
});
