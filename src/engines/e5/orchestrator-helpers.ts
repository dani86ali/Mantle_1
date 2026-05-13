/**
 * E5 orchestrator helpers — shared step-logging utilities for phase 1 / phase 2.
 * Mirrors the E4 helpers (engine field set to 'e5'). Keeps the orchestrator
 * under the 200-line cap from CLAUDE.md.
 */

import { logEntry } from '@/coordinator/logger';
import type { EngineInput } from '@/coordinator/types';

export interface E5StepLog {
  step: number;
  name: string;
  status: 'started' | 'completed' | 'skipped' | 'failed';
  durationMs: number;
  error?: string;
}

export interface StepResult<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

export async function runStep<T>(
  step: number,
  name: string,
  fn: () => Promise<T> | T,
  logs: E5StepLog[],
  input: EngineInput,
): Promise<StepResult<T>> {
  const start = Date.now();
  const entry: E5StepLog = { step, name, status: 'started', durationMs: 0 };
  logs.push(entry);
  try {
    const result = await fn();
    entry.status = 'completed';
    entry.durationMs = Date.now() - start;
    logEntry({
      timestamp: new Date(),
      pipelineId: input.pipelineState.id,
      opportunityId: input.pipelineState.opportunityId,
      level: 'info',
      category: 'engine_call',
      engine: 'e5',
      durationMs: entry.durationMs,
      errorMessage: `step ${step}:${name}:completed`,
    });
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    entry.status = 'failed';
    entry.durationMs = Date.now() - start;
    entry.error = message;
    logEntry({
      timestamp: new Date(),
      pipelineId: input.pipelineState.id,
      opportunityId: input.pipelineState.opportunityId,
      level: 'error',
      category: 'error',
      engine: 'e5',
      durationMs: entry.durationMs,
      errorMessage: `step ${step}:${name}:failed: ${message}`,
    });
    return { ok: false, error: message };
  }
}

export function recordSkip(step: number, name: string, logs: E5StepLog[]): void {
  logs.push({ step, name, status: 'skipped', durationMs: 0 });
}
