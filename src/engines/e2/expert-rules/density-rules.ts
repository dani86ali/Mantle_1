import type { BomLineItem, ProjectContext } from '../bom-anomaly-detector';
import type { RawAnomaly } from './types';

const AP_PATTERN = /access[_\s-]?point|\bap\b|wireless|wi[_\s-]?fi/i;
const SWITCH_PATTERN = /switch|catalyst|nexus/i;

const USERS_PER_AP = 40;
const USER_TO_PORT_RATIO = 1.2;
const PORTS_PER_SWITCH = 48;
const TOLERANCE = 0.2;

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

export function densityRulesRule(
  bom: BomLineItem[],
  ctx: ProjectContext,
): RawAnomaly[] {
  const out: RawAnomaly[] = [];
  const users = ctx.userCount ?? 0;
  if (users <= 0) return out;

  const apQty = totalQty(bom, AP_PATTERN);
  const expectedAPs = Math.ceil(users / USERS_PER_AP);
  const low = Math.floor(expectedAPs * (1 - TOLERANCE));
  const high = Math.ceil(expectedAPs * (1 + TOLERANCE));
  if (apQty < low) {
    out.push({
      type: 'undersized',
      description: `AP count (${apQty}) below expected ~${expectedAPs} for ${users} users`,
      severity: 'warning',
      affectedSkus: skusMatching(bom, AP_PATTERN),
      suggestion: `Provision at least ${low} APs (1 per ~${USERS_PER_AP} users).`,
    });
  } else if (apQty > high) {
    out.push({
      type: 'oversized',
      description: `AP count (${apQty}) above expected ~${expectedAPs} for ${users} users`,
      severity: 'warning',
      affectedSkus: skusMatching(bom, AP_PATTERN),
      suggestion: 'Confirm density requirement justifies the extra APs.',
    });
  }

  if (ctx.hasWireless) {
    const switchQty = totalQty(bom, SWITCH_PATTERN);
    if (switchQty > 0) {
      const expectedPorts = Math.ceil(users * USER_TO_PORT_RATIO);
      const actualPorts = switchQty * PORTS_PER_SWITCH;
      const portLow = Math.floor(expectedPorts * (1 - TOLERANCE));
      const portHigh = Math.ceil(expectedPorts * (1 + TOLERANCE));
      if (actualPorts < portLow) {
        out.push({
          type: 'undersized',
          description: `Switch port capacity (${actualPorts}) below expected ~${expectedPorts} for ${users} users`,
          severity: 'warning',
          affectedSkus: skusMatching(bom, SWITCH_PATTERN),
          suggestion: 'Add switches to meet wired-port demand with headroom.',
        });
      } else if (actualPorts > portHigh) {
        out.push({
          type: 'oversized',
          description: `Switch port capacity (${actualPorts}) above expected ~${expectedPorts} for ${users} users`,
          severity: 'warning',
          affectedSkus: skusMatching(bom, SWITCH_PATTERN),
          suggestion: 'Verify port-count provisioning is not over-spec.',
        });
      }
    }
  }

  return out;
}
