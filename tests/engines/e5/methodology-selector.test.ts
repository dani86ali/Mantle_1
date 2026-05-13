import { describe, it, expect } from 'vitest';
import { selectMethodology } from '@/engines/e5/methodology-selector';
import { DesignApproachSchema } from '@/engines/e5/types';

describe('selectMethodology — approach (greenfield/brownfield/unknown)', () => {
  it('greenfield → top_down', () => {
    const r = selectMethodology('greenfield_campus', { isGreenfield: true });
    expect(r.approach).toBe('top_down');
  });

  it('brownfield (isGreenfield false) → bottom_up', () => {
    const r = selectMethodology('campus_refresh', { isGreenfield: false });
    expect(r.approach).toBe('bottom_up');
  });

  it('unknown / undefined → hybrid', () => {
    const r = selectMethodology('general', {});
    expect(r.approach).toBe('hybrid');
  });
});

describe('selectMethodology — frameworks', () => {
  it('small simple greenfield → ppdioo only', () => {
    const r = selectMethodology('greenfield_campus', {
      isGreenfield: true, siteCount: 1,
    });
    expect(r.frameworks).toEqual(['ppdioo']);
  });

  it('OT site adds cisco_safe and nist_sp800_207', () => {
    const r = selectMethodology('ot_network', {
      isGreenfield: true, siteCount: 2, hasOT: true,
    });
    expect(r.frameworks).toContain('ppdioo');
    expect(r.frameworks).toContain('cisco_safe');
    expect(r.frameworks).toContain('nist_sp800_207');
    // siteCount 2 ≤ 3 → no togaf, ≤ 5 → no itil
    expect(r.frameworks).not.toContain('togaf_adm');
    expect(r.frameworks).not.toContain('itil_v4');
  });

  it('large multi-site (>5) adds togaf_adm and itil_v4', () => {
    const r = selectMethodology('branch_rollout', {
      isGreenfield: false, siteCount: 12,
    });
    expect(r.frameworks).toContain('togaf_adm');
    expect(r.frameworks).toContain('itil_v4');
    expect(r.frameworks).not.toContain('cisco_safe');
    expect(r.frameworks).not.toContain('nist_sp800_207');
  });

  it('siteCount = 4 adds togaf but not itil (boundary 3 < x ≤ 5)', () => {
    const r = selectMethodology('branch_rollout', { siteCount: 4 });
    expect(r.frameworks).toContain('togaf_adm');
    expect(r.frameworks).not.toContain('itil_v4');
  });

  it('siteCount = 6 adds both togaf and itil', () => {
    const r = selectMethodology('branch_rollout', { siteCount: 6 });
    expect(r.frameworks).toContain('togaf_adm');
    expect(r.frameworks).toContain('itil_v4');
  });

  it('hasDC alone adds cisco_safe but NOT nist (NIST is OT-only)', () => {
    const r = selectMethodology('dc_modernization', {
      isGreenfield: true, hasDC: true,
    });
    expect(r.frameworks).toContain('cisco_safe');
    expect(r.frameworks).not.toContain('nist_sp800_207');
  });

  it('full kitchen-sink: OT + DC + 10 sites yields all 5 frameworks', () => {
    const r = selectMethodology('ot_network', {
      isGreenfield: true, siteCount: 10, hasOT: true, hasDC: true,
    });
    expect(new Set(r.frameworks)).toEqual(new Set([
      'ppdioo', 'togaf_adm', 'cisco_safe', 'nist_sp800_207', 'itil_v4',
    ]));
  });
});

describe('selectMethodology — invariants', () => {
  it('always returns methodology=ppdioo', () => {
    const r = selectMethodology('general', {});
    expect(r.methodology).toBe('ppdioo');
  });

  it('topologyPattern is null (filled by recommender step)', () => {
    const r = selectMethodology('greenfield_campus', { isGreenfield: true });
    expect(r.topologyPattern).toBeNull();
  });

  it('vendor defaults to cisco', () => {
    const r = selectMethodology('general', {});
    expect(r.vendor).toBe('cisco');
  });

  it('passes through projectType verbatim', () => {
    const r = selectMethodology('sd_wan', { siteCount: 4 });
    expect(r.projectType).toBe('sd_wan');
  });

  it('always includes ppdioo as first framework', () => {
    const r = selectMethodology('ot_network', {
      siteCount: 10, hasOT: true, hasDC: true,
    });
    expect(r.frameworks[0]).toBe('ppdioo');
  });

  it('result validates against DesignApproachSchema (all combinations)', () => {
    const cases = [
      { isGreenfield: true },
      { isGreenfield: false },
      {},
      { hasOT: true, siteCount: 7, hasDC: true },
      { siteCount: 4 },
    ];
    for (const c of cases) {
      const r = selectMethodology('general', c);
      expect(() => DesignApproachSchema.parse(r)).not.toThrow();
    }
  });

  it('is pure: identical inputs produce identical outputs', () => {
    const a = selectMethodology('campus_refresh', { siteCount: 4, hasOT: true });
    const b = selectMethodology('campus_refresh', { siteCount: 4, hasOT: true });
    expect(a).toEqual(b);
  });
});

describe('selectMethodology — input validation', () => {
  it('rejects empty projectType', () => {
    expect(() => selectMethodology('', {})).toThrow();
  });

  it('rejects negative siteCount', () => {
    expect(() => selectMethodology('general', { siteCount: -1 })).toThrow();
  });
});
