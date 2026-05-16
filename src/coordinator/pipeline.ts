/**
 * Pipeline orchestrator. Decides which engine to run next, manages state
 * transitions (running / paused_at_checkpoint / completed), and provides
 * the resume entry point used by checkpoint approval.
 *
 * Per-engine "how to invoke this specific engine" logic lives in
 * pipeline-engine-dispatcher.ts. Public types live in pipeline-types.ts
 * (re-exported here for backwards compat).
 */

import type { E1Output } from '@/engines/e1/orchestrator';
import type { E2Output } from '@/engines/e2/orchestrator';
import type { E3Output } from '@/engines/e3/orchestrator';
import { getEngineSequence } from '@/coordinator/router';
import {
  ENGINE_CHECKPOINTS, createInitialState, logEvent, runCheckpoint, startEngineCall,
} from '@/coordinator/pipeline-state';
import { savePipelineState } from '@/lib/db/pipeline-store';
import { runEngine } from '@/coordinator/pipeline-engine-dispatcher';
import type { PipelineInput, PipelineResult } from '@/coordinator/pipeline-types';
import type { CheckpointStatus, EngineId, PipelineState } from '@/coordinator/types';

export type { PipelineInput, PipelineResult };

const MAX_REVISIONS = 3;

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const state = createInitialState(input.opportunityId, input.mode);
  // Wizard-driven runs use opportunityId="intake:<uuid>"; lifting the intakeId
  // onto state up-front means the hub can locate the pipeline by intakeId on
  // its very first poll (otherwise it'd render "Not started" until the
  // outer caller sets state.intakeId post-run).
  const intakeMatch = /^intake:(.+)$/.exec(input.opportunityId);
  if (intakeMatch) state.intakeId = intakeMatch[1];
  const sequence = getEngineSequence(input.mode);
  const out: PipelineResult = { state };

  // New pause-after-first-engine behavior: only for the production wizard path
  // (no onCheckpoint callback supplied) on RFP / Quick BoM. RFI still runs
  // end-to-end so its existing E4-phase1 pause + responses-driven resumption
  // remain intact. Callers that pass an onCheckpoint (tests, scripts) also keep
  // end-to-end behavior so they can drive every checkpoint inline.
  if (!input.onCheckpoint && (input.mode === 'rfp' || input.mode === 'quick_bom')) {
    await runOneEngineAndPause(state, input, sequence[0], out);
    return out;
  }

  await runEndToEnd(state, input, sequence, out);
  return out;
}

/**
 * Resume a paused pipeline. Caller supplies the persisted state, the rebuilt
 * pipeline input (via `buildPipelineInputForIntake`), and any already-saved
 * engine artifacts so the next engine can read its upstream inputs.
 *
 * Runs exactly one engine (the next one after `state.currentEngine` in the
 * mode's sequence), adds its checkpoints as pending, persists, and returns.
 * If there is no next engine, marks the pipeline as completed.
 */
export async function resumePipeline(
  state: PipelineState,
  input: PipelineInput,
  artifacts: { e1?: E1Output; e2?: E2Output; e3?: E3Output },
): Promise<PipelineResult> {
  const sequence = getEngineSequence(input.mode);
  const idx = sequence.indexOf(state.currentEngine);
  const out: PipelineResult = {
    state,
    e1Output: artifacts.e1,
    e2Output: artifacts.e2,
    e3Output: artifacts.e3,
  };

  if (idx < 0 || idx >= sequence.length - 1) {
    state.status = 'completed';
    state.timestamps.completedAt = new Date();
    state.timestamps.updatedAt = new Date();
    await savePipelineState(state);
    return out;
  }
  await runOneEngineAndPause(state, input, sequence[idx + 1], out);
  return out;
}

async function runOneEngineAndPause(
  state: PipelineState,
  input: PipelineInput,
  engine: EngineId,
  out: PipelineResult,
): Promise<void> {
  state.currentEngine = engine;
  state.status = 'running';
  state.timestamps.updatedAt = new Date();
  await savePipelineState(state);

  const call = startEngineCall(state, engine, 0);
  let failed = false;
  try {
    await runEngine(engine, input, state, out);
    call.outcome = 'pass';
  } catch (err) {
    failed = true;
    call.outcome = 'failed';
    const msg = err instanceof Error ? err.message : String(err);
    state.error = { message: `${engine}: ${msg}` };
    logEvent(state, engine, 'error', 'error', msg);
  } finally {
    call.completedAt = new Date();
    state.timestamps.updatedAt = new Date();
  }

  if (failed) {
    state.status = undefined;
    await savePipelineState(state);
    return;
  }

  // Record this engine's checkpoint defs as 'pending' so the hub can render
  // actionable cards. Skip duplicates if the engine ran before (e.g. revisions
  // in some future flow).
  const defs = ENGINE_CHECKPOINTS[engine];
  for (const def of defs) {
    if (state.checkpoints.find((c) => c.id === def.id)) continue;
    state.checkpoints.push({
      id: def.id, engine, label: def.label,
      status: 'pending', revisionsUsed: 0,
    });
  }

  state.status = 'paused_at_checkpoint';
  state.timestamps.updatedAt = new Date();
  await savePipelineState(state);
}

async function runEndToEnd(
  state: PipelineState,
  input: PipelineInput,
  sequence: EngineId[],
  out: PipelineResult,
): Promise<void> {
  let lastEngineError: string | undefined;
  try {
    for (const engine of sequence) {
      state.currentEngine = engine;
      let revisions = 0;
      let decision: CheckpointStatus = 'approved';
      while (true) {
        const call = startEngineCall(state, engine, revisions);
        try {
          await runEngine(engine, input, state, out);
          call.outcome = 'pass';
        } catch (err) {
          call.outcome = 'failed';
          const msg = err instanceof Error ? err.message : String(err);
          lastEngineError = `${engine}: ${msg}`;
          logEvent(state, engine, 'error', 'error', msg);
        } finally {
          call.completedAt = new Date();
          state.timestamps.updatedAt = new Date();
        }

        decision = await runCheckpoint(state, engine, revisions, input.onCheckpoint);
        if (decision === 'revision_requested' && revisions < MAX_REVISIONS) {
          revisions++;
          continue;
        }
        break;
      }
      if (decision === 'rejected') break;

      if (
        input.mode === 'rfi'
        && engine === 'e4'
        && !input.responseText
        && !input.responseFilePath
        && state.artifacts.e4.questionnaire
      ) {
        state.status = 'paused_at_checkpoint';
        state.currentEngine = 'e4';
        state.timestamps.updatedAt = new Date();
        logEvent(state, 'e4', 'info', 'engine_call',
          'RFI pipeline paused at E4 phase1 — awaiting client responses');
        await savePipelineState(state);
        return;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.error = { message: msg };
    logEvent(state, state.currentEngine, 'error', 'error', `Pipeline aborted: ${msg}`);
  }

  if (!state.error && lastEngineError) state.error = { message: lastEngineError };
  state.timestamps.completedAt = new Date();
}
