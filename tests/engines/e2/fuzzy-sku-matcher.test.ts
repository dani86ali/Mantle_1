import { describe, it, expect } from 'vitest';
import {
  fuzzyMatchSku,
  type CatalogEntry,
} from '@/engines/e2/fuzzy-sku-matcher';

const catalog: CatalogEntry[] = [
  {
    sku: 'C9300L-24UXG-4X-A',
    family: 'Catalyst 9300L',
    description: '24-port mGig UPOE switch with 4x10G uplinks',
  },
  {
    sku: 'C9120AXE-E',
    family: 'Catalyst 9120',
    description: 'Wi-Fi 6 access point external antenna',
  },
  {
    sku: 'FG-101F',
    family: 'FortiGate',
    description: 'FortiGate 101F next-gen firewall',
  },
];

describe('fuzzyMatchSku', () => {
  it('returns exact match (case-insensitive)', () => {
    const result = fuzzyMatchSku(
      { description: 'c9300l-24uxg-4x-a' },
      catalog,
    );

    expect(result.matchType).toBe('exact');
    expect(result.confidence).toBe(1.0);
    expect(result.matchedSku).toBe('C9300L-24UXG-4X-A');
    expect(result.originalInput).toBe('c9300l-24uxg-4x-a');
  });

  it('returns prefix/contains match', () => {
    const result = fuzzyMatchSku(
      { description: 'C9120AXE' },
      catalog,
    );

    expect(result.matchType).toBe('exact');
    expect(result.confidence).toBe(0.9);
    expect(result.matchedSku).toBe('C9120AXE-E');
  });

  it('matches via token-overlap + edit-distance for a fuzzy description', () => {
    const result = fuzzyMatchSku(
      {
        description: 'Cisco Wi-Fi 6 access point with external antennas',
        manufacturer: 'Cisco',
        category: 'wireless',
      },
      catalog,
    );

    expect(result.matchType).toBe('fuzzy');
    expect(result.matchedSku).toBe('C9120AXE-E');
    expect(result.confidence).toBeGreaterThan(0.55);
    expect(result.reasoning).toContain('token-overlap');
  });

  it('returns no_match when nothing in catalog scores above threshold', () => {
    const result = fuzzyMatchSku(
      { description: 'completely unrelated mystery xyzzy device' },
      catalog,
    );

    expect(result.matchType).toBe('no_match');
    expect(result.confidence).toBe(0);
    expect(result.matchedSku).toBe('');
    expect(result.reasoning).toContain('below');
  });

  it('returns no_match with empty catalog', () => {
    const result = fuzzyMatchSku(
      { description: 'anything' },
      [],
    );

    expect(result.matchType).toBe('no_match');
    expect(result.reasoning).toBe('empty catalog');
  });
});
