import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import {
  fuzzyMatchSku,
  type CatalogEntry,
} from '@/engines/e2/fuzzy-sku-matcher';

const mockCallAI = vi.mocked(callAI);

const catalog: CatalogEntry[] = [
  {
    sku: 'C9300L-24UXG-4X-A',
    family: 'Catalyst 9300L',
    description: '24-port mGig UPOE switch with 4x10G uplinks',
  },
  {
    sku: 'C9120AXE-E',
    family: 'Catalyst 9120',
    description: 'Wi-Fi 6 access point, external antenna',
  },
  {
    sku: 'FG-101F',
    family: 'FortiGate',
    description: 'FortiGate 101F next-gen firewall',
  },
];

beforeEach(() => {
  mockCallAI.mockReset();
});

describe('fuzzyMatchSku', () => {
  it('returns exact match without calling AI (case-insensitive)', async () => {
    const result = await fuzzyMatchSku(
      { description: 'c9300l-24uxg-4x-a' },
      catalog,
    );

    expect(result.matchType).toBe('exact');
    expect(result.confidence).toBe(1.0);
    expect(result.matchedSku).toBe('C9300L-24UXG-4X-A');
    expect(result.originalInput).toBe('c9300l-24uxg-4x-a');
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('returns prefix/contains match without calling AI', async () => {
    const result = await fuzzyMatchSku(
      { description: 'C9120AXE' },
      catalog,
    );

    expect(result.matchType).toBe('exact');
    expect(result.confidence).toBe(0.9);
    expect(result.matchedSku).toBe('C9120AXE-E');
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('calls AI for a fuzzy description and returns fuzzy result', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        sku: 'C9120AXE-E',
        confidence: 0.82,
        reasoning: 'Wi-Fi 6 AP with external antennas matches C9120AXE-E.',
      },
      tokensUsed: 200,
      latencyMs: 50,
    });

    const result = await fuzzyMatchSku(
      {
        description: 'Cisco Wi-Fi 6 access point with external antennas',
        manufacturer: 'Cisco',
        category: 'wireless',
      },
      catalog,
    );

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(result.matchType).toBe('fuzzy');
    expect(result.matchedSku).toBe('C9120AXE-E');
    expect(result.confidence).toBe(0.82);
    expect(result.reasoning).toContain('Wi-Fi 6');

    const callArgs = mockCallAI.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('Cisco/Fortinet product catalog');
    expect(callArgs.prompt).toContain('Manufacturer: Cisco');
    expect(callArgs.prompt).toContain('Category: wireless');
    expect(callArgs.prompt).toContain('C9120AXE-E');
  });

  it('returns no_match when AI returns a SKU not in the catalog', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        sku: 'INVALID-SKU-999',
        confidence: 0.7,
        reasoning: 'Best guess from description.',
      },
      tokensUsed: 150,
      latencyMs: 40,
    });

    const result = await fuzzyMatchSku(
      { description: 'something obscure' },
      catalog,
    );

    expect(result.matchType).toBe('no_match');
    expect(result.confidence).toBe(0);
    expect(result.matchedSku).toBe('INVALID-SKU-999');
    expect(result.reasoning).toContain('not in catalog');
  });

  it('returns no_match gracefully when AI call fails (engineer_review)', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit exceeded',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const result = await fuzzyMatchSku(
      { description: 'mystery device 9000' },
      catalog,
    );

    expect(result.matchType).toBe('no_match');
    expect(result.confidence).toBe(0);
    expect(result.matchedSku).toBe('');
    expect(result.reasoning).toContain('engineer_review');
    expect(result.reasoning).toContain('rate limit');
    expect(result.originalInput).toBe('mystery device 9000');
  });
});
