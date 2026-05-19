/**
 * E5 design PATCH action handlers — split from route.ts to keep it <200 lines.
 * Handles approve_* (phase transitions) and revise_* (re-run orchestrator).
 *
 * After each approve_* succeeds locally (E5StoredState mutation), the matching
 * unified checkpoint (e5-design-approach / e5-hld) is approved on the
 * pipeline-state record so the standard resume mechanism can drive E2/E3. If
 * no pipeline state exists for the intake (standalone design-page entry), the
 * unified work is skipped silently — local E5StoredState remains the source of
 * truth for the design tab UI in that case.
 *
 * LLD is paused for the demo per memory project-lld-deferred — the LLD
 * generation code in runLld + e5-phase2 is intact but not invoked.
 */

import { NextResponse } from "next/server";
import {
  parseJson,
  saveE5State,
  type E5StoredState,
} from "@/app/api/estimates/[id]/_e5-state";
import {
  loadPipelineStateByIntake,
  savePipelineState,
} from "@/lib/db/pipeline-store";
import {
  applyCheckpointDecision,
  isCheckpointDecisionError,
} from "@/coordinator/checkpoint-decision";
import { resumeAndPersistPipeline } from "@/coordinator/run-and-persist";
import { runHld } from "./_orchestrator-runs";

export type DesignAction =
  | "approve_design"
  | "approve_hld"
  | "revise_design"
  | "revise_hld";

const APPROVE_TO_CHECKPOINT: Record<string, string> = {
  approve_design: "e5-design-approach",
  approve_hld: "e5-hld",
};

function badPhase(current: string, action: string): NextResponse {
  return NextResponse.json(
    { error: `Action '${action}' not allowed in phase '${current}'` },
    { status: 400 },
  );
}

/**
 * Sync E5StoredState into the pipeline-state record and mark the matching
 * unified checkpoint approved. Best-effort: failure to find the pipeline or
 * the checkpoint is logged and skipped, never thrown — the operator's local
 * design-tab state has already been saved by the caller.
 */
async function approveUnifiedCheckpoint(
  intakeId: string,
  tenantId: string,
  e5State: E5StoredState,
  checkpointId: string,
): Promise<void> {
  const state = await loadPipelineStateByIntake(intakeId);
  if (!state) {
    console.warn(
      `[design-approve ${intakeId}] no pipeline state; skipping unified checkpoint '${checkpointId}'`,
    );
    return;
  }
  if (!state.checkpoints.find((c) => c.id === checkpointId)) {
    console.warn(
      `[design-approve ${intakeId}] pipeline has no checkpoint '${checkpointId}'; skipping unified approval`,
    );
    return;
  }
  // Shallow-merge the design-page artifacts into state.artifacts.e5 so the
  // dispatcher's E2 (which reads resolveE2Devices(..., state.artifacts.e5))
  // sees the same HLD outputs the operator just approved.
  state.artifacts.e5 = {
    ...state.artifacts.e5,
    ...(e5State.hldDocxPath !== undefined && { hldDocument: e5State.hldDocxPath }),
  };

  const result = applyCheckpointDecision(state, checkpointId, "approved", undefined);
  if (isCheckpointDecisionError(result)) {
    console.warn(`[design-approve ${intakeId}] ${result.error}`);
    return;
  }
  await savePipelineState(state);
  if (result.willResume && state.intakeId) {
    void resumeAndPersistPipeline(tenantId, state.intakeId);
  }
}

export async function handlePatchAction(
  intakeId: string,
  tenantId: string,
  state: E5StoredState,
  action: DesignAction,
  revisionNotes: string | undefined,
): Promise<NextResponse> {
  const now = new Date().toISOString();
  if (action === "approve_design") {
    if (state.phase !== "hld_in_progress") return badPhase(state.phase, action);
    const next: E5StoredState = { ...state, phase: "hld_complete", updatedAt: now };
    await saveE5State(intakeId, next);
    await approveUnifiedCheckpoint(intakeId, tenantId, next, APPROVE_TO_CHECKPOINT[action]);
    return NextResponse.json({ status: next.phase, updatedAt: now });
  }
  if (action === "approve_hld") {
    if (state.phase !== "hld_complete") return badPhase(state.phase, action);
    // LLD is paused for the demo (memory project-lld-deferred). Approving HLD
    // finalises the design phase and approves the unified e5-hld checkpoint,
    // which is the gate that releases E2 in the pipeline.
    const next: E5StoredState = { ...state, phase: "complete", updatedAt: now };
    await saveE5State(intakeId, next);
    await approveUnifiedCheckpoint(intakeId, tenantId, next, APPROVE_TO_CHECKPOINT[action]);
    return NextResponse.json({ status: next.phase, updatedAt: now });
  }
  // revise_design / revise_hld
  if (state.phase !== "hld_in_progress" && state.phase !== "hld_complete") {
    return badPhase(state.phase, action);
  }
  const result = await runHld(intakeId, state, revisionNotes);
  if (result instanceof NextResponse) return result;
  await saveE5State(intakeId, result);
  return NextResponse.json({
    status: result.phase,
    designApproach: parseJson(result.designApproach),
    sizingResult: parseJson(result.sizingResult),
    hldDocxPath: result.hldDocxPath,
  });
}
