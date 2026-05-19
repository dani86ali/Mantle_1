/**
 * E5 orchestrator runs used by approve_hld / revise_* PATCH paths. Split
 * out of _actions.ts to keep that file under the 200-LOC budget. Each helper
 * returns either the next E5StoredState or a NextResponse (caller forwards it).
 */

import { NextResponse } from "next/server";
import { runE5Detailed } from "@/engines/e5/orchestrator";
import type { EngineInput } from "@/coordinator/types";
import type { E5InputData } from "@/engines/e5/orchestrator-types";
import type {
  CompatibilityResult,
  DesignApproach,
  SizingResult,
  TopologyPattern,
} from "@/engines/e5/types";
import {
  minimalPipelineState,
  parseJson,
  type E5StoredState,
} from "@/app/api/estimates/[id]/_e5-state";
import { resolveE5OutputDir } from "@/coordinator/pipeline-e5";

function inputError(): NextResponse {
  return NextResponse.json(
    { error: "Stored design has no inputData; cannot re-run orchestrator" },
    { status: 400 },
  );
}

export async function runHld(
  intakeId: string,
  state: E5StoredState,
  revisionNotes: string | undefined,
): Promise<E5StoredState | NextResponse> {
  if (!state.inputData) return inputError();
  const outputDir = await resolveE5OutputDir({
    intakeId,
    pipelineId: `e5-route-${intakeId}`,
  });
  const input: EngineInput<E5InputData> = {
    engine: "e5",
    pipelineState: minimalPipelineState(intakeId),
    inputData: { ...state.inputData, phase: "hld", outputDir },
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

export async function runLld(
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
  const outputDir = await resolveE5OutputDir({
    intakeId,
    pipelineId: `e5-route-${intakeId}`,
  });
  const input: EngineInput<E5InputData> = {
    engine: "e5",
    pipelineState: minimalPipelineState(intakeId),
    inputData: {
      ...state.inputData,
      phase: "lld",
      outputDir,
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
