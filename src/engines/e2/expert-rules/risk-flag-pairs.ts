import type {
  BomLineItem,
  AnomalyRiskContext,
} from '../bom-anomaly-detector';
import type { RawAnomaly } from './types';

const HA_PATTERN = /high[\s_-]?availability|HA[\s_-]?required|redundancy/i;
const IKTVA_PATTERN = /iktva|saudi[\s_-]?origin|local[\s_-]?content/i;
const PENALTY_PATTERN = /financial[\s_-]?penalty|liquidated[\s_-]?damages/i;

const CORE_PATTERN = /firewall|fortigate|asa|firepower|fpr|core[\s_-]?switch|nexus/i;

function totalQty(bom: BomLineItem[], pattern: RegExp): number {
  return bom
    .filter((i) => pattern.test(i.category) || pattern.test(i.description))
    .reduce((sum, i) => sum + i.qty, 0);
}

export function riskFlagPairsRule(
  bom: BomLineItem[],
  riskFlags: AnomalyRiskContext[],
): RawAnomaly[] {
  if (!riskFlags || riskFlags.length === 0) return [];

  const out: RawAnomaly[] = [];

  for (const flag of riskFlags) {
    const text = `${flag.pattern} ${flag.matchedText}`;

    if (HA_PATTERN.test(text)) {
      const coreQty = totalQty(bom, CORE_PATTERN);
      if (coreQty < 2) {
        out.push({
          type: 'missing_component',
          description: `RFP requires high availability but core/firewall count is ${coreQty}`,
          severity: 'warning',
          affectedSkus: [],
          suggestion: 'Provision redundant core/firewall pairs to satisfy HA requirement.',
        });
      }
    }

    if (IKTVA_PATTERN.test(text)) {
      out.push({
        type: 'unusual_combination',
        description: 'IKTVA / Saudi local-content requirement flagged in RFP',
        severity: 'warning',
        affectedSkus: [],
        suggestion: 'Verify SKU sourcing aligns with local-content obligations.',
      });
    }

    if (PENALTY_PATTERN.test(text)) {
      out.push({
        type: 'unusual_combination',
        description: 'Contract carries financial penalty / liquidated damages clause',
        severity: 'warning',
        affectedSkus: [],
        suggestion: 'Surface SLA exposure to bid team; consider risk premium in margin.',
      });
    }
  }

  return out;
}
