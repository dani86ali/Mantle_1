/** E3 Scope Customizer — AI-enhanced, deterministic-first.
 *  Playbook §6.1 section 9 (Scope, Assumptions, Exclusions, Dependencies)
 *  + §6.4 MENA-specific items (Saudization, Etimad, NCA ECC, ICV, NESA, Arabic).
 */

import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { getBoilerplate, renderBoilerplate } from '../boilerplate-kb';
import { makeSection } from '../section-helpers';
import type { ProposalSection } from '../types';

export interface ScopeInput {
  projectName: string;
  customerName: string;
  siteCount: number;
  country: string;
  sector: string;
  vendorStack: string[];
  projectSpecificAssumptions?: string[];
  projectSpecificExclusions?: string[];
}

const ScopeSchema = z.object({
  content: z.string().min(100),
});

function isKSA(country: string): boolean {
  const c = country.trim().toLowerCase();
  return c === 'ksa' || c === 'saudi arabia' || c === 'kingdom of saudi arabia';
}

function isUAE(country: string): boolean {
  const c = country.trim().toLowerCase();
  return c === 'uae' || c === 'united arab emirates' || c === 'u.a.e.';
}

function isGovernmentSector(sector: string): boolean {
  const s = sector.trim().toLowerCase();
  return s.includes('government') || s.includes('public sector') || s === 'gov';
}

export function buildMenaItems(country: string, sector: string): string[] {
  const items: string[] = [];
  if (isKSA(country)) {
    items.push(
      'Saudization quotas apply to on-site delivery staff per the Nitaqat programme; staffing plan reflects compliant ratios.',
      'Tender submission and contract execution will use the Etimad e-procurement portal where applicable.',
      'Security controls align with NCA ECC-1:2018 (Essential Cybersecurity Controls) and SAMA CSF where the sector requires.',
    );
  }
  if (isUAE(country)) {
    items.push(
      'In-Country Value (ICV) scoring evidence will be provided per UAE federal procurement requirements.',
      'Security controls align with NESA / UAE IA standards for the applicable assurance level.',
    );
  }
  if ((isKSA(country) || isUAE(country)) && isGovernmentSector(sector)) {
    items.push(
      'Arabic-language deliverables (compliance matrix, executive summary, signature page) will be provided; a 2–3 day translation cycle is built into the schedule.',
    );
  }
  return items;
}

function bulletList(items: string[]): string {
  return items.map((s) => `- ${s.trim()}`).filter((s) => s.length > 2).join('\n');
}

export function buildDeterministicBrief(input: ScopeInput): string {
  const {
    projectName,
    customerName,
    siteCount,
    country,
    sector,
    vendorStack,
    projectSpecificAssumptions,
    projectSpecificExclusions,
  } = input;

  const boilerplate = renderBoilerplate(
    getBoilerplate('scope_assumptions'),
    { tenantName: 'the Systems Integrator' },
  );

  const overview =
    `This section defines the scope, assumptions, exclusions, and dependencies for the ` +
    `${projectName} engagement for ${customerName}. The solution covers ${siteCount} ` +
    `site${siteCount === 1 ? '' : 's'} in ${country} (${sector} sector) and is built on ` +
    `${vendorStack.join(', ') || 'the proposed vendor stack'}.`;

  const sections: string[] = [
    '## Scope, Assumptions, Exclusions, Dependencies',
    '',
    '### Overview',
    '',
    overview,
    '',
    boilerplate,
  ];

  const extraAssumptions = projectSpecificAssumptions ?? [];
  if (extraAssumptions.length > 0) {
    sections.push('', '### Project-Specific Assumptions', '', bulletList(extraAssumptions));
  }

  const extraExclusions = projectSpecificExclusions ?? [];
  if (extraExclusions.length > 0) {
    sections.push('', '### Project-Specific Exclusions', '', bulletList(extraExclusions));
  }

  const regional = buildMenaItems(country, sector);
  if (regional.length > 0) {
    sections.push('', '### Regional / Regulatory Considerations', '', bulletList(regional));
  }

  return sections.join('\n');
}

const SYSTEM_PROMPT =
  'You are a senior pre-sales engineer finalizing the scope, assumptions, and exclusions ' +
  'section. Add project-specific items that an experienced engineer would include. Flag risks. ' +
  'Be precise and defensible — this section prevents scope creep. ~400 words. Return strict JSON only.';

function buildUserPrompt(input: ScopeInput, brief: string): string {
  return [
    `Customer: ${input.customerName}`,
    `Project: ${input.projectName}`,
    `Country: ${input.country} | Sector: ${input.sector} | Sites: ${input.siteCount}`,
    `Vendor stack: ${input.vendorStack.join(', ') || '(unspecified)'}`,
    '',
    'Structured brief (rewrite as ~400 words; preserve all baseline assumptions, exclusions, ' +
      'dependencies, and regional items verbatim — you may add precision and flag risks but ' +
      'must not remove any listed item):',
    '',
    brief,
    '',
    'Respond with strict JSON: {"content": "<markdown scope section, ~400 words, ' +
      'starting with `## Scope, Assumptions, Exclusions, Dependencies` heading>"}.',
  ].join('\n');
}

export async function generateScope(input: ScopeInput): Promise<ProposalSection> {
  const brief = buildDeterministicBrief(input);

  const result = await callAI({
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildUserPrompt(input, brief),
    outputSchema: ScopeSchema,
    taskId: `scope-customizer:${input.projectName.slice(0, 40)}`,
  });

  const content = result.success ? result.data.content : brief;
  return makeSection('scope_assumptions', content);
}
