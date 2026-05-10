import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import {
  findSimilarDeals,
  type DealProfile,
  type DealSummary,
} from '@/engines/e2/similar-deal-finder';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
});

const baseProfile: DealProfile = {
  sector: 'Telecom',
  country: 'Saudi Arabia',
  dealSize: 1_000_000,
  vendors: ['Cisco', 'Fortinet'],
  productCategories: ['Switching', 'Firewall'],
};

function deal(overrides: Partial<DealSummary>): DealSummary {
  return {
    opportunityId: 'OPP-X',
    customerName: 'Cust',
    sector: 'Telecom',
    country: 'Saudi Arabia',
    dealValue: 1_000_000,
    vendors: ['Cisco'],
    productCategories: ['Switching'],
    outcome: 'won',
    margin: 0.2,
    ...overrides,
  };
}

describe('findSimilarDeals', () => {
  it('returns empty result for empty history without calling AI', async () => {
    const result = await findSimilarDeals(baseProfile, []);
    expect(result.matches).toEqual([]);
    expect(result.stats).toEqual({
      totalSearched: 0,
      matchesFound: 0,
      avgMarginOfWins: null,
    });
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('exact sector+country+vendor match scores highest', async () => {
    // Three deterministic candidates so AI is not triggered.
    const history: DealSummary[] = [
      deal({
        opportunityId: 'OPP-1',
        sector: 'Telecom',
        country: 'Saudi Arabia',
        vendors: ['Cisco', 'Fortinet'],
        productCategories: ['Switching', 'Firewall'],
        dealValue: 1_000_000,
      }),
      deal({
        opportunityId: 'OPP-2',
        sector: 'Telecom',
        country: 'UAE',
        vendors: ['Cisco'],
        productCategories: ['Switching'],
      }),
      deal({
        opportunityId: 'OPP-3',
        sector: 'Banking',
        country: 'Saudi Arabia',
        vendors: ['Cisco'],
        productCategories: ['Switching'],
      }),
    ];

    const result = await findSimilarDeals(baseProfile, history);

    expect(mockCallAI).not.toHaveBeenCalled();
    expect(result.matches[0].opportunityId).toBe('OPP-1');
    expect(result.matches[0].similarityScore).toBeCloseTo(1.0, 3);
    expect(result.matches[0].matchFactors).toEqual(
      expect.arrayContaining([
        'sector:Telecom',
        'country:Saudi Arabia',
        expect.stringContaining('vendors:'),
        expect.stringContaining('categories:'),
        'dealSize±50%',
      ]),
    );
    // Subsequent matches have strictly lower scores.
    expect(result.matches[1].similarityScore).toBeLessThan(
      result.matches[0].similarityScore,
    );
  });

  it('different sector but same vendors+country still matches above threshold', async () => {
    const history: DealSummary[] = [
      deal({
        opportunityId: 'OPP-CROSS',
        sector: 'Banking', // different
        country: 'Saudi Arabia',
        vendors: ['Cisco', 'Fortinet'],
        productCategories: ['Firewall'],
        dealValue: 1_000_000,
      }),
      deal({ opportunityId: 'OPP-A' }),
      deal({ opportunityId: 'OPP-B' }),
    ];

    const result = await findSimilarDeals(baseProfile, history);

    expect(mockCallAI).not.toHaveBeenCalled();
    const cross = result.matches.find((m) => m.opportunityId === 'OPP-CROSS');
    expect(cross).toBeDefined();
    // 0.2 country + 0.2 vendors + 0.2 categories + 0.1 dealSize = 0.7
    expect(cross!.similarityScore).toBeCloseTo(0.7, 3);
    expect(cross!.matchFactors).not.toContain('sector:Banking');
  });

  it('calls AI to supplement when fewer than 3 deterministic matches', async () => {
    // Only one deterministic match — AI should run.
    const history: DealSummary[] = [
      deal({ opportunityId: 'OPP-DET' }),
      deal({
        opportunityId: 'OPP-NOMATCH',
        sector: 'Retail',
        country: 'France',
        vendors: ['HPE'],
        productCategories: ['Storage'],
        dealValue: 50_000,
      }),
      deal({
        opportunityId: 'OPP-AI',
        sector: 'Retail',
        country: 'France',
        vendors: ['Juniper'],
        productCategories: ['Routing'],
        dealValue: 20_000,
        outcome: 'won',
        margin: 0.15,
      }),
    ];

    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [
        {
          opportunityId: 'OPP-AI',
          similarityScore: 0.55,
          matchFactors: ['similar technical requirements'],
        },
      ],
      tokensUsed: 300,
      latencyMs: 80,
    });

    const result = await findSimilarDeals(baseProfile, history);

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const ids = result.matches.map((m) => m.opportunityId);
    expect(ids).toContain('OPP-DET');
    expect(ids).toContain('OPP-AI');
    const ai = result.matches.find((m) => m.opportunityId === 'OPP-AI')!;
    expect(ai.similarityScore).toBe(0.55);
    expect(ai.matchFactors).toContain('similar technical requirements');
  });

  it('does not call AI when 3+ deterministic matches exist', async () => {
    const history: DealSummary[] = [
      deal({ opportunityId: 'OPP-1' }),
      deal({ opportunityId: 'OPP-2' }),
      deal({ opportunityId: 'OPP-3' }),
    ];

    await findSimilarDeals(baseProfile, history);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('AI failure leaves deterministic matches unchanged', async () => {
    const history: DealSummary[] = [deal({ opportunityId: 'OPP-DET' })];
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const result = await findSimilarDeals(baseProfile, history);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].opportunityId).toBe('OPP-DET');
  });

  it('deduplicates AI results that overlap with deterministic matches', async () => {
    const history: DealSummary[] = [deal({ opportunityId: 'OPP-DET' })];
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: [
        {
          opportunityId: 'OPP-DET', // duplicate
          similarityScore: 0.99,
          matchFactors: ['ai factor'],
        },
      ],
      tokensUsed: 100,
      latencyMs: 30,
    });

    const result = await findSimilarDeals(baseProfile, history);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].opportunityId).toBe('OPP-DET');
    // Deterministic factors win (no 'ai factor' since dedup drops AI copy).
    expect(result.matches[0].matchFactors).not.toContain('ai factor');
  });

  it('computes stats correctly including avgMarginOfWins', async () => {
    const history: DealSummary[] = [
      deal({ opportunityId: 'W1', outcome: 'won', margin: 0.3 }),
      deal({ opportunityId: 'W2', outcome: 'won', margin: 0.1 }),
      deal({ opportunityId: 'L1', outcome: 'lost', margin: 0.4 }),
      deal({ opportunityId: 'P1', outcome: 'pending' }),
    ];

    const result = await findSimilarDeals(baseProfile, history);

    expect(result.stats.totalSearched).toBe(4);
    expect(result.stats.matchesFound).toBe(4);
    // Only won deals contribute: (0.3 + 0.1) / 2 = 0.2.
    expect(result.stats.avgMarginOfWins).toBeCloseTo(0.2, 5);
  });

  it('returns null avgMarginOfWins when no won deals match', async () => {
    const history: DealSummary[] = [
      deal({ opportunityId: 'L1', outcome: 'lost', margin: 0.3 }),
      deal({ opportunityId: 'L2', outcome: 'lost', margin: 0.2 }),
      deal({ opportunityId: 'L3', outcome: 'lost', margin: 0.4 }),
    ];

    const result = await findSimilarDeals(baseProfile, history);
    expect(result.stats.avgMarginOfWins).toBeNull();
  });

  it('caps total results at 10', async () => {
    const history: DealSummary[] = Array.from({ length: 15 }, (_, i) =>
      deal({ opportunityId: `OPP-${i}` }),
    );

    const result = await findSimilarDeals(baseProfile, history);
    expect(result.matches).toHaveLength(10);
    expect(result.stats.totalSearched).toBe(15);
    expect(result.stats.matchesFound).toBe(10);
  });
});
