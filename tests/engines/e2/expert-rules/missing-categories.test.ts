import { describe, it, expect } from 'vitest';
import { missingCategoriesRule } from '@/engines/e2/expert-rules/missing-categories';
import type {
  BomLineItem,
  ProjectContext,
} from '@/engines/e2/bom-anomaly-detector';

const baseCtx: ProjectContext = { sector: 'unknown', siteCount: 1 };

describe('missingCategoriesRule', () => {
  it('returns no anomalies when sector is not recognized', () => {
    const bom: BomLineItem[] = [];
    expect(missingCategoriesRule(bom, baseCtx)).toEqual([]);
  });

  it('emits missing_component for data_center project missing firewall', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9300', description: 'Switch', qty: 2, category: 'Switch' },
    ];
    const ctx: ProjectContext = {
      sector: 'unknown',
      siteCount: 1,
      projectType: 'data_center',
    };
    const out = missingCategoriesRule(bom, ctx);
    const firewall = out.find((a) => /firewall/i.test(a.description));
    expect(firewall).toBeDefined();
    expect(firewall!.type).toBe('missing_component');
    expect(firewall!.severity).toBe('error');
  });

  it('emits no anomaly when expected component is present', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9300', description: 'Switch', qty: 2, category: 'Switch' },
      { sku: 'FPR-1010', description: 'Firewall', qty: 1, category: 'Firewall' },
    ];
    const ctx: ProjectContext = {
      sector: 'unknown',
      siteCount: 1,
      projectType: 'data_center',
    };
    expect(missingCategoriesRule(bom, ctx)).toEqual([]);
  });

  it('matches banking sector to security_refresh rule', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9300', description: 'Switch', qty: 2, category: 'Switch' },
    ];
    const out = missingCategoriesRule(bom, {
      sector: 'Banking',
      siteCount: 1,
    });
    expect(out.length).toBe(1);
    expect(out[0].description).toMatch(/firewall/i);
  });

  it('emits ap+wlc missing for wireless_refresh project', () => {
    const bom: BomLineItem[] = [];
    const out = missingCategoriesRule(bom, {
      sector: 'unknown',
      siteCount: 1,
      projectType: 'wireless_refresh',
    });
    expect(out.map((a) => a.description)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ap/i),
        expect.stringMatching(/wlc/i),
      ]),
    );
  });
});
