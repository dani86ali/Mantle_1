import { describe, it, expect } from 'vitest';
import { selectMigrationApproach } from '@/engines/e5/migration-selector';
import type { MigrationInput } from '@/engines/e5/migration-selector';

const baseInput: MigrationInput = {
  isGreenfield: false,
  siteCount: 1,
  hasRedundancy: false,
  downTimeToleranceHours: 0,
  deviceCount: 10,
};

describe('selectMigrationApproach — greenfield', () => {
  it('returns cutover / low risk with 2 phases', () => {
    const r = selectMigrationApproach({ ...baseInput, isGreenfield: true });
    expect(r.method).toBe('cutover');
    expect(r.riskLevel).toBe('low');
    expect(r.phases).toHaveLength(2);
    expect(r.phases[0].name).toMatch(/staging/i);
    expect(r.phases[1].name).toMatch(/go-live/i);
  });
});

describe('selectMigrationApproach — parallel run', () => {
  it('brownfield + redundancy + ≥4h budget → parallel_run / medium / 3 phases', () => {
    const r = selectMigrationApproach({
      ...baseInput,
      hasRedundancy: true,
      downTimeToleranceHours: 8,
    });
    expect(r.method).toBe('parallel_run');
    expect(r.riskLevel).toBe('medium');
    expect(r.phases).toHaveLength(3);
  });

  it('parallel_run priority beats phased even with siteCount > 3', () => {
    const r = selectMigrationApproach({
      ...baseInput,
      siteCount: 10,
      hasRedundancy: true,
      downTimeToleranceHours: 8,
    });
    expect(r.method).toBe('parallel_run');
  });
});

describe('selectMigrationApproach — phased', () => {
  it('brownfield + many sites → phased / medium with ceil(N/3)+1 phases', () => {
    const r = selectMigrationApproach({
      ...baseInput,
      siteCount: 10,
    });
    expect(r.method).toBe('phased');
    expect(r.riskLevel).toBe('medium');
    expect(r.phases).toHaveLength(Math.ceil(10 / 3) + 1);
    expect(r.phases[r.phases.length - 1].name).toMatch(/cutover/i);
  });

  it('siteCount = 4 → 2 site groups + final cutover (3 phases)', () => {
    const r = selectMigrationApproach({ ...baseInput, siteCount: 4 });
    expect(r.method).toBe('phased');
    expect(r.phases).toHaveLength(3);
  });

  it('siteCount = 3 does not trigger phased (boundary)', () => {
    const r = selectMigrationApproach({ ...baseInput, siteCount: 3 });
    expect(r.method).not.toBe('phased');
  });
});

describe('selectMigrationApproach — high-risk cutover', () => {
  it('brownfield + no redundancy + tight window → cutover / high / 3 phases', () => {
    const r = selectMigrationApproach({
      ...baseInput,
      hasRedundancy: false,
      downTimeToleranceHours: 2,
    });
    expect(r.method).toBe('cutover');
    expect(r.riskLevel).toBe('high');
    expect(r.phases).toHaveLength(3);
  });
});

describe('selectMigrationApproach — default brownfield', () => {
  it('brownfield + redundancy + tight window → default cutover / medium', () => {
    const r = selectMigrationApproach({
      ...baseInput,
      hasRedundancy: true,
      downTimeToleranceHours: 1,
    });
    expect(r.method).toBe('cutover');
    expect(r.riskLevel).toBe('medium');
  });
});

describe('selectMigrationApproach — phase invariants', () => {
  const cases: MigrationInput[] = [
    { isGreenfield: true,  siteCount: 1,  hasRedundancy: false, downTimeToleranceHours: 0, deviceCount: 5 },
    { isGreenfield: false, siteCount: 1,  hasRedundancy: true,  downTimeToleranceHours: 8, deviceCount: 5 },
    { isGreenfield: false, siteCount: 6,  hasRedundancy: false, downTimeToleranceHours: 0, deviceCount: 20 },
    { isGreenfield: false, siteCount: 1,  hasRedundancy: false, downTimeToleranceHours: 1, deviceCount: 3 },
    { isGreenfield: false, siteCount: 1,  hasRedundancy: true,  downTimeToleranceHours: 1, deviceCount: 3 },
  ];

  it('every phase has a non-empty rollbackPlan and positive durationDays', () => {
    for (const input of cases) {
      const r = selectMigrationApproach(input);
      for (const p of r.phases) {
        expect(p.rollbackPlan.length).toBeGreaterThan(0);
        expect(p.durationDays).toBeGreaterThan(0);
      }
    }
  });

  it('reasoning is a non-empty string for every approach', () => {
    for (const input of cases) {
      const r = selectMigrationApproach(input);
      expect(r.reasoning.length).toBeGreaterThan(0);
    }
  });
});
