import { describe, it, expect } from 'vitest';
import { resolveOrderableSku } from '@/engines/e5/orderable-sku-resolver';

describe('resolveOrderableSku', () => {
  it('returns bare model when orderable_skus is undefined', () => {
    expect(resolveOrderableSku({ model: 'FG-401F' })).toBe('FG-401F');
  });

  it('returns bare model when orderable_skus is an empty object', () => {
    expect(resolveOrderableSku({ model: 'FG-60F', orderable_skus: {} })).toBe('FG-60F');
  });

  it('returns the SKU matching the requested tier', () => {
    expect(resolveOrderableSku({
      model: 'C9300-48P',
      orderable_skus: { advantage: 'C9300-48P-A', essentials: 'C9300-48P-E' },
      tier: 'advantage',
    })).toBe('C9300-48P-A');
  });

  it('falls back to first sorted key when requested tier is missing', () => {
    // C9200L line is Essentials-only; picker requests 'advantage' → 'essentials' is first sorted key.
    expect(resolveOrderableSku({
      model: 'C9200L-48P-4G',
      orderable_skus: { essentials: 'C9200L-48P-4G-E' },
      tier: 'advantage',
    })).toBe('C9200L-48P-4G-E');
  });

  it('falls back deterministically across multiple keys (sorted order)', () => {
    // Both keys present, request unknown tier — 'advantage' sorts before 'essentials'.
    expect(resolveOrderableSku({
      model: 'C9300-48P',
      orderable_skus: { essentials: 'C9300-48P-E', advantage: 'C9300-48P-A' },
      tier: 'premier',
    })).toBe('C9300-48P-A');
  });

  it('returns bare model when fallback key value is somehow nullish', () => {
    // Defensive: a malformed map with a nullish value should not propagate undefined.
    const orderable_skus = { advantage: undefined as unknown as string };
    expect(resolveOrderableSku({
      model: 'C9300-24P',
      orderable_skus,
      tier: 'essentials',
    })).toBe('C9300-24P');
  });

  it('honors AP regulatory-domain tier key', () => {
    expect(resolveOrderableSku({
      model: 'C9120AXI',
      orderable_skus: { domain_e: 'C9120AXI-E' },
      tier: 'domain_e',
    })).toBe('C9120AXI-E');
  });
});
