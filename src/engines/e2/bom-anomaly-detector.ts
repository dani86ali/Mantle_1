import { runExpertRules } from './expert-rules';
import type { RawAnomaly } from './expert-rules/types';

export interface BomLineItem {
  sku: string;
  description: string;
  qty: number;
  category: string;
  unitPrice?: number;
}

export interface ProjectContext {
  sector: string;
  siteCount: number;
  userCount?: number;
  description?: string;
  projectType?: string;
  hasWireless?: boolean;
}

export interface AnomalyRiskContext {
  severity: string;
  pattern: string;
  matchedText: string;
  source: string;
}

export interface AnomalyDetectionOptions {
  riskFlags?: AnomalyRiskContext[];
}

export type AnomalyType =
  | 'quantity_mismatch'
  | 'missing_component'
  | 'oversized'
  | 'undersized'
  | 'unusual_combination'
  | 'cost_outlier';

export type AnomalySeverity = 'warning' | 'error';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  description: string;
  severity: AnomalySeverity;
  affectedSkus: string[];
  suggestion: string;
}

export interface AnomalyResult {
  anomalies: Anomaly[];
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

const COST_OUTLIER_RATIO = 0.5;
const AP_CATEGORY = /access[- ]?point|wireless|wi[- ]?fi|\bap\b/i;
const SWITCH_CATEGORY = /switch/i;
const SWITCH_POE_PORTS_PER_UNIT = 48;

function lineTotal(item: BomLineItem): number {
  return (item.unitPrice ?? 0) * item.qty;
}

function deterministicChecks(bom: BomLineItem[]): RawAnomaly[] {
  const out: RawAnomaly[] = [];

  for (const item of bom) {
    if (item.qty <= 0) {
      out.push({
        type: 'quantity_mismatch',
        description: `Line item ${item.sku} has non-positive quantity (${item.qty})`,
        severity: 'error',
        affectedSkus: [item.sku],
        suggestion: 'Set a positive quantity or remove the line.',
      });
    }
  }

  const apQty = bom
    .filter((i) => AP_CATEGORY.test(i.category))
    .reduce((sum, i) => sum + i.qty, 0);
  const switchQty = bom
    .filter((i) => SWITCH_CATEGORY.test(i.category))
    .reduce((sum, i) => sum + i.qty, 0);
  const switchPorts = switchQty * SWITCH_POE_PORTS_PER_UNIT;
  if (apQty > 0 && switchPorts > 0 && apQty > switchPorts) {
    out.push({
      type: 'oversized',
      description: `Access point count (${apQty}) exceeds switch PoE port capacity (${switchPorts})`,
      severity: 'error',
      affectedSkus: bom
        .filter(
          (i) => AP_CATEGORY.test(i.category) || SWITCH_CATEGORY.test(i.category),
        )
        .map((i) => i.sku),
      suggestion: 'Add more PoE switches or reduce AP count.',
    });
  }

  const total = bom.reduce((sum, i) => sum + lineTotal(i), 0);
  if (total > 0) {
    for (const item of bom) {
      if (lineTotal(item) > total * COST_OUTLIER_RATIO) {
        out.push({
          type: 'cost_outlier',
          description: `Line ${item.sku} accounts for >${Math.round(
            COST_OUTLIER_RATIO * 100,
          )}% of total BoM value`,
          severity: 'warning',
          affectedSkus: [item.sku],
          suggestion: 'Verify quantity and unit price for this line.',
        });
      }
    }
  }

  const bySku = new Map<string, BomLineItem[]>();
  for (const item of bom) {
    const list = bySku.get(item.sku) ?? [];
    list.push(item);
    bySku.set(item.sku, list);
  }
  bySku.forEach((items: BomLineItem[], sku: string) => {
    if (items.length < 2) return;
    const prices = new Set(
      items
        .map((i: BomLineItem) => i.unitPrice)
        .filter((p): p is number => typeof p === 'number'),
    );
    if (prices.size > 1) {
      out.push({
        type: 'quantity_mismatch',
        description: `SKU ${sku} appears multiple times with different unit prices`,
        severity: 'warning',
        affectedSkus: [sku],
        suggestion: 'Consolidate duplicate lines or confirm pricing.',
      });
    }
  });

  return out;
}

function computeRiskLevel(anomalies: Anomaly[]): 'low' | 'medium' | 'high' {
  const errors = anomalies.filter((a) => a.severity === 'error').length;
  if (errors > 0) return 'high';
  if (anomalies.length > 0) return 'medium';
  return 'low';
}

function assignIds(raws: RawAnomaly[]): Anomaly[] {
  return raws.map((r, idx) => ({
    id: `AN-${String(idx + 1).padStart(3, '0')}`,
    ...r,
  }));
}

export function detectAnomalies(
  bom: BomLineItem[],
  projectContext: ProjectContext,
  options?: AnomalyDetectionOptions,
): AnomalyResult {
  const deterministic = deterministicChecks(bom);
  const expert = runExpertRules(bom, projectContext, options);
  const merged = assignIds([...deterministic, ...expert]);
  const riskLevel = computeRiskLevel(merged);
  const summary =
    merged.length === 0
      ? 'No anomalies detected.'
      : `${merged.length} anomalies detected (${
          merged.filter((a) => a.severity === 'error').length
        } error, ${merged.filter((a) => a.severity === 'warning').length} warning).`;
  return { anomalies: merged, riskLevel, summary };
}
