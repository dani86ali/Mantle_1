/** Pipeline state helpers — checkpoint records, engine-call records, logging. */

import { v4 as uuid } from 'uuid';
import { getEngineSequence } from '@/coordinator/router';
import { logEntry } from '@/coordinator/logger';
import type {
  Checkpoint, CheckpointStatus, EngineCall, EngineId, IntakeMode, PipelineState,
} from '@/coordinator/types';

export const ENGINE_CHECKPOINTS: Record<EngineId, { id: string; label: string }[]> = {
  e1: [
    { id: 'e1-requirements', label: 'Requirements baseline review' },
    { id: 'e1-compliance', label: 'Compliance matrix review' },
  ],
  e2: [
    { id: 'e2-sku-confirmation', label: 'SKU confirmation' },
    { id: 'e2-pricing-review', label: 'Pricing review' },
  ],
  e3: [{ id: 'e3-proposal', label: 'Proposal review' }],
  e4: [],
  e5: [],
};

export function createInitialState(opportunityId: string, mode: IntakeMode): PipelineState {
  const now = new Date();
  return {
    id: uuid(),
    opportunityId,
    mode,
    currentEngine: getEngineSequence(mode)[0],
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

export function startEngineCall(
  state: PipelineState, engine: EngineId, retry: number,
): EngineCall {
  const call: EngineCall = {
    id: uuid(), engine, step: 'run', model: 'n/a',
    startedAt: new Date(), retryCount: retry, outcome: 'pass',
  };
  state.engineCalls.push(call);
  logEntry({
    timestamp: call.startedAt, pipelineId: state.id, opportunityId: state.opportunityId,
    level: 'info', category: 'engine_call', engine,
  });
  return call;
}

export type CheckpointCallback = (state: PipelineState, engine: EngineId) => Promise<CheckpointStatus>;

export async function runCheckpoint(
  state: PipelineState, engine: EngineId, revision: number, cb?: CheckpointCallback,
): Promise<CheckpointStatus> {
  const defs = ENGINE_CHECKPOINTS[engine];
  if (defs.length === 0) return 'approved';
  const decision: CheckpointStatus = cb ? await cb(state, engine) : 'approved';
  const decidedAt = new Date();
  for (const def of defs) {
    const existing = state.checkpoints.find((c: Checkpoint) => c.id === def.id);
    if (existing) {
      existing.status = decision;
      existing.revisionsUsed = revision;
      existing.decidedAt = decidedAt;
    } else {
      state.checkpoints.push({
        id: def.id, engine, label: def.label, status: decision,
        revisionsUsed: revision, decidedAt,
      });
    }
    logEntry({
      timestamp: decidedAt, pipelineId: state.id, opportunityId: state.opportunityId,
      level: 'info', category: 'checkpoint', engine, checkpointId: def.id, decision,
    });
  }
  return decision;
}

export function logEvent(
  state: PipelineState, engine: EngineId,
  level: 'info' | 'warn' | 'error',
  category: 'engine_call' | 'error',
  message: string,
): void {
  logEntry({
    timestamp: new Date(), pipelineId: state.id, opportunityId: state.opportunityId,
    level, category, engine, errorMessage: message,
  });
}
