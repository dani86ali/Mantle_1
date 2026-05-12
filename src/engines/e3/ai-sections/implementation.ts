/** E3 Implementation Approach generator — AI-enhanced, deterministic-first.
 *  Playbook §6.1 section 6: methodology (PPDIOO), phases & milestones,
 *  project plan, team structure, governance & RACI, risk register.
 */

import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { makeSection } from '../section-helpers';
import type { ProposalSection } from '../types';

export type MigrationApproach = 'cutover' | 'parallel' | 'phased';

export interface ImplementationInput {
  projectName: string;
  deviceCount: number;
  siteCount: number;
  phases?: string[];
  migrationApproach?: MigrationApproach;
  timelineWeeks?: number;
  teamRoles?: string[];
}

const ImplementationSchema = z.object({
  content: z.string().min(150),
});

const DEFAULT_PHASES = [
  'Initiation',
  'Design Finalization',
  'Staging',
  'Implementation',
  'Testing',
  'Documentation & KT',
  'Hypercare',
] as const;

const DEFAULT_TEAM_ROLES = [
  'Project Manager',
  'Solution Architect',
  'Senior Network Engineer',
  'Junior Network Engineer',
] as const;

export function computeTimelineWeeks(deviceCount: number): number {
  if (deviceCount < 20) return 8;
  if (deviceCount <= 100) return 12;
  return 16;
}

function sizeLabel(deviceCount: number): string {
  if (deviceCount < 20) return 'small';
  if (deviceCount <= 100) return 'medium';
  return 'large';
}

function phaseDurations(phases: readonly string[], totalWeeks: number): number[] {
  const weights = phases.map((p) => {
    const lower = p.toLowerCase();
    if (lower.includes('implementation')) return 3;
    if (lower.includes('staging') || lower.includes('testing')) return 2;
    return 1;
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (w / totalWeight) * totalWeeks);
  const rounded = raw.map((r) => Math.max(1, Math.round(r)));
  const diff = totalWeeks - rounded.reduce((s, v) => s + v, 0);
  if (diff !== 0) {
    const idx = rounded.indexOf(Math.max(...rounded));
    rounded[idx] = Math.max(1, rounded[idx] + diff);
  }
  return rounded;
}

function migrationNarrative(approach: MigrationApproach): string {
  switch (approach) {
    case 'cutover':
      return 'A **cutover** migration is proposed: the new platform is brought live in a single planned window, with the legacy environment retained as immediate rollback.';
    case 'parallel':
      return 'A **parallel-run** migration is proposed: legacy and new platforms operate side-by-side until acceptance criteria are met, minimising service risk.';
    case 'phased':
      return 'A **phased** migration is proposed: sites and services are cut over in tranches, allowing lessons-learned to be applied between phases.';
  }
}

export function buildDeterministicBrief(input: ImplementationInput): string {
  const { projectName, deviceCount, siteCount } = input;
  const phases = input.phases && input.phases.length > 0 ? input.phases : [...DEFAULT_PHASES];
  const teamRoles = input.teamRoles && input.teamRoles.length > 0 ? input.teamRoles : [...DEFAULT_TEAM_ROLES];
  const totalWeeks = input.timelineWeeks ?? computeTimelineWeeks(deviceCount);
  const approach: MigrationApproach = input.migrationApproach ?? 'phased';
  const durations = phaseDurations(phases, totalWeeks);

  const methodology =
    `Delivery follows **Cisco PPDIOO** (Prepare, Plan, Design, Implement, Operate, Optimize), ` +
    `the industry-standard network lifecycle methodology. ${projectName} spans ${siteCount} ` +
    `site${siteCount === 1 ? '' : 's'} and ${deviceCount} device${deviceCount === 1 ? '' : 's'}, ` +
    `which we classify as a **${sizeLabel(deviceCount)}** engagement with an estimated ${totalWeeks}-week delivery window.`;

  const phaseRows: string[] = [
    '| # | Phase | Duration (weeks) | Key Activities |',
    '|---|---|---|---|',
  ];
  phases.forEach((phase, i) => {
    phaseRows.push(`| ${i + 1} | ${phase} | ${durations[i]} | Phase deliverables and exit criteria |`);
  });

  const team =
    `### Team Structure\n\nThe core delivery team for this engagement comprises ` +
    teamRoles.map((r) => `**${r}**`).join(', ') +
    `. Each role is named in the project organisation chart with backup coverage identified.`;

  const governance =
    `### Governance & RACI\n\nWeekly status meetings are held with the customer ` +
    `Project Manager and Solution Architect. A formal change-control board reviews any ` +
    `variation against agreed scope, cost, or timeline. A RACI matrix is published in the ` +
    `Project Initiation Document (PID) covering design sign-off, staging acceptance, ` +
    `production cutover, and acceptance testing. ${migrationNarrative(approach)}`;

  const risk =
    `### Risk Register & Mitigations\n\nA live risk register is maintained from kick-off, ` +
    `reviewed weekly. Standing risks include circuit delivery slippage (mitigated by early ` +
    `carrier engagement), site access and visa lead times (mitigated by 4-week advance ` +
    `notice), and customer resource availability for UAT (mitigated by named alternates).`;

  return [
    '## Implementation Approach',
    '',
    '### Methodology',
    '',
    methodology,
    '',
    '### Phases & Milestones',
    '',
    ...phaseRows,
    '',
    team,
    '',
    governance,
    '',
    risk,
  ].join('\n');
}

const SYSTEM_PROMPT =
  'You are a project delivery manager writing the implementation approach for a network ' +
  'deployment. Be specific about phases, durations, and dependencies. Tailor to the project ' +
  'size and migration approach. ~600 words. Return strict JSON only.';

function buildUserPrompt(input: ImplementationInput, brief: string): string {
  const approach: MigrationApproach = input.migrationApproach ?? 'phased';
  return [
    `Project: ${input.projectName}`,
    `Scale: ${input.deviceCount} devices across ${input.siteCount} site(s) (${sizeLabel(input.deviceCount)})`,
    `Migration approach: ${approach}`,
    `Estimated timeline: ${input.timelineWeeks ?? computeTimelineWeeks(input.deviceCount)} weeks`,
    '',
    'Structured brief (rewrite as ~600 words of delivery-manager prose; preserve all phase ' +
      'names, durations, and the migration approach verbatim, and keep the phase table intact):',
    '',
    brief,
    '',
    'Respond with strict JSON: {"content": "<markdown implementation approach, ~600 words, ' +
      'starting with `## Implementation Approach` heading, retaining the phase markdown table>"}.',
  ].join('\n');
}

export async function generateImplementation(
  input: ImplementationInput,
): Promise<ProposalSection> {
  const brief = buildDeterministicBrief(input);

  const result = await callAI({
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildUserPrompt(input, brief),
    outputSchema: ImplementationSchema,
    taskId: `implementation:${input.projectName.slice(0, 40)}`,
  });

  const content = result.success ? result.data.content : brief;
  return makeSection('implementation', content);
}
