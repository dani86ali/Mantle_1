import { describe, it, expect } from 'vitest';
import { getEmphasis, getPrioritizedSections } from '@/engines/e4/emphasis-matrix';

describe('getEmphasis — per-type overrides', () => {
  it('campus_refresh sets B and D high, F medium, others medium', () => {
    const e = getEmphasis('campus_refresh');
    expect(e.B).toBe('high');
    expect(e.D).toBe('high');
    expect(e.F).toBe('medium');
    expect(e.A).toBe('medium');
    expect(e.C).toBe('medium');
    expect(e.E).toBe('medium');
  });

  it('sd_wan sets B, C, D high', () => {
    const e = getEmphasis('sd_wan');
    expect(e.B).toBe('high');
    expect(e.C).toBe('high');
    expect(e.D).toBe('high');
  });

  it('dc_modernization sets B, C, D high', () => {
    const e = getEmphasis('dc_modernization');
    expect(e.B).toBe('high');
    expect(e.C).toBe('high');
    expect(e.D).toBe('high');
  });

  it('wireless_deployment sets B and D high', () => {
    const e = getEmphasis('wireless_deployment');
    expect(e.B).toBe('high');
    expect(e.D).toBe('high');
  });

  it('security_upgrade sets B and E high', () => {
    const e = getEmphasis('security_upgrade');
    expect(e.B).toBe('high');
    expect(e.E).toBe('high');
  });

  it('branch_rollout sets A, B, D, F high', () => {
    const e = getEmphasis('branch_rollout');
    expect(e.A).toBe('high');
    expect(e.B).toBe('high');
    expect(e.D).toBe('high');
    expect(e.F).toBe('high');
  });

  it('ot_network sets B and E high', () => {
    const e = getEmphasis('ot_network');
    expect(e.B).toBe('high');
    expect(e.E).toBe('high');
  });

  it('general leaves all sections at medium', () => {
    const e = getEmphasis('general');
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(e[id]).toBe('medium');
    }
  });

  it('always returns all six section IDs', () => {
    const e = getEmphasis('sd_wan');
    expect(Object.keys(e).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

describe('getPrioritizedSections', () => {
  it('returns high-emphasis sections before medium', () => {
    const order = getPrioritizedSections('campus_refresh');
    const idx = (s: string) => order.indexOf(s);
    // B and D are high → must come before A, C, E (medium)
    expect(idx('B')).toBeLessThan(idx('A'));
    expect(idx('B')).toBeLessThan(idx('C'));
    expect(idx('B')).toBeLessThan(idx('E'));
    expect(idx('D')).toBeLessThan(idx('A'));
    expect(idx('D')).toBeLessThan(idx('C'));
    expect(idx('D')).toBeLessThan(idx('E'));
  });

  it('high sections come first for branch_rollout (A, B, D, F before C, E)', () => {
    const order = getPrioritizedSections('branch_rollout');
    const highs = ['A', 'B', 'D', 'F'];
    const mediums = ['C', 'E'];
    for (const h of highs) {
      for (const m of mediums) {
        expect(order.indexOf(h)).toBeLessThan(order.indexOf(m));
      }
    }
  });

  it('returns all six sections', () => {
    const order = getPrioritizedSections('general');
    expect(order.sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('breaks ties in alphabetical (section-order) order', () => {
    // For 'general', all are medium → order should be A..F
    expect(getPrioritizedSections('general')).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});
