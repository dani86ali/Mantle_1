import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import {
  buildDeterministicBrief,
  buildMenaItems,
  generateScope,
  type ScopeInput,
} from '@/engines/e3/ai-sections/scope-customizer';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

const ksaInput: ScopeInput = {
  projectName: 'Both-TA Network Refresh',
  customerName: 'Saudi Aramco',
  siteCount: 4,
  country: 'Saudi Arabia',
  sector: 'Energy',
  vendorStack: ['Cisco', 'Fortinet'],
};

describe('buildMenaItems', () => {
  it('returns Saudization / Etimad / NCA ECC for KSA', () => {
    const items = buildMenaItems('Saudi Arabia', 'Energy');
    const joined = items.join('\n');
    expect(joined).toMatch(/Saudization/);
    expect(joined).toMatch(/Etimad/);
    expect(joined).toMatch(/NCA ECC/);
  });

  it('returns ICV / NESA for UAE', () => {
    const items = buildMenaItems('UAE', 'Banking');
    const joined = items.join('\n');
    expect(joined).toMatch(/ICV/);
    expect(joined).toMatch(/NESA/);
  });

  it('adds Arabic-language item for KSA government sector', () => {
    const items = buildMenaItems('Saudi Arabia', 'Government');
    const joined = items.join('\n');
    expect(joined).toMatch(/Arabic/);
  });

  it('adds Arabic-language item for UAE government sector', () => {
    const items = buildMenaItems('UAE', 'Public Sector');
    const joined = items.join('\n');
    expect(joined).toMatch(/Arabic/);
  });

  it('omits Arabic item for non-government KSA sector', () => {
    const items = buildMenaItems('Saudi Arabia', 'Energy');
    const joined = items.join('\n');
    expect(joined).not.toMatch(/Arabic/);
  });

  it('returns empty array for non-MENA country', () => {
    expect(buildMenaItems('United Kingdom', 'Banking')).toEqual([]);
  });
});

describe('buildDeterministicBrief', () => {
  it('includes baseline boilerplate assumptions / exclusions / dependencies', () => {
    const brief = buildDeterministicBrief(ksaInput);
    expect(brief).toContain('ASSUMPTIONS');
    expect(brief).toContain('Customer provides rack space');
    expect(brief).toContain('EXCLUSIONS');
    expect(brief).toContain('Structured cabling');
    expect(brief).toContain('DEPENDENCIES');
    expect(brief).toContain('HLD/LLD');
  });

  it('renders boilerplate tenantName placeholder with a default', () => {
    const brief = buildDeterministicBrief(ksaInput);
    expect(brief).not.toContain('{{tenantName}}');
  });

  it('includes KSA MENA-specific items by default', () => {
    const brief = buildDeterministicBrief(ksaInput);
    expect(brief).toContain('Saudization');
    expect(brief).toContain('Etimad');
    expect(brief).toContain('NCA ECC');
  });

  it('appends project-specific assumptions when provided', () => {
    const brief = buildDeterministicBrief({
      ...ksaInput,
      projectSpecificAssumptions: ['Customer provides bastion host for jumpbox access'],
    });
    expect(brief).toContain('Project-Specific Assumptions');
    expect(brief).toContain('bastion host');
  });

  it('appends project-specific exclusions when provided', () => {
    const brief = buildDeterministicBrief({
      ...ksaInput,
      projectSpecificExclusions: ['End-user device support for laptops and mobiles'],
    });
    expect(brief).toContain('Project-Specific Exclusions');
    expect(brief).toContain('End-user device support');
  });

  it('omits project-specific sections when none provided', () => {
    const brief = buildDeterministicBrief(ksaInput);
    expect(brief).not.toContain('Project-Specific Assumptions');
    expect(brief).not.toContain('Project-Specific Exclusions');
  });

  it('starts with the section heading', () => {
    const brief = buildDeterministicBrief(ksaInput);
    expect(brief.startsWith('## Scope, Assumptions, Exclusions, Dependencies')).toBe(true);
  });
});

describe('generateScope — AI success path', () => {
  it('returns AI content when callAI succeeds', async () => {
    const aiContent =
      '## Scope, Assumptions, Exclusions, Dependencies\n\n' +
      'Refined scope narrative covering Saudi Aramco and NCA ECC alignment.';
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: aiContent },
      tokensUsed: 800,
      latencyMs: 400,
    });

    const section = await generateScope(ksaInput);
    expect(section.content).toBe(aiContent);
    expect(section.id).toBe(9);
    expect(section.slug).toBe('scope_assumptions');
  });

  it('system prompt mentions ~400 words and pre-sales engineer', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { content: 'X'.repeat(150) },
      tokensUsed: 100,
      latencyMs: 50,
    });

    await generateScope(ksaInput);
    const args = mockCallAI.mock.calls[0][0];
    expect(args.systemPrompt).toMatch(/400 words/);
    expect(args.systemPrompt).toMatch(/pre-sales engineer/i);
    expect(args.taskId).toContain('scope-customizer');
  });
});

describe('generateScope — AI failure fallback', () => {
  it('preserves boilerplate assumptions when callAI fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'timeout',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const section = await generateScope(ksaInput);
    expect(section.id).toBe(9);
    expect(section.slug).toBe('scope_assumptions');
    expect(section.content).toContain('## Scope, Assumptions, Exclusions, Dependencies');
    expect(section.content).toContain('ASSUMPTIONS');
    expect(section.content).toContain('Customer provides rack space');
    expect(section.content).toContain('Saudization');
  });

  it('fallback preserves appended project-specific items', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'x',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const section = await generateScope({
      ...ksaInput,
      projectSpecificAssumptions: ['Customer provides bastion host'],
      projectSpecificExclusions: ['Laptop support'],
    });
    expect(section.content).toContain('bastion host');
    expect(section.content).toContain('Laptop support');
  });
});

describe('generateScope — section metadata', () => {
  it('returns id=9, slug=scope_assumptions, status=generated, method=semi', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'x',
      retryCount: 1,
      fallback: 'engineer_review',
    });
    const section = await generateScope(ksaInput);
    expect(section.id).toBe(9);
    expect(section.slug).toBe('scope_assumptions');
    expect(section.title).toBe('Scope, Assumptions, Exclusions, Dependencies');
    expect(section.status).toBe('generated');
    expect(section.generationMethod).toBe('semi');
  });
});
