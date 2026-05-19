/**
 * E5 orchestrator runs used by approve_hld / revise_* PATCH paths. Split
 * out of _actions.ts to keep that file under the 200-LOC budget. Each helper
 * returns either the next E5StoredState or a NextResponse (caller forwards it).
 *
 * Note: runLld was removed in Fix #4 (LLD paused for demo — memory
 * project-lld-deferred). LLD generation code in src/engines/e5/e5-phase2.ts
 * is intact; restore a runLld helper here when re-enabling.
 */

import { NextResponse } from "next/server";
import { runE5Detailed } from "@/engines/e5/orchestrator";
import type { EngineInput } from "@/coordinator/types";
import type { E5InputData } from "@/engines/e5/orchestrator-types";
import {
  minimalPipelineState,
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
