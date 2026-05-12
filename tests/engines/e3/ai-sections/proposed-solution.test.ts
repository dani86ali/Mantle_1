import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import {
  buildDeterministicBrief,
  generateProposedSolution,
  type SolutionInput,
} from '@/engines/e3/ai-sections/proposed-solution';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

const baseInput: SolutionInput = {
  customerName: 'Saudi Aramco',
  projectName: 'Both-TA Network Refresh',
  requirements: {
    topRequirements: ['24x7 high availability', 'IPsec VPN', 'SD-WAN'],
  },
  devices: [
    { model: 'C9300-48P', qty: 24, category: 'switching', vendor: 'Cisco' },
    { model: 'C9500-40X', qty: 4, category: 'switching', vendor: 'Cisco' },
    { model: 'C9166I', qty: 60, category: 'wireless', vendor: 'Cisco' },
    { model: 'FG-201F', qty: 2, category: 'security', vendor: 'Fortinet' },
  ],
  vendorStack: ['Cisco', 'Fortinet'],
  sectorContext: 'Energy-sector OT/IT segmentation per NCA OT-CSCC.',
};

describe('proposed-solution buildDeterministicBrief', () => {
  it('includes customer name, project name, devices, and vendors', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('Saudi Aramco');
    expect(brief).toContain('Both-TA Network Refresh');
    expect(brief).toContain('C9300-48P');
    expect(brief).toContain('FG-201F');
    expect(brief).toContain('Cisco');
    expect(brief).toContain('Fortinet');
  });

  it('renders devices grouped by category', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('### Switching');
    expect(brief).toContain('### Wireless');
    expect(brief).toContain('### Security');
  });

  it('preserves device quantities', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('×24');
    expect(brief).toContain('×60');
    expect(brief).toContain('×2');
  });

  it('includes the three design principles', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('hierarchical');
    expect(brief).toContain('resilient');
    expect(brief).toContain('secure-by-design');
  });

  it('includes top requirements and sector context when provided', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('24x7 high availability');
    expect(brief).toContain('IPsec VPN');
    expect(brief).toContain('SD-WAN');
    expect(brief).toContain('NCA OT-CSCC');
  });

  it('uses default rationale when designRationale is omitted', () => {
    const brief = buildDeterministicBrief(baseInput);
    expect(brief).toContain('Vendor selection prioritises');
  });

  it('uses provided designRationale when present', () => {
    const brief = buildDeterministicBrief({
      ...baseInput,
      designRationale: 'Custom rationale for Aramco standardisation.',
    });
    expect(brief).toContain('Custom rationale for Aramco standardisation.');
    expect(brief).not.toContain('Vendor selection prioritises');
  });
});

describe('generateProposedSolution — AI success path', () => {
  it('returns AI content when callAI succeeds', async () => {
    const aiContent =
      '## Proposed Solution\n\n' + 'X'.repeat(300) +
      '\nThe solution deploys Cisco C9300-48P switches and Fortinet FG-201F firewalls.';
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: aiContent },
      tokensUsed: 2400,
      latencyMs: 1500,
    });

    const section = await generateProposedSolution(baseInput);

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(section.content).toBe(aiContent);
    expect(section.id).toBe(4);
    expect(section.title).toBe('Proposed Solution');
    expect(section.slug).toBe('proposed_solution');
  });

  it('passes a system prompt mentioning architect role, ~800 words, and WHY', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: 'X'.repeat(300) },
      tokensUsed: 100,
      latencyMs: 50,
    });

    await generateProposedSolution(baseInput);
    const args = mockCallAI.mock.calls[0][0];
    expect(args.systemPrompt).toMatch(/architect/i);
    expect(args.systemPrompt).toMatch(/800 words/);
    expect(args.systemPrompt).toMatch(/WHY/);
    expect(args.taskId).toContain('proposed-solution');
    expect(args.prompt).toContain('Saudi Aramco');
    expect(args.prompt).toContain('C9300-48P');
  });
});

describe('generateProposedSolution — AI failure fallback', () => {
  it('returns the deterministic brief when callAI fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'API timeout',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const section = await generateProposedSolution(baseInput);

    expect(section.id).toBe(4);
    expect(section.slug).toBe('proposed_solution');
    expect(section.content).toContain('Saudi Aramco');
    expect(section.content).toContain('## Proposed Solution');
    expect(section.content).toContain('C9300-48P');
    expect(section.content).toContain('FG-201F');
    expect(section.content).toContain('hierarchical');
    expect(section.content).toContain('resilient');
    expect(section.content).toContain('secure-by-design');
  });
});

describe('generateProposedSolution — section metadata', () => {
  it('always returns id=4, slug=proposed_solution, status=generated', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'x',
      retryCount: 1,
      fallback: 'engineer_review',
    });
    const section = await generateProposedSolution(baseInput);
    expect(section.id).toBe(4);
    expect(section.slug).toBe('proposed_solution');
    expect(section.title).toBe('Proposed Solution');
    expect(section.status).toBe('generated');
    expect(section.generationMethod).toBe('ai');
  });
});
