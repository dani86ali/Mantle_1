/**
 * E4 — Free-text response interpreter.
 * Deterministic keyword matching first via matchResponseToQuestion; remaining
 * unmatched questions go to a batched AI call (10 per batch). AI failure keeps
 * the deterministic answers only.
 */

import { z } from 'zod';
import { callAI } from '@/lib/ai/client';
import { wrapUntrusted } from '@/lib/ai/wrap-untrusted';
import { matchResponseToQuestion } from './response-parser';
import type { ClientResponse, Question } from './types';

const BATCH_SIZE = 10;

const AIMatchSchema = z.array(
  z.object({
    questionId: z.string(),
    answer: z.string().nullable(),
    confidence: z.number(),
  }),
);

export async function interpretFreeText(
  text: string,
  questions: Question[],
): Promise<ClientResponse[]> {
  const deterministic = matchResponseToQuestion(text, questions);
  const matchedIds = new Set(deterministic.map((m) => m.questionId));

  const responses: ClientResponse[] = deterministic.map((m) => ({
    questionId: m.questionId,
    answer: m.answer,
    confidence: 1.0,
    source: 'free_text',
  }));

  const unmatched = questions.filter((q) => !matchedIds.has(q.id));
  if (unmatched.length === 0) return responses;

  for (let i = 0; i < unmatched.length; i += BATCH_SIZE) {
    const batch = unmatched.slice(i, i + BATCH_SIZE);
    const result = await callAI({
      systemPrompt:
        'You are parsing a client response to a network requirements questionnaire. ' +
        'The client wrote in free form. For each question, extract the answer from ' +
        'the text if present. Return null if the question is not addressed.',
      prompt:
        `Client response text:\n${wrapUntrusted(text, 'client-response')}\n\n` +
        `Questions to extract answers for:\n` +
        batch.map((q) => `${q.id}: ${q.text}`).join('\n') +
        `\n\nReturn strict JSON: an array with one object per question shaped as ` +
        `{"questionId": <id>, "answer": <string or null>, "confidence": <0..1>}.`,
      outputSchema: AIMatchSchema,
      taskId: `free-text-interpreter:batch-${i}`,
      untrustedContent: true,
    });

    if (!result.success) continue;

    for (const m of result.data) {
      if (m.answer === null) continue;
      responses.push({
        questionId: m.questionId,
        answer: m.answer,
        confidence: m.confidence,
        source: 'ai_interpreted',
      });
    }
  }

  return responses;
}
