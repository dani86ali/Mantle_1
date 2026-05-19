import type { BomLineItem, ProjectContext } from '../bom-anomaly-detector';
import type { RawAnomaly } from './types';

interface ProjectTypeRule {
  match: RegExp;
  label: string;
  expected: string[];
  optional?: string[];
}

const PROJECT_TYPE_RULES: ProjectTypeRule[] = [
  {
    match: /campus[_\s-]?lan|enterprise[_\s-]?lan/i,
    label: 'campus LAN',
    expected: ['switch'],
    optional: ['ap', 'wlc', 'firewall'],
  },
  {
    match: /data[_\s-]?center|datacenter/i,
    label: 'data center',
    expected: ['switch', 'firewall'],
  },
  {
    match: /wireless[_\s-]?refresh|wifi[_\s-]?refresh/i,
    label: 'wireless refresh',
    expected: ['ap', 'wlc'],
  },
  {
    match: /unified[_\s-]?comm|uc|collaboration/i,
    label: 'unified comm',
    expected: ['phone'],
    optional: ['video', 'gateway'],
  },
  {
    match: /security[_\s-]?refresh|banking|finance/i,
    label: 'security refresh',
    expected: ['firewall'],
  },
];

const CATEGORY_PATTERNS: Record<string, RegExp> = {
  switch: /switch|catalyst|nexus/i,
  ap: /access[_\s-]?point|\bap\b|wireless|wi[_\s-]?fi/i,
  wlc: /wireless[_\s-]?controller|\bwlc\b/i,
  firewall: /firewall|fortigate|asa|firepower|fpr/i,
  phone: /phone|handset|ip[_\s-]?phone/i,
  video: /video|webex|telepresence|codec/i,
  gateway: /gateway|sbc|router/i,
};

function bomHasCategory(bom: BomLineItem[], category: string): boolean {
  const pattern = CATEGORY_PATTERNS[category];
  if (!pattern) return false;
  return bom.some(
    (item) => pattern.test(item.category) || pattern.test(item.description),
  );
}

export function missingCategoriesRule(
  bom: BomLineItem[],
  ctx: ProjectContext,
): RawAnomaly[] {
  const probe = `${ctx.projectType ?? ''} ${ctx.sector ?? ''}`.trim();
  if (probe.length === 0) return [];

  const rule = PROJECT_TYPE_RULES.find((r) => r.match.test(probe));
  if (!rule) return [];

  const out: RawAnomaly[] = [];
  for (const expected of rule.expected) {
    if (!bomHasCategory(bom, expected)) {
      out.push({
        type: 'missing_component',
        description: `${rule.label} project is missing expected ${expected} component`,
        severity: 'error',
        affectedSkus: [],
        suggestion: `Add at least one ${expected} to satisfy the ${rule.label} scope.`,
      });
    }
  }
  return out;
}
