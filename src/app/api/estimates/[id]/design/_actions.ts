/**
 * E5 design PATCH action handlers — split from route.ts to keep it <200 lines.
 * Handles approve_* (phase transitions) and revise_* (re-run orchestrator).
 *
 * After each approve_* succeeds locally (E5StoredState mutation), the matching
 * unified checkpoint (e5-design-approach / e5-hld / e5-lld) is approved on the
 * pipeline-state record so the standard resume mechanism can drive E2/E3. If
 * no pipeline state exists for the intake (standalone design-page entry), the
 * unified work is skipped silently — local E5StoredState remains the source of
 * truth for the design tab UI in that case.
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
import { runHld, runLld } from "./_orchestrator-runs";

export type DesignAction =
  | "approve_design"
  | "approve_hld"
  | "approve_lld"
  | "revise_design"
  | "revise_hld"
  | "revise_lld";

const APPROVE_TO_CHECKPOINT: Record<string, string> = {
  approve_design: "e5-design-approach",
  approve_hld: "e5-hld",
  approve_lld: "e5-lld",
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
  // sees the same component list the operator just approved.
  state.artifacts.e5 = {
    ...state.artifacts.e5,
    ...(e5State.componentList !== undefined && { componentList: e5State.componentList }),
    ...(e5State.hldDocxPath !== undefined && { hldDocument: e5State.hldDocxPath }),
    ...(e5State.lldDocxPath !== undefined && { lldDocument: e5State.lldDocxPath }),
    ...(e5State.ipVlanPlan !== undefined && { ipVlanPlan: e5State.ipVlanPlan }),
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
    const result = await runLld(intakeId, state, undefined);
    if (result instanceof NextResponse) return result;
    await saveE5State(intakeId, result);
    await approveUnifiedCheckpoint(intakeId, tenantId, result, APPROVE_TO_CHECKPOINT[action]);
    return NextResponse.json({
      status: result.phase,
      lldDocxPath: result.lldDocxPath,
      ipVlanPlan: parseJson(result.ipVlanPlan),
      componentList: parseJson(result.componentList),
    });
  }
  if (action === "approve_lld") {
    if (state.phase !== "lld_complete") return badPhase(state.phase, action);
    const next: E5StoredState = { ...state, phase: "complete", updatedAt: now };
    await saveE5State(intakeId, next);
    await approveUnifiedCheckpoint(intakeId, tenantId, next, APPROVE_TO_CHECKPOINT[action]);
    return NextResponse.json({ status: next.phase, updatedAt: now });
  }
  if (action === "revise_design" || action === "revise_hld") {
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
  // revise_lld
  if (state.phase !== "lld_complete") return badPhase(state.phase, action);
  const result = await runLld(intakeId, state, revisionNotes);
  if (result instanceof NextResponse) return result;
  await saveE5State(intakeId, result);
  return NextResponse.json({
    status: result.phase,
    lldDocxPath: result.lldDocxPath,
    ipVlanPlan: parseJson(result.ipVlanPlan),
    componentList: parseJson(result.componentList),
  });
}
