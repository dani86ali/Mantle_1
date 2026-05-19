import { describe, it, expect } from 'vitest';
import {
  tokenize,
  tokenOverlap,
  editDistance,
  normalizedEditDistance,
} from '@/engines/e2/string-similarity';

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric', () => {
    expect(tokenize('Catalyst 9300-24P')).toEqual(['catalyst', '9300', '24p']);
  });

  it('filters out empties and filler words', () => {
    expect(tokenize('Cisco Catalyst Series 9300 Switch')).toEqual([
      'catalyst',
      '9300',
    ]);
  });

  it('returns empty array for all-filler input', () => {
    expect(tokenize('cisco switch series')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('tokenOverlap', () => {
  it('returns 0 when no overlap', () => {
    expect(tokenOverlap(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns 1 when identical', () => {
    expect(tokenOverlap(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('returns Jaccard similarity for partial overlap', () => {
    // {a, b} vs {b, c} → intersect 1, union 3 → 1/3
    expect(tokenOverlap(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });

  it('returns 0 when both empty', () => {
    expect(tokenOverlap([], [])).toBe(0);
  });
});

describe('editDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(editDistance('abc', 'abc')).toBe(0);
  });

  it('returns insertion count when one is empty', () => {
    expect(editDistance('', 'abcd')).toBe(4);
    expect(editDistance('abcd', '')).toBe(4);
  });

  it('counts single substitutions correctly', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('returns Infinity for strings > 100 chars', () => {
    const long = 'a'.repeat(101);
    expect(editDistance(long, 'short')).toBe(Infinity);
  });
});

describe('normalizedEditDistance', () => {
  it('returns 1 for identical strings', () => {
    expect(normalizedEditDistance('abc', 'abc')).toBe(1);
  });

  it('returns 1 for both empty', () => {
    expect(normalizedEditDistance('', '')).toBe(1);
  });

  it('returns 0 for completely different lengths and content', () => {
    expect(normalizedEditDistance('abc', 'xyz')).toBe(0);
  });

  it('returns 0 when over length limit', () => {
    const long = 'a'.repeat(101);
    expect(normalizedEditDistance(long, 'short')).toBe(0);
  });
});
