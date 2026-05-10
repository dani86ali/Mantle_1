/**
 * Single Anthropic API wrapper for all BOMATIC AI calls.
 *
 * Implements the Runtime Architecture §3 escalation rule:
 *   attempt 1 → retry once with error context → fallback to engineer_review.
 * Never throws, never returns nothing.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { logEntry } from '@/coordinator/logger';

const MODEL = 'claude-sonnet-4-6-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

const SCHEMA_HINT = 'Your response did not match the required schema';

export interface CallAIConfig<T> {
  prompt: string;
  systemPrompt: string;
  outputSchema: z.ZodSchema<T>;
  maxTokens?: number;
  temperature?: number;
  taskId: string;
}

export type AIResult<T> =
  | { success: true; data: T; tokensUsed: number; latencyMs: number }
  | {
      success: false;
      error: string;
      retryCount: number;
      fallback: 'engineer_review';
    };

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return clientInstance;
}

/** For tests — inject a mock or reset the cached client. */
export function __setClientForTesting(client: Anthropic | null): void {
  clientInstance = client;
}

interface AttemptOk<T> {
  kind: 'ok';
  data: T;
  tokens: number;
}

interface AttemptFail {
  kind: 'fail';
  error: string;
  retryHint: string;
  tokens: number;
}

type AttemptResult<T> = AttemptOk<T> | AttemptFail;

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return fence ? fence[1].trim() : trimmed;
}

function extractText(content: Anthropic.ContentBlock[]): string {
  let out = '';
  for (const block of content) {
    if (block.type === 'text') out += block.text;
  }
  return out;
}

async function singleAttempt<T>(
  config: CallAIConfig<T>,
  prompt: string,
): Promise<AttemptResult<T>> {
  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      system: config.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'fail', error: message, retryHint: message, tokens: 0 };
  }

  const tokens =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
  const text = extractText(response.content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return {
      kind: 'fail',
      error: `JSON parse failed: ${message}`,
      retryHint: `JSON parse failed: ${message}`,
      tokens,
    };
  }

  const validation = config.outputSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      kind: 'fail',
      error: validation.error.message,
      retryHint: SCHEMA_HINT,
      tokens,
    };
  }

  return { kind: 'ok', data: validation.data, tokens };
}

export async function callAI<T>(config: CallAIConfig<T>): Promise<AIResult<T>> {
  const startedAt = Date.now();
  let totalTokens = 0;
  let lastError = '';
  let lastHint = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const promptToSend =
      attempt === 0
        ? config.prompt
        : `${config.prompt}\n\nPrevious attempt failed: ${lastHint}`;

    const result = await singleAttempt(config, promptToSend);
    totalTokens += result.tokens;

    if (result.kind === 'ok') {
      const latencyMs = Date.now() - startedAt;
      logEntry({
        timestamp: new Date(),
        pipelineId: config.taskId,
        opportunityId: config.taskId,
        level: 'info',
        category: 'engine_call',
        model: MODEL,
        tokensIn: totalTokens,
        tokensOut: 0,
        durationMs: latencyMs,
      });
      return {
        success: true,
        data: result.data,
        tokensUsed: totalTokens,
        latencyMs,
      };
    }

    lastError = result.error;
    lastHint = result.retryHint;
  }

  const latencyMs = Date.now() - startedAt;
  logEntry({
    timestamp: new Date(),
    pipelineId: config.taskId,
    opportunityId: config.taskId,
    level: 'error',
    category: 'engine_call',
    model: MODEL,
    tokensIn: totalTokens,
    tokensOut: 0,
    durationMs: latencyMs,
    errorMessage: lastError,
  });
  return {
    success: false,
    error: lastError,
    retryCount: 1,
    fallback: 'engineer_review',
  };
}

