import type { BomLineItem } from '../bom-anomaly-detector';
import type { RawAnomaly } from './types';

const AP_PATTERN = /access[_\s-]?point|\bap\b|wireless|wi[_\s-]?fi/i;
const WLC_PATTERN = /wireless[_\s-]?controller|\bwlc\b/i;
const SWITCH_PATTERN = /switch|catalyst|nexus/i;
const PDU_PATTERN = /pdu|power[_\s-]?distribution/i;

const APS_PER_WLC = 50;

function totalQty(bom: BomLineItem[], pattern: RegExp): number {
  return bom
    .filter((i) => pattern.test(i.category) || pattern.test(i.description))
    .reduce((sum, i) => sum + i.qty, 0);
}

function skusMatching(bom: BomLineItem[], pattern: RegExp): string[] {
  return bom
    .filter((i) => pattern.test(i.category) || pattern.test(i.description))
    .map((i) => i.sku);
}

export function componentRatiosRule(bom: BomLineItem[]): RawAnomaly[] {
  const out: RawAnomaly[] = [];

  const apQty = totalQty(bom, AP_PATTERN);
  const wlcQty = totalQty(bom, WLC_PATTERN);
  if (apQty > 0 && wlcQty > 0) {
    const capacity = wlcQty * APS_PER_WLC;
    if (apQty > capacity) {
      out.push({
        type: 'unusual_combination',
        description: `AP count (${apQty}) exceeds WLC capacity (${wlcQty} × ${APS_PER_WLC} = ${capacity})`,
        severity: 'warning',
        affectedSkus: [
          ...skusMatching(bom, AP_PATTERN),
          ...skusMatching(bom, WLC_PATTERN),
        ],
        suggestion: 'Add a controller or upgrade to a higher-capacity WLC.',
      });
    }
  }

  const switchQty = totalQty(bom, SWITCH_PATTERN);
  const pduQty = totalQty(bom, PDU_PATTERN);
  if (switchQty > 1 && pduQty === 0) {
    out.push({
      type: 'missing_component',
      description: `BoM has ${switchQty} switches but no rack PDU`,
      severity: 'warning',
      affectedSkus: skusMatching(bom, SWITCH_PATTERN),
      suggestion: 'Confirm rack power distribution is sourced separately, or add a PDU SKU.',
    });
  }

  return out;
}
