import { describe, it, expect } from 'vitest';
import { mapE4, mapE5 } from '@/coordinator/pipeline-e3-rfi';

describe('pipeline-e3 RFI mappers', () => {
  describe('mapE4', () => {
    it('returns undefined when artifacts are absent', () => {
      expect(mapE4()).toBeUndefined();
      expect(mapE4({})).toBeUndefined();
    });

    it('returns undefined when requirementsBaseline JSON is malformed', () => {
      expect(mapE4({ requirementsBaseline: 'not-json' })).toBeUndefined();
    });

    it('parses a valid five-category baseline', () => {
      const baseline = {
        business: [{ id: 'RB-001', text: 'Reduce TCO', source: 'A1', priority: 'critical', validated: false }],
        functional: [],
        nonFunctional: [],
        constraints: [],
        assumptions: [],
      };
      const out = mapE4({ requirementsBaseline: JSON.stringify(baseline) });
      expect(out).toBeDefined();
      expect(out!.requirementsBaseline.business).toHaveLength(1);
      expect(out!.requirementsBaseline.business[0].id).toBe('RB-001');
    });

    it('fills missing categories with empty arrays defensively', () => {
      const partial = { business: [{ id: 'RB-001', text: 'X', source: 'A1', priority: 'high', validated: false }] };
      const out = mapE4({ requirementsBaseline: JSON.stringify(partial) });
      expect(out).toBeDefined();
      expect(out!.requirementsBaseline.functional).toEqual([]);
      expect(out!.requirementsBaseline.assumptions).toEqual([]);
    });
  });

  describe('mapE5', () => {
    it('returns undefined when designSummary is missing', () => {
      expect(mapE5()).toBeUndefined();
      expect(mapE5({})).toBeUndefined();
      expect(mapE5({ componentList: '[]' })).toBeUndefined();
    });

    it('returns undefined when designSummary JSON is malformed', () => {
      expect(mapE5({ designSummary: 'not-json' })).toBeUndefined();
    });

    it('parses a designSummary containing approach, sizing, and hldSections', () => {
      const summary = {
        designApproach: {
          methodology: 'ppdioo', approach: 'top_down', frameworks: ['ppdioo'],
          topologyPattern: 'two_tier_collapsed_core', vendor: 'cisco', projectType: 'campus_refresh',
        },
        sizing: {
          coreDevices: [{ role: 'core', model: 'C9500', vendor: 'cisco', quantity: 2, reasoning: 'r' }],
          distributionDevices: [], accessDevices: [], firewalls: [],
          wirelessControllers: [], accessPoints: [],
        },
        hldSections: [{ sectionNumber: 1, title: 'Exec', content: 'body' }],
      };
      const out = mapE5({ designSummary: JSON.stringify(summary) });
      expect(out).toBeDefined();
      expect(out!.designApproach?.topologyPattern).toBe('two_tier_collapsed_core');
      expect(out!.sizing?.coreDevices).toHaveLength(1);
      expect(out!.hldSections).toHaveLength(1);
    });

    it('returns undefined when designSummary has no usable fields', () => {
      expect(mapE5({ designSummary: JSON.stringify({}) })).toBeUndefined();
    });
  });
});
