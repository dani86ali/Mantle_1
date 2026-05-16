/**
 * E4 — AI-enhanced gap detection.
 * Deterministic analyzeGaps first; AI then surfaces contradictions, unstated
 * assumptions, and additional vague answers a pre-sales engineer would flag.
 * AI failure returns the deterministic gap analysis with empty AI fields.
 */

import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { wrapUntrusted } from '@/lib/ai/wrap-untrusted';
import { analyzeGaps } from './requirements-baseline-builder';
import type {
  ClientResponse,
  GapAnalysis,
  Question,
  VagueAnswer,
} from './types';

export interface Contradiction {
  questionIds: string[];
  description: string;
}

export interface EnhancedGapAnalysis extends GapAnalysis {
  contradictions: Contradiction[];
  unstatedAssumptions: string[];
}

const AIGapSchema = z.object({
  additionalGaps: z.array(
    z.object({
      questionId: z.string(),
      reason: z.string(),
    }),
  ),
  contradictions: z.array(
    z.object({
      questionIds: z.array(z.string()),
      description: z.string(),
    }),
  ),
  unstatedAssumptions: z.array(z.string()),
});

function formatAnswer(answer: ClientResponse['answer']): string {
  if (answer === null || answer === undefined) return '(no answer)';
  if (Array.isArray(answer)) return answer.join(', ');
  return String(answer);
}

export async function enhancedGapDetection(
  responses: ClientResponse[],
  questions: Question[],
  projectContext?: string,
): Promise<EnhancedGapAnalysis> {
  const deterministic = analyzeGaps(responses, questions);

  const responseSummary = responses
    .map((r) => `${r.questionId}: ${formatAnswer(r.answer)}`)
    .join('\n');

  const result = await callAI({
    systemPrompt:
      'You are a senior pre-sales engineer reviewing questionnaire responses for ' +
      'completeness. Beyond the obvious missing answers, identify: vague responses ' +
      'that need clarification, contradictory answers, unstated assumptions the ' +
      'client may be making, and critical scope items not covered by the questionnaire.',
    prompt:
      `Project context: ${wrapUntrusted(projectContext ?? '(unspecified)', 'project-context')}\n\n` +
      `Deterministic gap analysis already produced:\n` +
      `- Missing required answers: ${deterministic.incompleteQuestions.join(', ') || '(none)'}\n` +
      `- Already-flagged vague answers: ${deterministic.vagueAnswers.map((v) => v.questionId).join(', ') || '(none)'}\n` +
      `- Missing baseline categories: ${deterministic.missingCategories.join(', ') || '(none)'}\n\n` +
      `Client responses:\n${wrapUntrusted(responseSummary || '(none)', 'client-responses')}\n\n` +
      `Return strict JSON shaped as ` +
      `{"additionalGaps":[{"questionId":<id>,"reason":<string>}],` +
      `"contradictions":[{"questionIds":[<ids>],"description":<string>}],` +
      `"unstatedAssumptions":[<string>]}.`,
    outputSchema: AIGapSchema,
    taskId: `gap-detector-ai:${responses.length}`,
    untrustedContent: true,
  });

  if (!result.success) {
    return {
      ...deterministic,
      contradictions: [],
      unstatedAssumptions: [],
    };
  }

  const additionalVague: VagueAnswer[] = result.data.additionalGaps.map((g) => ({
    questionId: g.questionId,
    answer: '',
    reason: g.reason,
  }));

  return {
    ...deterministic,
    vagueAnswers: [...deterministic.vagueAnswers, ...additionalVague],
    contradictions: result.data.contradictions,
    unstatedAssumptions: result.data.unstatedAssumptions,
  };
}
