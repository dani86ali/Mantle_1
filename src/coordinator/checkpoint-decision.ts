/**
 * Shared checkpoint-decision logic. Mutates `state` to record a human
 * decision on a checkpoint and reports whether the caller should fire
 * `resumeAndPersistPipeline` after persisting.
 *
 * Pure (no I/O). Callers persist state and (optionally) fire resume themselves.
 * Used by both /api/pipeline/[id]/checkpoint and the design-page approve_*
 * handlers so both paths advance the pipeline identically.
 */

import type { Checkpoint, PipelineState } from "@/coordinator/types";

export interface CheckpointDecisionResult {
  target: Checkpoint;
  willResume: boolean;
}

export type CheckpointDecisionError = { error: string };

export function applyCheckpointDecision(
  state: PipelineState,
  checkpointId: string | undefined,
  status: "approved" | "revision_requested" | "rejected",
  notes: string | undefined,
): CheckpointDecisionResult | CheckpointDecisionError {
  const target = checkpointId
    ? state.checkpoints.find((c) => c.id === checkpointId)
    : state.checkpoints[state.checkpoints.length - 1];
  if (!target) {
    return {
      error: checkpointId
        ? `Checkpoint '${checkpointId}' not found on this pipeline`
        : "Pipeline has no checkpoints to update",
    };
  }
  target.status = status;
  if (notes !== undefined) target.revisionNotes = notes;
  target.decidedAt = new Date();
  state.timestamps.updatedAt = new Date();

  // The resume gate: only when this is an 'approved' decision, the pipeline
  // is currently paused, AND every checkpoint belonging to `target.engine`
  // is now approved. We flip status to 'running' here as the mutex so a
  // concurrent approval that reads state after this save won't double-fire.
  // (Best-effort — see route.ts comment history for prior context.)
  let willResume = false;
  if (
    status === "approved"
    && state.intakeId
    && state.status === "paused_at_checkpoint"
  ) {
    const engineCps = state.checkpoints.filter((c) => c.engine === target.engine);
    const allApproved =
      engineCps.length > 0 && engineCps.every((c) => c.status === "approved");
    if (allApproved) {
      state.status = "running";
      willResume = true;
    }
  }
  return { target, willResume };
}

export function isCheckpointDecisionError(
  result: CheckpointDecisionResult | CheckpointDecisionError,
): result is CheckpointDecisionError {
  return "error" in result;
}
