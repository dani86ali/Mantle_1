import type { z } from "zod";
import { runPipeline, resumePipeline } from "@/coordinator/pipeline";
import { buildPipelineInputForIntake } from "@/coordinator/intake-to-pipeline-input";
import {
  loadArtifacts,
  loadPipelineStateByIntake,
  savePipelineState,
  saveE1Artifacts,
  saveE2Artifacts,
  saveE3Artifacts,
} from "@/lib/db/pipeline-store";
import { updateIntakeStatus } from "@/lib/db/queries";
import type { intakeFormSchema } from "@/lib/middleware/validate";
import type { PipelineResult } from "@/coordinator/pipeline";

export type IntakeRequirements = z.infer<typeof intakeFormSchema>;

async function persistResult(
  tenantId: string,
  intakeId: string,
  result: PipelineResult,
): Promise<void> {
  result.state.intakeId = intakeId;
  await savePipelineState(result.state);
  if (result.e1Output) await saveE1Artifacts(intakeId, result.e1Output);
  if (result.e2Output) await saveE2Artifacts(intakeId, result.e2Output);
  if (result.e3Output) await saveE3Artifacts(intakeId, result.e3Output);
  if (result.state.error) {
    await updateIntakeStatus(tenantId, intakeId, "FAILED");
  }
}

export async function runAndPersistPipeline(
  tenantId: string,
  intakeId: string,
  req: IntakeRequirements,
): Promise<void> {
  try {
    const input = await buildPipelineInputForIntake(tenantId, intakeId, req);
    const result = await runPipeline(input);
    await persistResult(tenantId, intakeId, result);
  } catch (err) {
    console.error(`[intake ${intakeId}] pipeline failed:`, err);
    try {
      await updateIntakeStatus(tenantId, intakeId, "FAILED");
    } catch (statusErr) {
      console.error(`[intake ${intakeId}] failed to update status:`, statusErr);
    }
  }
}

/**
 * Resume a paused pipeline. Called by the checkpoint-approval API after all
 * checkpoints for the current engine flip to 'approved'. Runs the next engine
 * (or marks the pipeline completed if there is no next engine), then persists.
 */
export async function resumeAndPersistPipeline(
  tenantId: string,
  intakeId: string,
): Promise<void> {
  try {
    const state = await loadPipelineStateByIntake(intakeId);
    if (!state) {
      console.error(`[intake ${intakeId}] resume: no pipeline state found`);
      return;
    }
    const input = await buildPipelineInputForIntake(tenantId, intakeId);
    const artifacts = await loadArtifacts(intakeId);
    const result = await resumePipeline(state, input, artifacts);
    await persistResult(tenantId, intakeId, result);
  } catch (err) {
    console.error(`[intake ${intakeId}] resume failed:`, err);
    try {
      await updateIntakeStatus(tenantId, intakeId, "FAILED");
    } catch (statusErr) {
      console.error(`[intake ${intakeId}] failed to update status:`, statusErr);
    }
  }
}
