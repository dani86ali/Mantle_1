import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}));

import { callAI } from '@/lib/ai/client';
import {
  detectAnomalies,
  type BomLineItem,
  type ProjectContext,
} from '@/engines/e2/bom-anomaly-detector';

const mockCallAI = vi.mocked(callAI);

beforeEach(() => {
  mockCallAI.mockReset();
  mockCallAI.mockResolvedValue({
    success: true,
    data: { anomalies: [], riskLevel: 'low', summary: 'AI ok' },
    tokensUsed: 0,
    latencyMs: 0,
  });
});

const baseCtx: ProjectContext = {
  sector: 'Telecom',
  siteCount: 1,
  userCount: 100,
  description: 'Office network refresh',
};

describe('detectAnomalies', () => {
  it('flags AP count exceeding switch PoE port capacity (deterministic)', async () => {
    const bom: BomLineItem[] = [
      {
        sku: 'C9120-AP',
        description: 'Catalyst 9120 AP',
        qty: 100,
        category: 'Access Point',
        unitPrice: 800,
      },
      {
        sku: 'C9300-24P',
        description: 'Catalyst 9300 24-port PoE switch',
        qty: 1,
        category: 'Switch',
        unitPrice: 5000,
      },
    ];

    const result = await detectAnomalies(bom, baseCtx);
    const oversized = result.anomalies.find((a) => a.type === 'oversized');
    expect(oversized).toBeDefined();
    expect(oversized!.severity).toBe('error');
    expect(oversized!.affectedSkus).toEqual(
      expect.arrayContaining(['C9120-AP', 'C9300-24P']),
    );
    expect(result.riskLevel).toBe('high');
  });

  it('flags single line >50% of total BoM value as cost_outlier', async () => {
    const bom: BomLineItem[] = [
      {
        sku: 'BIG-SKU',
        description: 'Expensive line',
        qty: 1,
        category: 'Switch',
        unitPrice: 100_000,
      },
      {
        sku: 'SMALL-SKU',
        description: 'Cheap line',
        qty: 10,
        category: 'Cable',
        unitPrice: 100,
      },
    ];

    const result = await detectAnomalies(bom, baseCtx);
    const outlier = result.anomalies.find((a) => a.type === 'cost_outlier');
    expect(outlier).toBeDefined();
    expect(outlier!.affectedSkus).toEqual(['BIG-SKU']);
    expect(outlier!.severity).toBe('warning');
  });

  it('flags zero-quantity lines as error', async () => {
    const bom: BomLineItem[] = [
      {
        sku: 'EMPTY-SKU',
        description: 'Forgot the qty',
        qty: 0,
        category: 'Switch',
        unitPrice: 1000,
      },
    ];

    const result = await detectAnomalies(bom, baseCtx);
    const zero = result.anomalies.find((a) => a.affectedSkus.includes('EMPTY-SKU'));
    expect(zero).toBeDefined();
    expect(zero!.severity).toBe('error');
    expect(result.riskLevel).toBe('high');
  });

  it('flags duplicate SKUs with different prices as warning', async () => {
    const bom: BomLineItem[] = [
      {
        sku: 'DUP-SKU',
        description: 'First line',
        qty: 1,
        category: 'Switch',
        unitPrice: 1000,
      },
      {
        sku: 'DUP-SKU',
        description: 'Second line',
        qty: 1,
        category: 'Switch',
        unitPrice: 1200,
      },
    ];

    const result = await detectAnomalies(bom, baseCtx);
    const dup = result.anomalies.find(
      (a) => a.affectedSkus.includes('DUP-SKU') && a.severity === 'warning',
    );
    expect(dup).toBeDefined();
  });

  it('AI adds missing-component anomaly for banking project without firewall', async () => {
    const bom: BomLineItem[] = [
      {
        sku: 'C9300-24',
        description: 'Switch',
        qty: 2,
        category: 'Switch',
        unitPrice: 5000,
      },
    ];
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        anomalies: [
          {
            type: 'missing_component',
            description: 'Banking project has no firewall component',
            severity: 'error',
            affectedSkus: [],
            suggestion: 'Add a perimeter firewall such as FPR-1010.',
          },
        ],
        riskLevel: 'high',
        summary: 'Missing security stack for banking sector.',
      },
      tokensUsed: 200,
      latencyMs: 50,
    });

    const result = await detectAnomalies(bom, {
      sector: 'Banking',
      siteCount: 1,
      userCount: 200,
    });

    const missing = result.anomalies.find((a) => a.type === 'missing_component');
    expect(missing).toBeDefined();
    expect(missing!.id).toMatch(/^AN-\d{3}$/);
    expect(missing!.description).toContain('firewall');
  });

  it('returns deterministic anomalies even when AI fails', async () => {
    const bom: BomLineItem[] = [
      {
        sku: 'EMPTY-SKU',
        description: 'Zero qty',
        qty: 0,
        category: 'Switch',
        unitPrice: 1000,
      },
    ];
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'rate limit',
      retryCount: 1,
      fallback: 'engineer_review',
    });

    const result = await detectAnomalies(bom, baseCtx);
    expect(result.anomalies.length).toBeGreaterThan(0);
    expect(result.anomalies[0].affectedSkus).toContain('EMPTY-SKU');
  });

  it('clean BoM with no issues returns low risk', async () => {
    const bom: BomLineItem[] = [
      {
        sku: 'C9300-24P',
        description: 'Switch',
        qty: 4,
        category: 'Switch',
        unitPrice: 5000,
      },
      {
        sku: 'C9120-AP',
        description: 'AP',
        qty: 20,
        category: 'Access Point',
        unitPrice: 800,
      },
      {
        sku: 'FPR-1010',
        description: 'Firewall',
        qty: 1,
        category: 'Firewall',
        unitPrice: 6000,
      },
      {
        sku: 'CAB-1M',
        description: 'Cable',
        qty: 50,
        category: 'Cable',
        unitPrice: 20,
      },
    ];

    const result = await detectAnomalies(bom, baseCtx);
    expect(result.anomalies).toEqual([]);
    expect(result.riskLevel).toBe('low');
    expect(result.summary).toBe('No anomalies detected.');
  });

  it('assigns auto-incrementing IDs in AN-XXX format', async () => {
    const bom: BomLineItem[] = [
      {
        sku: 'EMPTY-1',
        description: 'Zero qty',
        qty: 0,
        category: 'Switch',
        unitPrice: 1000,
      },
      {
        sku: 'EMPTY-2',
        description: 'Zero qty',
        qty: 0,
        category: 'Switch',
        unitPrice: 1000,
      },
    ];

    const result = await detectAnomalies(bom, baseCtx);
    expect(result.anomalies[0].id).toBe('AN-001');
    expect(result.anomalies[1].id).toBe('AN-002');
  });
});
