import { describe, it, expect } from 'vitest';
import {
  findSimilarDeals,
  type DealProfile,
  type DealSummary,
} from '@/engines/e2/similar-deal-finder';

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
  it('returns empty result for empty history', () => {
    const result = findSimilarDeals(baseProfile, []);
    expect(result.matches).toEqual([]);
    expect(result.stats).toEqual({
      totalSearched: 0,
      matchesFound: 0,
      avgMarginOfWins: null,
    });
  });

  it('exact sector+country+vendor match scores highest', () => {
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

    const result = findSimilarDeals(baseProfile, history);

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
    expect(result.matches[1].similarityScore).toBeLessThan(
      result.matches[0].similarityScore,
    );
  });

  it('different sector but same vendors+country still matches above threshold', () => {
    const history: DealSummary[] = [
      deal({
        opportunityId: 'OPP-CROSS',
        sector: 'Banking',
        country: 'Saudi Arabia',
        vendors: ['Cisco', 'Fortinet'],
        productCategories: ['Firewall'],
        dealValue: 1_000_000,
      }),
      deal({ opportunityId: 'OPP-A' }),
      deal({ opportunityId: 'OPP-B' }),
    ];

    const result = findSimilarDeals(baseProfile, history);

    const cross = result.matches.find((m) => m.opportunityId === 'OPP-CROSS');
    expect(cross).toBeDefined();
    expect(cross!.similarityScore).toBeCloseTo(0.7, 3);
    expect(cross!.matchFactors).not.toContain('sector:Banking');
  });

  it('returns fewer than 3 matches when only a few deterministic candidates exist', () => {
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
    ];

    const result = findSimilarDeals(baseProfile, history);

    expect(result.matches.map((m) => m.opportunityId)).toEqual(['OPP-DET']);
    expect(result.stats.matchesFound).toBe(1);
  });

  it('boosts score via requirements axis when current.requirements overlaps past text', () => {
    const profile: DealProfile = {
      ...baseProfile,
      requirements: ['SD-WAN deployment with zero-touch provisioning'],
    };
    const history: DealSummary[] = [
      deal({
        opportunityId: 'OPP-REQ',
        sector: 'Banking',
        country: 'Saudi Arabia',
        winLossReason: 'Won on SD-WAN zero-touch provisioning capability',
        vendors: ['Cisco'],
        productCategories: ['Routing'],
        dealValue: 1_000_000,
      }),
    ];

    const result = findSimilarDeals(profile, history);
    const req = result.matches.find((m) => m.opportunityId === 'OPP-REQ');
    expect(req).toBeDefined();
    expect(req!.matchFactors.some((f) => f.startsWith('requirements:'))).toBe(true);
  });

  it('does not add requirements factor when overlap is below threshold', () => {
    const profile: DealProfile = {
      ...baseProfile,
      requirements: ['SD-WAN zero-touch'],
    };
    const history: DealSummary[] = [
      deal({
        opportunityId: 'OPP-NOREQ',
        winLossReason: 'Cheaper price won the deal',
      }),
    ];

    const result = findSimilarDeals(profile, history);
    const noreq = result.matches.find((m) => m.opportunityId === 'OPP-NOREQ');
    expect(noreq).toBeDefined();
    expect(noreq!.matchFactors.some((f) => f.startsWith('requirements:'))).toBe(false);
  });

  it('computes stats correctly including avgMarginOfWins', () => {
    const history: DealSummary[] = [
      deal({ opportunityId: 'W1', outcome: 'won', margin: 0.3 }),
      deal({ opportunityId: 'W2', outcome: 'won', margin: 0.1 }),
      deal({ opportunityId: 'L1', outcome: 'lost', margin: 0.4 }),
      deal({ opportunityId: 'P1', outcome: 'pending' }),
    ];

    const result = findSimilarDeals(baseProfile, history);

    expect(result.stats.totalSearched).toBe(4);
    expect(result.stats.matchesFound).toBe(4);
    expect(result.stats.avgMarginOfWins).toBeCloseTo(0.2, 5);
  });

  it('returns null avgMarginOfWins when no won deals match', () => {
    const history: DealSummary[] = [
      deal({ opportunityId: 'L1', outcome: 'lost', margin: 0.3 }),
      deal({ opportunityId: 'L2', outcome: 'lost', margin: 0.2 }),
      deal({ opportunityId: 'L3', outcome: 'lost', margin: 0.4 }),
    ];

    const result = findSimilarDeals(baseProfile, history);
    expect(result.stats.avgMarginOfWins).toBeNull();
  });

  it('caps total results at 10', () => {
    const history: DealSummary[] = Array.from({ length: 15 }, (_, i) =>
      deal({ opportunityId: `OPP-${i}` }),
    );

    const result = findSimilarDeals(baseProfile, history);
    expect(result.matches).toHaveLength(10);
    expect(result.stats.totalSearched).toBe(15);
    expect(result.stats.matchesFound).toBe(10);
  });
});
