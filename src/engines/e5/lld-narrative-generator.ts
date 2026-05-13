/**
 * E5 — LLD narrative generator (Playbook §3.7, 21 sections).
 *
 * 19 deterministic templates + 2 AI-written sections (§8 routing design,
 * §11 security policy). Each AI call has a post-gate; on AI failure or
 * post-gate failure, a deterministic fallback is used.
 */
import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import type {
  IPVlanPlan, LLDSection, MigrationApproach, QoSPolicy, SizingResult, TopologyPattern,
} from '@/engines/e5/types';
import {
  acceptanceCriteria, baseConfigs, cableSchedulePlaceholder, cutoverRunbook,
  deviceInventory, ipAddressingPlan, lldAppendices, lldDocumentControl,
  lldHldReference, logicalTopology, managementPlane, multicastDesign,
  physicalTopology, qosDesign, rackElevationsPlaceholder, routingFallback,
  securityFallbackLLD, testPlan, vlanVrfDesign, wanDesign, wirelessDesign,
} from '@/engines/e5/lld-deterministic-sections';

export interface LLDNarrativeInput {
  topology: TopologyPattern;
  sizing: SizingResult;
  vendor: 'cisco' | 'fortinet';
  ipVlanPlan: IPVlanPlan;
  qosPolicy: QoSPolicy;
  migrationApproach: MigrationApproach;
  customerName: string;
  siteCount?: number;
}

const AISectionSchema = z.object({ content: z.string().min(50) });

const ROUTING_PROTOCOLS = /\b(OSPF|BGP|EIGRP|IS-IS|ISIS)\b/i;

const CISCO_SECURITY_PRODUCTS = /\b(Cisco|Firepower|Secure Firewall|FTD|Umbrella|ISE|Stealthwatch)\b/i;
const FORTINET_SECURITY_PRODUCTS = /\b(FortiGate|FortiOS|FortiManager|FortiAnalyzer|FortiClient|Fortinet)\b/i;

function systemPrompt(vendor: string, topology: TopologyPattern): string {
  return `You are a senior pre-sales engineer writing a Low-Level Design document for a ${vendor} ` +
    `network project using the ${topology} architecture. Write in formal technical English. ` +
    `Output strict JSON only.`;
}

async function routingSection(input: LLDNarrativeInput): Promise<LLDSection> {
  const fallback = routingFallback(input.topology);
  const result = await callAI({
    systemPrompt: systemPrompt(input.vendor, input.topology),
    prompt:
      `Topology: ${input.topology}. Vendor: ${input.vendor}. ` +
      `Core devices: ${input.sizing.coreDevices.length}, distribution: ${input.sizing.distributionDevices.length}.\n` +
      `Write the routing design: IGP choice (OSPF/IS-IS/EIGRP), BGP role if any, areas/ASNs, redistribution. ` +
      `Return JSON: {"content": "<text>"}.`,
    outputSchema: AISectionSchema,
    taskId: 'lld-narrative:section-8',
  });
  if (!result.success || !ROUTING_PROTOCOLS.test(result.data.content)) {
    return { sectionNumber: 8, title: 'Routing Design', content: fallback };
  }
  return { sectionNumber: 8, title: 'Routing Design', content: result.data.content };
}

async function securitySection(input: LLDNarrativeInput): Promise<LLDSection> {
  const fallback = securityFallbackLLD(input.vendor);
  const pattern = input.vendor === 'fortinet' ? FORTINET_SECURITY_PRODUCTS : CISCO_SECURITY_PRODUCTS;
  const result = await callAI({
    systemPrompt: systemPrompt(input.vendor, input.topology),
    prompt:
      `Vendor: ${input.vendor}. Firewall devices: ${input.sizing.firewalls.length}. ` +
      `VLANs: ${input.ipVlanPlan.vlans.length}, VRFs: ${input.ipVlanPlan.vrfs.length}.\n` +
      `Write the security policy: firewall ruleset structure, NAC role mapping, segmentation, IDS/IPS profile, ` +
      `and which ${input.vendor} security products enforce them. Return JSON: {"content": "<text>"}.`,
    outputSchema: AISectionSchema,
    taskId: 'lld-narrative:section-11',
  });
  if (!result.success || !pattern.test(result.data.content)) {
    return { sectionNumber: 11, title: 'Security Policy', content: fallback };
  }
  return { sectionNumber: 11, title: 'Security Policy', content: result.data.content };
}

/**
 * Generate the 21-section LLD narrative.
 *
 * Runs 2 AI calls in parallel for sections 8 and 11. Builds the other 19
 * sections deterministically. Returns sections sorted by sectionNumber.
 */
export async function generateLLDNarrative(
  input: LLDNarrativeInput,
): Promise<LLDSection[]> {
  const [routing, security] = await Promise.all([
    routingSection(input),
    securitySection(input),
  ]);

  const siteCount = input.siteCount ?? 1;
  const det: LLDSection[] = [
    lldDocumentControl(input.customerName),
    lldHldReference(),
    physicalTopology(),
    logicalTopology(),
    deviceInventory(input.sizing),
    ipAddressingPlan(input.ipVlanPlan),
    vlanVrfDesign(input.ipVlanPlan),
    multicastDesign(input.topology),
    qosDesign(input.qosPolicy),
    wirelessDesign(input.sizing),
    wanDesign(siteCount),
    managementPlane(),
    baseConfigs(),
    cableSchedulePlaceholder(),
    rackElevationsPlaceholder(),
    testPlan(),
    cutoverRunbook(input.migrationApproach),
    acceptanceCriteria(),
    lldAppendices(),
  ];

  return [...det, routing, security].sort((a, b) => a.sectionNumber - b.sectionNumber);
}
