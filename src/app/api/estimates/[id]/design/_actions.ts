/**
 * E5 design PATCH action handlers — split from route.ts to keep it <200 lines.
 * Handles approve_* (phase transitions) and revise_* (re-run orchestrator).
 */

import { NextResponse } from "next/server";
import { runE5Detailed } from "@/engines/e5/orchestrator";
import type { EngineInput } from "@/coordinator/types";
import type {
  CompatibilityResult,
  DesignApproach,
  SizingResult,
  TopologyPattern,
} from "@/engines/e5/types";
import {
  minimalPipelineState,
  parseJson,
  saveE5State,
  type E5StoredState,
} from "@/app/api/estimates/[id]/_e5-state";

export type DesignAction =
  | "approve_design"
  | "approve_hld"
  | "approve_lld"
  | "revise_design"
  | "revise_hld"
  | "revise_lld";

function badPhase(current: string, action: string): NextResponse {
  return NextResponse.json(
    { error: `Action '${action}' not allowed in phase '${current}'` },
    { status: 400 },
  );
}

function inputError(): NextResponse {
  return NextResponse.json(
    { error: "Stored design has no inputData; cannot re-run orchestrator" },
    { status: 400 },
  );
}

async function runHld(
  intakeId: string,
  state: E5StoredState,
  revisionNotes: string | undefined,
): Promise<E5StoredState | NextResponse> {
  if (!state.inputData) return inputError();
  const input: EngineInput = {
    engine: "e5",
    pipelineState: minimalPipelineState(intakeId),
    inputData: { ...state.inputData, phase: "hld" },
    revisionNotes,
  };
  const out = await runE5Detailed(input);
  if (out.output.error || !out.phase1) {
    throw new Error(out.output.error ?? "E5 HLD re-run did not produce a result");
  }
  return {
    ...state,
    phase: "hld_in_progress",
    designApproach: JSON.stringify(out.phase1.designApproach),
    topology: out.phase1.topology,
    sizingResult: JSON.stringify(out.phase1.sizing),
    compatibilityResult: JSON.stringify(out.phase1.compatibility),
    hldSections: JSON.stringify(out.phase1.hldSections),
    hldDocxPath: out.phase1.hldDocPath,
    diagramXml: out.phase1.diagramXml,
    revisionNotes,
    updatedAt: new Date().toISOString(),
  };
}

async function runLld(
  intakeId: string,
  state: E5StoredState,
  revisionNotes: string | undefined,
): Promise<E5StoredState | NextResponse> {
  if (!state.inputData) return inputError();
  const designApproach = parseJson<DesignApproach>(state.designApproach);
  const topology = state.topology as TopologyPattern | undefined;
  const sizing = parseJson<SizingResult>(state.sizingResult);
  const compatibility = parseJson<CompatibilityResult>(state.compatibilityResult);
  if (!designApproach || !topology || !sizing || !compatibility) {
    return NextResponse.json(
      { error: "Cannot run LLD: HLD handoff artifacts missing" },
      { status: 400 },
    );
  }
  const input: EngineInput = {
    engine: "e5",
    pipelineState: minimalPipelineState(intakeId),
    inputData: {
      ...state.inputData,
      phase: "lld",
      hldHandoff: { designApproach, topology, sizing, compatibility },
    },
    revisionNotes,
  };
  const out = await runE5Detailed(input);
  if (out.output.error || !out.phase2) {
    throw new Error(out.output.error ?? "E5 LLD did not produce a result");
  }
  return {
    ...state,
    phase: "lld_complete",
    lldSections: JSON.stringify(out.phase2.lldSections),
    lldDocxPath: out.phase2.lldDocPath,
    ipVlanPlan: JSON.stringify(out.phase2.ipVlanPlan),
    componentList: JSON.stringify(out.componentList ?? []),
    revisionNotes,
    updatedAt: new Date().toISOString(),
  };
}

export async function handlePatchAction(
  intakeId: string,
  state: E5StoredState,
  action: DesignAction,
  revisionNotes: string | undefined,
): Promise<NextResponse> {
  const now = new Date().toISOString();
  if (action === "approve_design") {
    if (state.phase !== "hld_in_progress") return badPhase(state.phase, action);
    const next: E5StoredState = { ...state, phase: "hld_complete", updatedAt: now };
    await saveE5State(intakeId, next);
    return NextResponse.json({ status: next.phase, updatedAt: now });
  }
  if (action === "approve_hld") {
    if (state.phase !== "hld_complete") return badPhase(state.phase, action);
    const result = await runLld(intakeId, state, undefined);
    if (result instanceof NextResponse) return result;
    await saveE5State(intakeId, result);
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
