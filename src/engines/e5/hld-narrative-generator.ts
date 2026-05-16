/**
 * E5 — HLD narrative generator (Playbook §3.6, 12 sections).
 *
 * 8 deterministic templates + 4 AI-written sections (executive summary,
 * solution requirements, solution architecture, security architecture).
 * Each AI call has a post-gate validating topology and vendor mention; on
 * AI failure or post-gate failure, a deterministic fallback is used.
 */
import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import type {
  HLDSection,
  MigrationApproach,
  SizingResult,
  TopologyPattern,
} from '@/engines/e5/types';
import {
  appendicesSection,
  architectureFallback,
  capacitySection,
  currentStateSection,
  DESIGN_PRINCIPLES,
  documentControlSection,
  executiveFallback,
  migrationSection,
  requirementsFallback,
  resilienceSection,
  risksSection,
  scopeSection,
  securityFallback,
  TOPOLOGY_DISPLAY,
} from '@/engines/e5/hld-deterministic-sections';

export interface HLDNarrativeInput {
  topology: TopologyPattern;
  sizing: SizingResult;
  vendor: 'cisco' | 'fortinet';
  projectType: string;
  customerName: string;
  designPrinciples?: string[];
  migrationApproach?: MigrationApproach;
}

const AISectionSchema = z.object({ content: z.string().min(50) });

const systemPrompt = (vendor: string, topology: TopologyPattern): string =>
  `You are a senior pre-sales engineer writing a High-Level Design document for a ${vendor} ` +
  `network project. Write in formal technical English. Reference the selected ` +
  `${TOPOLOGY_DISPLAY[topology]} architecture. Cite design principles: ${DESIGN_PRINCIPLES.join(', ')}.`;

function passesPostGate(content: string, topology: TopologyPattern, vendor: string): boolean {
  const lower = content.toLowerCase();
  const mentionsTopology = lower.includes(topology) || lower.includes(TOPOLOGY_DISPLAY[topology].toLowerCase());
  const mentionsVendor = lower.includes(vendor.toLowerCase());
  return mentionsTopology && mentionsVendor;
}

interface AICallSpec {
  sectionNumber: number;
  title: string;
  taskSuffix: string;
  userPrompt: string;
  fallback: string;
}

async function runAISection(
  spec: AICallSpec,
  input: HLDNarrativeInput,
): Promise<HLDSection> {
  const result = await callAI({
    systemPrompt: systemPrompt(input.vendor, input.topology),
    prompt: spec.userPrompt,
    outputSchema: AISectionSchema,
    taskId: `hld-narrative:section-${spec.sectionNumber}`,
  });
  if (!result.success) {
    return { sectionNumber: spec.sectionNumber, title: spec.title, content: spec.fallback };
  }
  const content = result.data.content;
  if (!passesPostGate(content, input.topology, input.vendor)) {
    return { sectionNumber: spec.sectionNumber, title: spec.title, content: spec.fallback };
  }
  return { sectionNumber: spec.sectionNumber, title: spec.title, content };
}

function buildAISpecs(input: HLDNarrativeInput): AICallSpec[] {
  const topo = TOPOLOGY_DISPLAY[input.topology];
  const base =
    `Customer: ${input.customerName}\nProject type: ${input.projectType}\n` +
    `Vendor: ${input.vendor}\nTopology: ${topo} (${input.topology})\n` +
    `Sized devices: core=${input.sizing.coreDevices.length}, ` +
    `dist=${input.sizing.distributionDevices.length}, ` +
    `access=${input.sizing.accessDevices.length}, ` +
    `firewalls=${input.sizing.firewalls.length}.\n`;
  return [
    {
      sectionNumber: 2,
      title: 'Executive Summary',
      taskSuffix: 'exec',
      userPrompt: `${base}\nWrite the executive summary (150–300 words): business drivers, proposed ` +
        `solution, expected outcomes. Mention the ${topo} architecture and the ${input.vendor} ` +
        `platform. Return JSON: {"content": "<text>"}.`,
      fallback: executiveFallback(input.topology, input.vendor, input.customerName),
    },
    {
      sectionNumber: 5,
      title: 'Solution Requirements',
      taskSuffix: 'req',
      userPrompt: `${base}\nParaphrase the business, functional, and non-functional requirements ` +
        `for this ${input.vendor} ${topo} solution. Use bullet structure. ` +
        `Return JSON: {"content": "<text>"}.`,
      fallback: requirementsFallback(input.sizing),
    },
    {
      sectionNumber: 6,
      title: 'Solution Architecture',
      taskSuffix: 'arch',
      userPrompt: `${base}\nDescribe the solution architecture: the ${topo} pattern, technology ` +
        `rationale for choosing ${input.vendor}, module designs (campus, DC, security, wireless ` +
        `as applicable). Reference the seven design principles. Return JSON: {"content": "<text>"}.`,
      fallback: architectureFallback(input.topology, input.vendor),
    },
    {
      sectionNumber: 9,
      title: 'Security Architecture & Compliance Mapping',
      taskSuffix: 'sec',
      userPrompt: `${base}\nDescribe the security architecture for a ${input.vendor} ${topo} ` +
        `deployment: zones, segmentation, perimeter, east-west controls, and compliance mapping ` +
        `to NCA / SAMA / NESA / PCI / ISO 27001. Return JSON: {"content": "<text>"}.`,
      fallback: securityFallback(input.vendor),
    },
  ];
}

/**
 * Generate the 12-section HLD narrative.
 *
 * Runs 4 AI calls in parallel for sections 2, 5, 6, 9. Builds the other 8
 * sections deterministically. Returns sections sorted by sectionNumber.
 */
export async function generateHLDNarrative(
  input: HLDNarrativeInput,
): Promise<HLDSection[]> {
  const aiSections = await Promise.all(
    buildAISpecs(input).map((spec) => runAISection(spec, input)),
  );

  const det: HLDSection[] = [
    documentControlSection(input.customerName),
    scopeSection(input.projectType, input.vendor),
    currentStateSection(),
    resilienceSection(input.topology),
    capacitySection(
      input.sizing,
      totalPortCount(input.sizing),
      totalUplinkGbps(input.sizing),
    ),
    migrationSection(input.migrationApproach),
    risksSection(),
    appendicesSection(input.sizing),
  ];

  return [...det, ...aiSections].sort((a, b) => a.sectionNumber - b.sectionNumber);
}

function totalPortCount(sizing: SizingResult): number {
  return [...sizing.coreDevices, ...sizing.distributionDevices, ...sizing.accessDevices]
    .reduce((s, d) => s + d.quantity, 0);
}
function totalUplinkGbps(sizing: SizingResult): number {
  return sizing.coreDevices.reduce((s, d) => s + d.quantity, 0) * 40;
}
