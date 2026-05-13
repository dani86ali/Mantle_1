import type { EmphasisLevel, ProjectType } from './types';

const SECTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
type SectionId = (typeof SECTION_IDS)[number];

const EMPHASIS_OVERRIDES: Record<ProjectType, Partial<Record<SectionId, EmphasisLevel>>> = {
  campus_refresh:      { B: 'high', D: 'high', F: 'medium' },
  greenfield_campus:   { A: 'high', D: 'high' },
  sd_wan:              { B: 'high', C: 'high', D: 'high' },
  dc_modernization:    { B: 'high', C: 'high', D: 'high' },
  wireless_deployment: { B: 'high', D: 'high' },
  security_upgrade:    { B: 'high', E: 'high' },
  branch_rollout:      { A: 'high', B: 'high', D: 'high', F: 'high' },
  cloud_connectivity:  { B: 'high', C: 'high', D: 'high' },
  ot_network:          { B: 'high', E: 'high' },
  general:             {},
};

export function getEmphasis(projectType: ProjectType): Record<string, EmphasisLevel> {
  const overrides = EMPHASIS_OVERRIDES[projectType];
  const result: Record<string, EmphasisLevel> = {};
  for (const id of SECTION_IDS) {
    result[id] = overrides[id] ?? 'medium';
  }
  return result;
}

const LEVEL_RANK: Record<EmphasisLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
  skip: 3,
};

export function getPrioritizedSections(projectType: ProjectType): string[] {
  const emphasis = getEmphasis(projectType);
  return [...SECTION_IDS].sort((a, b) => {
    const diff = LEVEL_RANK[emphasis[a]] - LEVEL_RANK[emphasis[b]];
    if (diff !== 0) return diff;
    return SECTION_IDS.indexOf(a) - SECTION_IDS.indexOf(b);
  });
}
