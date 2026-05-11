/** E3 Executive Summary generator — AI-enhanced, deterministic-first.
 *  Playbook §6.1: executive summary is section 2, ~2 pages, written last,
 *  CFO/CIO read first, restates client challenges and how solution addresses them.
 *  Playbook §6.3: confident, second-person ("Your network will..."), benefit-led.
 */

import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { formatMoney, makeSection } from '../section-helpers';
import type { ProposalSection } from '../types';

export interface ExecSummaryInput {
  customerName: string;
  projectName: string;
  sector: string;
  country: string;
  requirements: {
    mandatory: number;
    optional: number;
    total: number;
    topRequirements: string[];
  };
  solution: {
    deviceCount: number;
    vendors: string[];
    categories: string[];
    keyCapabilities: string[];
  };
  commercial: {
    grandTotal: number;
    currency: string;
    tiers?: { good: number; better: number; best: number };
  };
  compliance: {
    coveragePct: number;
    frameworks: string[];
  };
  timeline?: string;
}

const ExecSummarySchema = z.object({
  content: z.string().min(100),
  wordCount: z.number(),
});

function joinList(items: string[], fallback: string): string {
  const trimmed = items.map((s) => s.trim()).filter((s) => s.length > 0);
  if (trimmed.length === 0) return fallback;
  if (trimmed.length === 1) return trimmed[0];
  if (trimmed.length === 2) return `${trimmed[0]} and ${trimmed[1]}`;
  return `${trimmed.slice(0, -1).join(', ')}, and ${trimmed[trimmed.length - 1]}`;
}

export function buildDeterministicBrief(input: ExecSummaryInput): string {
  const { customerName, projectName, sector, country } = input;
  const { mandatory, optional, total, topRequirements } = input.requirements;
  const { deviceCount, vendors, categories, keyCapabilities } = input.solution;
  const { grandTotal, currency, tiers } = input.commercial;
  const { coveragePct, frameworks } = input.compliance;

  const topReqStr = joinList(topRequirements, 'the stated technical and operational objectives');
  const vendorStr = joinList(vendors, 'leading network vendors');
  const categoryStr = joinList(categories, 'network infrastructure');
  const capabilityStr = joinList(keyCapabilities, 'enterprise-grade performance, security, and resilience');
  const frameworkStr = joinList(frameworks, 'the applicable industry frameworks');

  const challenge =
    `${customerName}, a ${sector} organisation operating in ${country}, is undertaking ` +
    `the ${projectName} initiative. The tender defines ${total} requirements ` +
    `(${mandatory} mandatory, ${optional} optional), focused on ${topReqStr}.`;

  const solution =
    `The proposed solution deploys ${deviceCount} device${deviceCount === 1 ? '' : 's'} ` +
    `across ${categoryStr} from ${vendorStr}, delivering ${capabilityStr}.`;

  const totalStr = formatMoney(grandTotal, currency);
  const commercialParts = [
    `The total investment is ${totalStr}.`,
  ];
  if (tiers) {
    commercialParts.push(
      `Three commercial tiers are available: Good (${formatMoney(tiers.good, currency)}), ` +
      `Better (${formatMoney(tiers.better, currency)}), and Best (${formatMoney(tiers.best, currency)}).`,
    );
  }
  if (input.timeline) {
    commercialParts.push(`Delivery timeline: ${input.timeline}.`);
  }
  const commercial = commercialParts.join(' ');

  const compliance =
    `The solution achieves ${coveragePct.toFixed(1)}% compliance coverage against the ` +
    `stated requirements and aligns with ${frameworkStr}.`;

  return [
    '## Executive Summary',
    '',
    '### Challenge',
    challenge,
    '',
    '### Proposed Solution',
    solution,
    '',
    '### Commercial Summary',
    commercial,
    '',
    '### Compliance',
    compliance,
  ].join('\n');
}

const SYSTEM_PROMPT =
  'You are a senior pre-sales solutions architect writing an executive summary for a ' +
  'network infrastructure proposal. Write in confident, second-person tone ' +
  '(Your network will...). 2 pages max (~500 words). Structure: Challenge ' +
  '(2-3 sentences restating client needs), Solution (1 paragraph on what is ' +
  'proposed), Why Us (2-3 differentiators), Investment (1 sentence on value), ' +
  'Next Steps. Return strict JSON only.';

function buildUserPrompt(input: ExecSummaryInput, brief: string): string {
  return [
    `Customer: ${input.customerName} (${input.sector}, ${input.country})`,
    `Project: ${input.projectName}`,
    '',
    'Structured brief (rewrite this in confident second-person prose; preserve ' +
      'all numbers, vendor names, framework names, and the grand total verbatim):',
    '',
    brief,
    '',
    'Respond with strict JSON: {"content": "<markdown executive summary, ~500 words, ' +
      'starting with `## Executive Summary` heading>", "wordCount": <integer word count>}.',
  ].join('\n');
}

export async function generateExecutiveSummary(
  input: ExecSummaryInput,
): Promise<ProposalSection> {
  const brief = buildDeterministicBrief(input);

  const result = await callAI({
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildUserPrompt(input, brief),
    outputSchema: ExecSummarySchema,
    taskId: `executive-summary:${input.customerName.slice(0, 40)}`,
  });

  const content = result.success ? result.data.content : brief;
  return makeSection('executive_summary', content);
}
