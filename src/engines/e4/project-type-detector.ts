import { z } from 'zod';
import type { ProjectType } from './types';

const ProjectTypeSchema = z.enum([
  'campus_refresh',
  'greenfield_campus',
  'sd_wan',
  'dc_modernization',
  'wireless_deployment',
  'security_upgrade',
  'branch_rollout',
  'cloud_connectivity',
  'ot_network',
  'general',
]);

export const ProjectTypeDetectionSchema = z.object({
  type: ProjectTypeSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});
export type ProjectTypeDetection = z.infer<typeof ProjectTypeDetectionSchema>;

type NonGeneralType = Exclude<ProjectType, 'general'>;

const PATTERNS: { type: NonGeneralType; pattern: RegExp }[] = [
  // campus_refresh
  { type: 'campus_refresh',      pattern: /(?<![a-zA-Z])campus\s+(?:\w+\s+)?refresh(?![a-zA-Z])/gi },
  { type: 'campus_refresh',      pattern: /(?<![a-zA-Z])switch\s+replacement(?![a-zA-Z])/gi },
  { type: 'campus_refresh',      pattern: /(?<![a-zA-Z])LAN\s+(?:upgrade|refresh)(?![a-zA-Z])/gi },
  { type: 'campus_refresh',      pattern: /(?<![a-zA-Z])access\s+layer(?![a-zA-Z])/gi },

  // greenfield_campus
  { type: 'greenfield_campus',   pattern: /(?<![a-zA-Z])new\s+building(?![a-zA-Z])/gi },
  { type: 'greenfield_campus',   pattern: /(?<![a-zA-Z])greenfield(?![a-zA-Z])/gi },
  { type: 'greenfield_campus',   pattern: /(?<![a-zA-Z])new\s+campus(?![a-zA-Z])/gi },
  { type: 'greenfield_campus',   pattern: /(?<![a-zA-Z])new\s+office(?![a-zA-Z])/gi },

  // sd_wan
  { type: 'sd_wan',              pattern: /(?<![a-zA-Z])SD[\s-]?WAN(?![a-zA-Z])/gi },
  { type: 'sd_wan',              pattern: /(?<![a-zA-Z])WAN\s+transformation(?![a-zA-Z])/gi },
  { type: 'sd_wan',              pattern: /(?<![a-zA-Z])MPLS\s+migration(?![a-zA-Z])/gi },
  { type: 'sd_wan',              pattern: /(?<![a-zA-Z])branch\s+connectivity(?![a-zA-Z])/gi },

  // dc_modernization
  { type: 'dc_modernization',    pattern: /(?<![a-zA-Z])data\s+cent(?:er|re)(?![a-zA-Z])/gi },
  { type: 'dc_modernization',    pattern: /(?<![a-zA-Z])DC\s+refresh(?![a-zA-Z])/gi },
  { type: 'dc_modernization',    pattern: /(?<![a-zA-Z])spine[\s-]leaf(?![a-zA-Z])/gi },
  { type: 'dc_modernization',    pattern: /(?<![a-zA-Z])ACI(?![a-zA-Z])/g },
  { type: 'dc_modernization',    pattern: /(?<![a-zA-Z])fabric(?![a-zA-Z])/gi },

  // wireless_deployment
  { type: 'wireless_deployment', pattern: /(?<![a-zA-Z])wireless(?![a-zA-Z])/gi },
  { type: 'wireless_deployment', pattern: /(?<![a-zA-Z])Wi-?Fi(?![a-zA-Z])/gi },
  { type: 'wireless_deployment', pattern: /(?<![a-zA-Z])AP\s+deployment(?![a-zA-Z])/gi },
  { type: 'wireless_deployment', pattern: /(?<![a-zA-Z])WLAN(?![a-zA-Z])/gi },
  { type: 'wireless_deployment', pattern: /(?<![a-zA-Z])coverage(?![a-zA-Z])/gi },

  // security_upgrade
  { type: 'security_upgrade',    pattern: /(?<![a-zA-Z])firewall(?![a-zA-Z])/gi },
  { type: 'security_upgrade',    pattern: /(?<![a-zA-Z])NGFW(?![a-zA-Z])/gi },
  { type: 'security_upgrade',    pattern: /(?<![a-zA-Z])zero[\s-]trust(?![a-zA-Z])/gi },
  { type: 'security_upgrade',    pattern: /(?<![a-zA-Z])NAC(?![a-zA-Z])/g },
  { type: 'security_upgrade',    pattern: /(?<![a-zA-Z])segmentation(?![a-zA-Z])/gi },

  // branch_rollout
  { type: 'branch_rollout',      pattern: /(?<![a-zA-Z])branch(?![a-zA-Z])/gi },
  { type: 'branch_rollout',      pattern: /(?<![a-zA-Z])retail(?![a-zA-Z])/gi },
  { type: 'branch_rollout',      pattern: /(?<![a-zA-Z])new\s+stores?(?![a-zA-Z])/gi },
  { type: 'branch_rollout',      pattern: /(?<![a-zA-Z])site\s+rollout(?![a-zA-Z])/gi },

  // cloud_connectivity
  { type: 'cloud_connectivity',  pattern: /(?<![a-zA-Z])cloud(?![a-zA-Z])/gi },
  { type: 'cloud_connectivity',  pattern: /(?<![a-zA-Z])Direct\s+Connect(?![a-zA-Z])/gi },
  { type: 'cloud_connectivity',  pattern: /(?<![a-zA-Z])ExpressRoute(?![a-zA-Z])/gi },
  { type: 'cloud_connectivity',  pattern: /(?<![a-zA-Z])hybrid\s+cloud(?![a-zA-Z])/gi },

  // ot_network
  { type: 'ot_network',          pattern: /(?<![a-zA-Z])OT(?![a-zA-Z])/g },
  { type: 'ot_network',          pattern: /(?<![a-zA-Z])SCADA(?![a-zA-Z])/g },
  { type: 'ot_network',          pattern: /(?<![a-zA-Z])industrial(?![a-zA-Z])/gi },
  { type: 'ot_network',          pattern: /(?<![a-zA-Z])ICS(?![a-zA-Z])/g },
  { type: 'ot_network',          pattern: /(?<![a-zA-Z])operational\s+technology(?![a-zA-Z])/gi },
];

