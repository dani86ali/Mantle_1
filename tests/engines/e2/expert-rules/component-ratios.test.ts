import { describe, it, expect } from 'vitest';
import { componentRatiosRule } from '@/engines/e2/expert-rules/component-ratios';
import type { BomLineItem } from '@/engines/e2/bom-anomaly-detector';

describe('componentRatiosRule', () => {
  it('flags AP count exceeding WLC capacity', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9120-AP', description: 'AP', qty: 200, category: 'Access Point' },
      { sku: 'C9800-WLC', description: 'WLC', qty: 1, category: 'WLC' },
    ];
    const out = componentRatiosRule(bom);
    const combo = out.find((a) => /WLC capacity/.test(a.description));
    expect(combo).toBeDefined();
    expect(combo!.type).toBe('unusual_combination');
  });

  it('does not flag when AP count is within WLC capacity', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9120-AP', description: 'AP', qty: 20, category: 'Access Point' },
      { sku: 'C9800-WLC', description: 'WLC', qty: 1, category: 'WLC' },
    ];
    const out = componentRatiosRule(bom);
    expect(out.find((a) => /WLC/.test(a.description))).toBeUndefined();
  });

  it('flags multiple switches without a PDU', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9300-48P', description: 'Switch', qty: 4, category: 'Switch' },
    ];
    const out = componentRatiosRule(bom);
    const pdu = out.find((a) => /PDU/.test(a.description));
    expect(pdu).toBeDefined();
    expect(pdu!.type).toBe('missing_component');
    expect(pdu!.severity).toBe('warning');
  });

  it('does not flag PDU when one is present', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9300-48P', description: 'Switch', qty: 4, category: 'Switch' },
      { sku: 'PDU-30A', description: 'Rack PDU 30A', qty: 1, category: 'Power' },
    ];
    const out = componentRatiosRule(bom);
    expect(out.find((a) => /PDU/.test(a.description))).toBeUndefined();
  });
});
