import { describe, it, expect } from 'vitest';
import { riskFlagPairsRule } from '@/engines/e2/expert-rules/risk-flag-pairs';
import type {
  BomLineItem,
  AnomalyRiskContext,
} from '@/engines/e2/bom-anomaly-detector';

function flag(overrides: Partial<AnomalyRiskContext>): AnomalyRiskContext {
  return {
    severity: 'medium',
    pattern: '',
    matchedText: '',
    source: 'rfp',
    ...overrides,
  };
}

describe('riskFlagPairsRule', () => {
  it('returns no anomalies when no risk flags', () => {
    expect(riskFlagPairsRule([], [])).toEqual([]);
  });

  it('emits missing_component when HA flag is present but core/firewall count < 2', () => {
    const bom: BomLineItem[] = [
      { sku: 'FPR', description: 'Firewall', qty: 1, category: 'Firewall' },
    ];
    const out = riskFlagPairsRule(bom, [
      flag({ pattern: 'high availability', matchedText: 'HA required' }),
    ]);
    const ha = out.find((a) => /high availability/i.test(a.description));
    expect(ha).toBeDefined();
    expect(ha!.type).toBe('missing_component');
  });

  it('does not flag HA when 2+ firewalls present', () => {
    const bom: BomLineItem[] = [
      { sku: 'FPR-A', description: 'Firewall A', qty: 1, category: 'Firewall' },
      { sku: 'FPR-B', description: 'Firewall B', qty: 1, category: 'Firewall' },
    ];
    const out = riskFlagPairsRule(bom, [
      flag({ pattern: 'redundancy', matchedText: 'redundancy required' }),
    ]);
    expect(out.find((a) => /high availability/i.test(a.description))).toBeUndefined();
  });

  it('emits informational anomaly for IKTVA / Saudi local-content flag', () => {
    const out = riskFlagPairsRule([], [
      flag({ pattern: 'iktva', matchedText: 'IKTVA 70% required' }),
    ]);
    const iktva = out.find((a) => /IKTVA/.test(a.description));
    expect(iktva).toBeDefined();
    expect(iktva!.type).toBe('unusual_combination');
  });

  it('emits informational anomaly for financial penalty flag', () => {
    const out = riskFlagPairsRule([], [
      flag({ pattern: 'liquidated damages', matchedText: 'LDs apply' }),
    ]);
    const ld = out.find((a) => /penalty|liquidated/i.test(a.description));
    expect(ld).toBeDefined();
  });
});
