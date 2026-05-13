import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import {
  ProjectTypeDetectionSchema,
  detectProjectType,
  type ProjectTypeDetection,
} from './project-type-detector';

const HIGH_CONFIDENCE = 0.7;

const PROJECT_TYPE_VALUES = [
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
] as const;

const AIDetectionSchema = z.object({
  type: z.enum(PROJECT_TYPE_VALUES),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});

export async function enhancedProjectTypeDetection(
  description: string,
  clientName?: string,
  sector?: string,
): Promise<ProjectTypeDetection> {
  const deterministic = detectProjectType(description, clientName, sector);
  if (deterministic.confidence >= HIGH_CONFIDENCE) return deterministic;

  const result = await callAI({
    systemPrompt:
      'You are a network pre-sales engineer classifying a project request. ' +
      'Determine the project type from: campus_refresh, greenfield_campus, sd_wan, ' +
      'dc_modernization, wireless_deployment, security_upgrade, branch_rollout, ' +
      'cloud_connectivity, ot_network, general. Return your classification with reasoning.',
    prompt:
      `Classify this project request and return strict JSON.\n\n` +
      `Description: ${description}\n` +
      `Client: ${clientName ?? '(unknown)'}\n` +
      `Sector: ${sector ?? '(unknown)'}\n\n` +
      `Respond with: {"type": <one of the listed types>, ` +
      `"confidence": <0..1>, "evidence": [<short reasoning strings>]}`,
    outputSchema: AIDetectionSchema,
    taskId: `project-type-ai:${description.slice(0, 40)}`,
  });

  if (!result.success) return deterministic;
  return ProjectTypeDetectionSchema.parse(result.data);
}
