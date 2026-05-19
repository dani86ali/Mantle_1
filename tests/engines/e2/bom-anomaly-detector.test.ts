import { describe, it, expect } from 'vitest';
import {
  detectAnomalies,
  type BomLineItem,
  type ProjectContext,
} from '@/engines/e2/bom-anomaly-detector';

const baseCtx: ProjectContext = {
  sector: 'Telecom',
  siteCount: 1,
  userCount: 100,
  description: 'Office network refresh',
};

describe('detectAnomalies (deterministic baseline)', () => {
  it('flags AP count exceeding switch PoE port capacity', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9120-AP', description: 'Catalyst 9120 AP', qty: 100, category: 'Access Point', unitPrice: 800 },
      { sku: 'C9300-24P', description: 'Catalyst 9300 24-port PoE switch', qty: 1, category: 'Switch', unitPrice: 5000 },
    ];

    const result = detectAnomalies(bom, baseCtx);
    const oversized = result.anomalies.find((a) => a.type === 'oversized');
    expect(oversized).toBeDefined();
    expect(oversized!.severity).toBe('error');
    expect(oversized!.affectedSkus).toEqual(
      expect.arrayContaining(['C9120-AP', 'C9300-24P']),
    );
    expect(result.riskLevel).toBe('high');
  });

  it('flags single line >50% of total BoM value as cost_outlier', () => {
    const bom: BomLineItem[] = [
      { sku: 'BIG-SKU', description: 'Expensive line', qty: 1, category: 'Switch', unitPrice: 100_000 },
      { sku: 'SMALL-SKU', description: 'Cheap line', qty: 10, category: 'Cable', unitPrice: 100 },
    ];

    const result = detectAnomalies(bom, baseCtx);
    const outlier = result.anomalies.find((a) => a.type === 'cost_outlier');
    expect(outlier).toBeDefined();
    expect(outlier!.affectedSkus).toEqual(['BIG-SKU']);
    expect(outlier!.severity).toBe('warning');
  });

  it('flags zero-quantity lines as error', () => {
    const bom: BomLineItem[] = [
      { sku: 'EMPTY-SKU', description: 'Forgot the qty', qty: 0, category: 'Switch', unitPrice: 1000 },
    ];

    const result = detectAnomalies(bom, baseCtx);
    const zero = result.anomalies.find((a) => a.affectedSkus.includes('EMPTY-SKU'));
    expect(zero).toBeDefined();
    expect(zero!.severity).toBe('error');
    expect(result.riskLevel).toBe('high');
  });

  it('flags duplicate SKUs with different prices as warning', () => {
    const bom: BomLineItem[] = [
      { sku: 'DUP-SKU', description: 'First line', qty: 1, category: 'Switch', unitPrice: 1000 },
      { sku: 'DUP-SKU', description: 'Second line', qty: 1, category: 'Switch', unitPrice: 1200 },
    ];

    const result = detectAnomalies(bom, baseCtx);
    const dup = result.anomalies.find(
      (a) => a.affectedSkus.includes('DUP-SKU') && a.severity === 'warning',
    );
    expect(dup).toBeDefined();
  });

  it('clean BoM with no issues returns low risk', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9300-24P', description: 'Switch', qty: 4, category: 'Switch', unitPrice: 5000 },
      { sku: 'C9120-AP', description: 'AP', qty: 20, category: 'Access Point', unitPrice: 800 },
      { sku: 'FPR-1010', description: 'Firewall', qty: 1, category: 'Firewall', unitPrice: 6000 },
      { sku: 'PDU-30A', description: 'Rack PDU 30A', qty: 2, category: 'Power', unitPrice: 400 },
      { sku: 'CAB-1M', description: 'Cable', qty: 50, category: 'Cable', unitPrice: 20 },
    ];

    // 800 users / 40 = 20 expected APs → matches qty=20 within ±20%.
    const ctx: ProjectContext = { ...baseCtx, userCount: 800 };
    const result = detectAnomalies(bom, ctx);
    expect(result.anomalies).toEqual([]);
    expect(result.riskLevel).toBe('low');
    expect(result.summary).toBe('No anomalies detected.');
  });

  it('assigns auto-incrementing IDs in AN-XXX format', () => {
    const bom: BomLineItem[] = [
      { sku: 'EMPTY-1', description: 'Zero qty', qty: 0, category: 'Switch', unitPrice: 1000 },
      { sku: 'EMPTY-2', description: 'Zero qty', qty: 0, category: 'Switch', unitPrice: 1000 },
    ];

    const result = detectAnomalies(bom, baseCtx);
    expect(result.anomalies[0].id).toBe('AN-001');
    expect(result.anomalies[1].id).toBe('AN-002');
  });
});

describe('detectAnomalies (expert rules)', () => {
  it('emits missing_component when banking project has no firewall', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9300-24', description: 'Switch', qty: 2, category: 'Switch', unitPrice: 5000 },
    ];

    const result = detectAnomalies(bom, {
      sector: 'Banking',
      siteCount: 1,
      userCount: 200,
    });

    const missing = result.anomalies.find((a) => a.type === 'missing_component');
    expect(missing).toBeDefined();
    expect(missing!.id).toMatch(/^AN-\d{3}$/);
    expect(missing!.description.toLowerCase()).toContain('firewall');
  });

  it('emits unusual_combination when AP count exceeds WLC capacity', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9120-AP', description: 'AP', qty: 200, category: 'Access Point', unitPrice: 800 },
      { sku: 'C9800-WLC', description: 'WLC', qty: 1, category: 'WLC', unitPrice: 30_000 },
      // Add enough switches so AP-vs-PoE check doesn't dominate.
      { sku: 'C9300-48P', description: 'Switch', qty: 6, category: 'Switch', unitPrice: 8000 },
    ];

    const result = detectAnomalies(bom, baseCtx);
    const combo = result.anomalies.find((a) => a.type === 'unusual_combination');
    expect(combo).toBeDefined();
    expect(combo!.description).toMatch(/WLC capacity/);
  });

  it('emits undersized when wireless project has too few APs for user count', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9120-AP', description: 'AP', qty: 1, category: 'Access Point', unitPrice: 800 },
      { sku: 'C9300-48P', description: 'Switch', qty: 8, category: 'Switch', unitPrice: 8000 },
    ];

    const result = detectAnomalies(bom, {
      sector: 'Telecom',
      siteCount: 1,
      userCount: 300,
      hasWireless: true,
    });

    const undersized = result.anomalies.find((a) => a.type === 'undersized');
    expect(undersized).toBeDefined();
    expect(undersized!.description).toMatch(/AP count/);
  });

  it('emits missing_component when HA risk flag is present but no redundant core/firewall', () => {
    const bom: BomLineItem[] = [
      { sku: 'C9300-48P', description: 'Switch', qty: 2, category: 'Switch', unitPrice: 8000 },
      { sku: 'FPR-1010', description: 'Firewall', qty: 1, category: 'Firewall', unitPrice: 6000 },
    ];

    const result = detectAnomalies(bom, baseCtx, {
      riskFlags: [
        {
          severity: 'high',
          pattern: 'high availability',
          matchedText: 'HA required for core network',
          source: 'rfp-section-3.2',
        },
      ],
    });

    const ha = result.anomalies.find(
      (a) => a.type === 'missing_component' && /high availability/i.test(a.description),
    );
    expect(ha).toBeDefined();
    expect(ha!.suggestion).toMatch(/redundant/i);
  });
});
