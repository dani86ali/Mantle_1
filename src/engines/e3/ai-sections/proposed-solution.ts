/** E3 Proposed Solution generator — AI-enhanced, deterministic-first.
 *  Playbook §6.1: proposed solution is section 4 (~800 words),
 *  organized by category, explains WHY each technology choice was made,
 *  references design principles (hierarchical, resilient, secure-by-design).
 */

import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { makeSection } from '../section-helpers';
import type { ProposalSection } from '../types';

export interface SolutionDevice {
  model: string;
  qty: number;
  category: string;
  vendor: string;
}

export interface SolutionInput {
  customerName: string;
  projectName: string;
  requirements: {
    topRequirements: string[];
  };
  devices: SolutionDevice[];
  designRationale?: string;
  vendorStack: string[];
  sectorContext?: string;
}

const SolutionSchema = z.object({
  content: z.string().min(200),
});

function joinList(items: string[], fallback: string): string {
  const trimmed = items.map((s) => s.trim()).filter((s) => s.length > 0);
  if (trimmed.length === 0) return fallback;
  if (trimmed.length === 1) return trimmed[0];
  if (trimmed.length === 2) return `${trimmed[0]} and ${trimmed[1]}`;
  return `${trimmed.slice(0, -1).join(', ')}, and ${trimmed[trimmed.length - 1]}`;
}

function groupByCategory(
  devices: SolutionDevice[],
): Array<[string, SolutionDevice[]]> {
  const map = new Map<string, SolutionDevice[]>();
  for (const d of devices) {
    const key = (d.category || 'other').toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }
  return Array.from(map.entries());
}

function categoryTitle(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export function buildDeterministicBrief(input: SolutionInput): string {
  const { customerName, projectName, requirements, devices, vendorStack, designRationale, sectorContext } = input;

  const topReqStr = joinList(requirements.topRequirements, 'the stated technical objectives');
  const vendorStr = joinList(vendorStack, 'leading enterprise vendors');

  const overview =
    `This section describes the network infrastructure solution proposed for ` +
    `${customerName}'s ${projectName} initiative. The design responds directly to ` +
    `${topReqStr}, and is built on a vendor stack comprising ${vendorStr}.`;

  const groups = groupByCategory(devices);
  const categoryLines: string[] = [];
  for (const [cat, devs] of groups) {
    const totalQty = devs.reduce((s: number, d: SolutionDevice) => s + d.qty, 0);
    const models = devs
      .map((d: SolutionDevice) => `${d.model} (×${d.qty}, ${d.vendor})`)
      .join('; ');
    categoryLines.push(
      `### ${categoryTitle(cat)}`,
      '',
      `${totalQty} device${totalQty === 1 ? '' : 's'} across this layer: ${models}.`,
      '',
    );
  }
  if (categoryLines.length === 0) {
    categoryLines.push('### Devices', '', '_No devices specified._', '');
  }

  const rationale =
    designRationale ??
    `Vendor selection prioritises proven interoperability, regional support presence, ` +
      `and lifecycle commitments aligned to ${customerName}'s operational horizon.`;

  const principles =
    `The architecture follows three design principles: **hierarchical** (clear ` +
    `separation of access, distribution, and core), **resilient** (no single point ` +
    `of failure across critical paths), and **secure-by-design** (zero-trust ` +
    `segmentation and defence-in-depth controls embedded from day one).`;

  const sector = sectorContext
    ? `\n\n### Sector Context\n\n${sectorContext}`
    : '';

  return [
    '## Proposed Solution',
    '',
    '### Overview',
    '',
    overview,
    '',
    '### Solution by Layer',
    '',
    ...categoryLines,
    '### Vendor Rationale',
    '',
    rationale,
    '',
    '### Design Principles',
    '',
    principles + sector,
  ].join('\n');
}

const SYSTEM_PROMPT =
  'You are a senior network architect describing the proposed solution. Write ' +
  'technically precise but accessible prose. Explain WHY each technology choice ' +
  'was made, not just WHAT. Reference design principles. ~800 words. Return ' +
  'strict JSON only.';

function buildUserPrompt(input: SolutionInput, brief: string): string {
  return [
    `Customer: ${input.customerName}`,
    `Project: ${input.projectName}`,
    `Vendor stack: ${input.vendorStack.join(', ')}`,
    `Device count: ${input.devices.length}`,
    '',
    'Structured brief (rewrite as ~800 words of architect-grade prose; preserve ' +
      'all device models, quantities, vendor names, and category groupings verbatim):',
    '',
    brief,
    '',
    'Respond with strict JSON: {"content": "<markdown proposed solution, ~800 words, ' +
      'starting with `## Proposed Solution` heading>"}.',
  ].join('\n');
}

export async function generateProposedSolution(
  input: SolutionInput,
): Promise<ProposalSection> {
  const brief = buildDeterministicBrief(input);

  const result = await callAI({
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildUserPrompt(input, brief),
    outputSchema: SolutionSchema,
    taskId: `proposed-solution:${input.customerName.slice(0, 40)}`,
  });

  const content = result.success ? result.data.content : brief;
  return makeSection('proposed_solution', content);
}
