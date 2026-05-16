/**
 * E5 — Topology recommender. Decision tree from Design_Patterns.md §6.2;
 * escalates to AI only on the 500–999 single-building ambiguous zone.
 */
import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { wrapUntrusted } from '@/lib/ai/wrap-untrusted';
import {
  TopologyPatternSchema,
  type TopologyPattern,
} from '@/engines/e5/types';

const HIGH_CONFIDENCE = 0.8;
const AI_ASSISTED_CONFIDENCE = 0.85;

export const TopologyInputSchema = z.object({
  projectType: z.string().min(1),
  portCount: z.number().int().nonnegative(),
  siteCount: z.number().int().nonnegative(),
  buildingCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
  bandwidthGbps: z.number().nonnegative(),
  hasOT: z.boolean(),
  hasHPC: z.boolean(),
  hasGPON: z.boolean(),
  isNvidia: z.boolean().optional(),
  idfRoomsPerFloor: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
});
export type TopologyInput = z.infer<typeof TopologyInputSchema>;

export interface TopologyRecommendation {
  pattern: TopologyPattern;
  confidence: number;
  reasoning: string;
  alternativePattern?: TopologyPattern;
  alternativeReasoning?: string;
}

interface DeterministicPick {
  pattern: TopologyPattern;
  confidence: number;
  reasoning: string;
}

/** Apply Design_Patterns.md §6.2 decision tree. */
function classifyDeterministic(input: TopologyInput): DeterministicPick {
  if (input.hasHPC && input.isNvidia === true) {
    return {
      pattern: 'fat_tree_superpod',
      confidence: 0.95,
      reasoning:
        'NVIDIA-centric HPC cluster — Quantum-2 NDR InfiniBand Fat-Tree SuperPOD (Pattern 3a).',
    };
  }
  if (input.hasHPC) {
    return {
      pattern: 'slingshot_dragonfly',
      confidence: 0.95,
      reasoning:
        'Non-NVIDIA HPC cluster — HPE Cray Slingshot Dragonfly topology (Pattern 3b).',
    };
  }
  if (input.hasGPON) {
    return {
      pattern: 'hub_and_spoke_gpon',
      confidence: 0.95,
      reasoning:
        'Fiber-to-room hospitality scope — GPON Hub-and-Spoke (Pattern 4a).',
    };
  }
  if (input.hasOT) {
    return {
      pattern: 'ot_it_segmented',
      confidence: 0.9,
      reasoning:
        'OT/SCADA assets present — OT/IT Segmented with industrial firewall or data diode (Pattern 5).',
    };
  }
  if (input.portCount < 500 && input.buildingCount <= 1) {
    return {
      pattern: 'two_tier_collapsed_core',
      confidence: 0.9,
      reasoning:
        'Single-building deployment under 500 ports — 2-Tier Collapsed Core (Pattern 1).',
    };
  }
  const manyIdf =
    input.idfRoomsPerFloor !== undefined && input.idfRoomsPerFloor > 5;
  if (input.portCount >= 1000 || input.buildingCount > 1 || manyIdf) {
    return {
      pattern: 'three_tier_core_dist_access',
      confidence: 0.85,
      reasoning:
        'Multi-building or high port density — 3-Tier Core-Distribution-Access (Pattern 2).',
    };
  }
  return {
    pattern: 'two_tier_collapsed_core',
    confidence: 0.7,
    reasoning:
      'Mid-range single-building (500–999 ports) — provisional 2-Tier Collapsed Core; ambiguous zone.',
  };
}

const AIOutputSchema = z.object({
  pattern: TopologyPatternSchema,
  reasoning: z.string(),
  alternativePattern: TopologyPatternSchema.optional(),
  alternativeReasoning: z.string().optional(),
});

const SYSTEM_PROMPT =
  'You are a senior network architect selecting the optimal topology pattern ' +
  'for a project. Choose from exactly these patterns: two_tier_collapsed_core, ' +
  'three_tier_core_dist_access, fat_tree_superpod, slingshot_dragonfly, ' +
  'hub_and_spoke_gpon, ot_it_segmented. Consider port density, building count, ' +
  'future growth, and cost optimization.';

function buildPrompt(input: TopologyInput, prelim: DeterministicPick): string {
  const idf = input.idfRoomsPerFloor ?? 'unspecified';
  const nvidia = input.isNvidia === undefined ? 'unspecified' : String(input.isNvidia);
  const desc = input.description
    ? `\nDescription: ${wrapUntrusted(input.description, 'project-description')}`
    : '';
  return (
    `Project requirements:\n` +
    `- Project type: ${input.projectType}\n` +
    `- Port count: ${input.portCount}\n` +
    `- Site count: ${input.siteCount}\n` +
    `- Building count: ${input.buildingCount}\n` +
    `- User count: ${input.userCount}\n` +
    `- Bandwidth: ${input.bandwidthGbps} Gbps\n` +
    `- Has OT/SCADA: ${input.hasOT}\n` +
    `- Has HPC: ${input.hasHPC}\n` +
    `- Has GPON: ${input.hasGPON}\n` +
    `- NVIDIA-centric: ${nvidia}\n` +
    `- IDF rooms per floor: ${idf}${desc}\n\n` +
    `Deterministic preliminary choice: ${prelim.pattern} ` +
    `(confidence ${prelim.confidence}). Reason: ${prelim.reasoning}\n\n` +
    `Confirm or override. Respond with JSON: {"pattern": "<one of the six>", ` +
    `"reasoning": "<short>", "alternativePattern": "<optional>", ` +
    `"alternativeReasoning": "<optional>"}.`
  );
}

/**
 * Recommend the topology pattern for the given project requirements.
 * Deterministic decision tree first; AI only on the 500–999 port ambiguous
 * single-building zone. AI failure / invalid output → deterministic fallback.
 */
export async function recommendTopology(
  requirements: TopologyInput,
): Promise<TopologyRecommendation> {
  const input = TopologyInputSchema.parse(requirements);
  const prelim = classifyDeterministic(input);

  if (prelim.confidence >= HIGH_CONFIDENCE) {
    return {
      pattern: prelim.pattern,
      confidence: prelim.confidence,
      reasoning: prelim.reasoning,
    };
  }

  const aiResult = await callAI({
    prompt: buildPrompt(input, prelim),
    systemPrompt: SYSTEM_PROMPT,
    outputSchema: AIOutputSchema,
    taskId: `topology-recommender:${input.projectType.slice(0, 40)}`,
    untrustedContent: true,
  });

  if (!aiResult.success) {
    return {
      pattern: prelim.pattern,
      confidence: prelim.confidence,
      reasoning: `${prelim.reasoning} (AI escalation failed: ${aiResult.error})`,
    };
  }

  const parsedPattern = TopologyPatternSchema.safeParse(aiResult.data.pattern);
  if (!parsedPattern.success) {
    return {
      pattern: prelim.pattern,
      confidence: prelim.confidence,
      reasoning: `${prelim.reasoning} (AI returned invalid pattern; using deterministic choice)`,
    };
  }

  return {
    pattern: parsedPattern.data,
    confidence: AI_ASSISTED_CONFIDENCE,
    reasoning: aiResult.data.reasoning,
    alternativePattern: aiResult.data.alternativePattern,
    alternativeReasoning: aiResult.data.alternativeReasoning,
  };
}