const TYPE_ORDER: NonGeneralType[] = [
  'campus_refresh',
  'greenfield_campus',
  'sd_wan',
  'dc_modernization',
  'wireless_deployment',
  'security_upgrade',
  'branch_rollout',
  'cloud_connectivity',
  'ot_network',
];

export function detectProjectType(
  description: string,
  _clientName?: string,
  _sector?: string,
): ProjectTypeDetection {
  void _clientName;
  void _sector;

  const counts = new Map<NonGeneralType, number>();
  const samples = new Map<NonGeneralType, string>();

  for (const { type, pattern } of PATTERNS) {
    const matches = description.match(pattern);
    if (matches && matches.length > 0) {
      counts.set(type, (counts.get(type) ?? 0) + matches.length);
      if (!samples.has(type)) samples.set(type, matches[0]);
    }
  }

  if (counts.size === 0) {
    return ProjectTypeDetectionSchema.parse({
      type: 'general',
      confidence: 0.3,
      evidence: ['No project-type signals found in description'],
    });
  }

  let topType: NonGeneralType = TYPE_ORDER[0];
  let topCount = -1;
  for (const t of TYPE_ORDER) {
    const c = counts.get(t) ?? 0;
    if (c > topCount) {
      topCount = c;
      topType = t;
    }
  }

  const evidence: string[] = [];
  for (const t of TYPE_ORDER) {
    const c = counts.get(t);
    if (c && c > 0) {
      evidence.push(`${t}: ${c} match(es), first="${samples.get(t)}"`);
    }
  }

  return ProjectTypeDetectionSchema.parse({
    type: topType,
    confidence: Math.min(0.5 + topCount * 0.1, 0.95),
    evidence,
  });
}
