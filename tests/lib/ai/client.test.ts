import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  const Ctor = vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  return { default: Ctor };
});

import { callAI, __setClientForTesting } from '@/lib/ai/client';
import { getLogs, clearLogs } from '@/coordinator/logger';

const Schema = z.object({
  name: z.string(),
  count: z.number(),
});

const baseConfig = {
  prompt: 'Extract data',
  systemPrompt: 'You are a parser',
  outputSchema: Schema,
  taskId: 'task-001',
};

function apiResponse(text: string, tokensIn = 100, tokensOut = 50) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}

beforeEach(() => {
  mockCreate.mockReset();
  clearLogs(baseConfig.taskId);
  __setClientForTesting(null);
});

describe('callAI', () => {
  it('returns success when response is valid JSON matching the schema', async () => {
    mockCreate.mockResolvedValueOnce(
      apiResponse('{"name":"acme","count":3}'),
    );

    const result = await callAI(baseConfig);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'acme', count: 3 });
      expect(result.tokensUsed).toBe(150);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('strips markdown code fences before parsing', async () => {
    mockCreate.mockResolvedValueOnce(
      apiResponse('```json\n{"name":"x","count":1}\n```'),
    );

    const result = await callAI(baseConfig);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('x');
  });

  it('retries once when first response is invalid JSON', async () => {
    mockCreate
      .mockResolvedValueOnce(apiResponse('not json at all'))
      .mockResolvedValueOnce(apiResponse('{"name":"ok","count":2}'));

    const result = await callAI(baseConfig);

    expect(result.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const secondCall = mockCreate.mock.calls[1][0];
    expect(secondCall.messages[0].content).toContain('Previous attempt failed');
    expect(secondCall.messages[0].content).toContain('JSON parse failed');
  });

  it('retries once with schema hint when Zod validation fails', async () => {
    mockCreate
      .mockResolvedValueOnce(apiResponse('{"name":"x","count":"three"}'))
      .mockResolvedValueOnce(apiResponse('{"name":"x","count":3}'));

    const result = await callAI(baseConfig);

    expect(result.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const secondPrompt = mockCreate.mock.calls[1][0].messages[0].content;
    expect(secondPrompt).toContain(
      'Your response did not match the required schema',
    );
  });

  it('returns engineer_review fallback when both attempts fail', async () => {
    mockCreate
      .mockResolvedValueOnce(apiResponse('garbage'))
      .mockResolvedValueOnce(apiResponse('still garbage'));

    const result = await callAI(baseConfig);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fallback).toBe('engineer_review');
      expect(result.retryCount).toBe(1);
      expect(result.error).toBeTruthy();
    }
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('returns engineer_review when API throws on both attempts (never throws)', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockRejectedValueOnce(new Error('rate limit again'));

    const result = await callAI(baseConfig);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fallback).toBe('engineer_review');
      expect(result.error).toContain('rate limit');
    }
  });

  it('logs every call with model, tokens, and latency', async () => {
    mockCreate.mockResolvedValueOnce(
      apiResponse('{"name":"a","count":1}', 80, 20),
    );

    await callAI(baseConfig);

    const logs = getLogs(baseConfig.taskId);
    expect(logs).toHaveLength(1);
    expect(logs[0].category).toBe('engine_call');
    expect(logs[0].model).toBe('claude-sonnet-4-6-20250514');
    expect(logs[0].tokensIn).toBe(100);
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(logs[0].level).toBe('info');
  });

  it('logs an error entry when both attempts fail', async () => {
    mockCreate
      .mockResolvedValueOnce(apiResponse('bad', 10, 5))
      .mockResolvedValueOnce(apiResponse('bad again', 10, 5));

    await callAI(baseConfig);

    const logs = getLogs(baseConfig.taskId);
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].errorMessage).toBeTruthy();
    expect(logs[0].tokensIn).toBe(30);
  });

  it('respects custom maxTokens and temperature', async () => {
    mockCreate.mockResolvedValueOnce(apiResponse('{"name":"a","count":1}'));

    await callAI({ ...baseConfig, maxTokens: 1024, temperature: 0.5 });

    const call = mockCreate.mock.calls[0][0];
    expect(call.max_tokens).toBe(1024);
    expect(call.temperature).toBe(0.5);
  });
});
