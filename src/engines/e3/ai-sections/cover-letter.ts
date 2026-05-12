/** E3 Cover Letter generator — AI-enhanced, deterministic-first.
 *  Playbook §6.1: cover letter is section 1, ~1 page (~250 words),
 *  formal opening, value proposition, confidence in delivery.
 */

import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { makeSection } from '../section-helpers';
import type { ProposalSection } from '../types';

export interface CoverLetterInput {
  customerName: string;
  projectName: string;
  tenantName: string;
  contactName?: string;
  date: string;
  sector: string;
  keyStrengths: string[];
}

const CoverLetterSchema = z.object({
  content: z.string().min(50),
});

function joinList(items: string[], fallback: string): string {
  const trimmed = items.map((s) => s.trim()).filter((s) => s.length > 0);
  if (trimmed.length === 0) return fallback;
  if (trimmed.length === 1) return trimmed[0];
  if (trimmed.length === 2) return `${trimmed[0]} and ${trimmed[1]}`;
  return `${trimmed.slice(0, -1).join(', ')}, and ${trimmed[trimmed.length - 1]}`;
}

export function buildDeterministicBrief(input: CoverLetterInput): string {
  const { customerName, projectName, tenantName, contactName, date, sector, keyStrengths } = input;

  const recipient = contactName
    ? `Dear ${contactName},`
    : `Dear ${customerName} Procurement Team,`;

  const topStrengths = keyStrengths.slice(0, 3);
  const strengthsStr = joinList(topStrengths, 'proven delivery, technical depth, and customer focus');

  const opening =
    `${tenantName} is pleased to submit this proposal in response to your ${projectName} ` +
    `requirement. As a trusted ${sector} infrastructure partner, we have prepared a solution ` +
    `tailored to the needs of ${customerName}.`;

  const value =
    `Our proposal is grounded in ${strengthsStr}. We believe these qualities position ` +
    `${tenantName} to deliver measurable value across the lifecycle of this engagement.`;

  const close =
    `We welcome the opportunity to discuss this proposal in greater detail and to clarify ` +
    `any aspect of our response. ${tenantName} remains committed to supporting ${customerName} ` +
    `throughout evaluation, award, and delivery.`;

  return [
    '## Cover Letter',
    '',
    date,
    '',
    customerName,
    '',
    recipient,
    '',
    `**Re: ${projectName}**`,
    '',
    opening,
    '',
    value,
    '',
    close,
    '',
    'Sincerely,',
    '',
    tenantName,
  ].join('\n');
}

const SYSTEM_PROMPT_TEMPLATE =
  'You are writing a formal cover letter for a network infrastructure proposal from ' +
  '{{tenantName}} to {{customerName}}. Professional tone, 1 page (~250 words). ' +
  'Express appreciation for the opportunity, briefly summarize value proposition, ' +
  'express confidence in delivery. Return strict JSON only.';

function buildSystemPrompt(input: CoverLetterInput): string {
  return SYSTEM_PROMPT_TEMPLATE
    .replace('{{tenantName}}', input.tenantName)
    .replace('{{customerName}}', input.customerName);
}

function buildUserPrompt(input: CoverLetterInput, brief: string): string {
  return [
    `Customer: ${input.customerName} (${input.sector})`,
    `Project: ${input.projectName}`,
    `From: ${input.tenantName}`,
    `Date: ${input.date}`,
    input.contactName ? `Contact: ${input.contactName}` : 'Contact: (none — address to procurement team)',
    '',
    'Structured brief (rewrite as a polished formal cover letter; preserve ' +
      'customer name, project name, tenant name, date, and the addressee verbatim):',
    '',
    brief,
    '',
    'Respond with strict JSON: {"content": "<markdown cover letter, ~250 words, ' +
      'starting with `## Cover Letter` heading>"}.',
  ].join('\n');
}

export async function generateCoverLetter(
  input: CoverLetterInput,
): Promise<ProposalSection> {
  const brief = buildDeterministicBrief(input);

  const result = await callAI({
    systemPrompt: buildSystemPrompt(input),
    prompt: buildUserPrompt(input, brief),
    outputSchema: CoverLetterSchema,
    taskId: `cover-letter:${input.customerName.slice(0, 40)}`,
  });

  const content = result.success ? result.data.content : brief;
  return makeSection('cover_letter', content);
}
