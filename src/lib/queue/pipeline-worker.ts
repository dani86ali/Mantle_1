/**
 * Pipeline job processor. Loads the persisted intake row, reconstructs the
 * intake-requirements payload, and delegates to runAndPersistPipeline.
 */

import type { Job } from "bullmq";
import { getIntakeById, updateIntakeStatus } from "@/lib/db/queries";
import {
  runAndPersistPipeline,
  type IntakeRequirements,
} from "@/coordinator/run-and-persist";
import type { PipelineJobData } from "@/lib/queue/pipeline-job";

export async function processPipelineJob(
  job: Job<PipelineJobData>,
): Promise<void> {
  const { tenantId, intakeId, mode, requirements } = job.data;

  console.log(
    `[Pipeline] Processing intake ${intakeId} (tenant ${tenantId}, mode ${mode})`,
  );

  try {
    const intake = await getIntakeById(tenantId, intakeId);
    if (!intake) {
      throw new Error(`Intake ${intakeId} not found`);
    }

    const stored = (intake.requirementsJson ?? {}) as Record<string, unknown>;
    const req = {
      ...stored,
      ...requirements,
      mode,
      path: intake.path,
      customerName: intake.customerName,
      region: intake.region,
      country: intake.country ?? undefined,
      domain: intake.domain,
    } as unknown as IntakeRequirements;

    await runAndPersistPipeline(tenantId, intakeId, req);

    console.log(`[Pipeline] Job ${job.id} completed for intake ${intakeId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Pipeline] Job ${job.id} failed for intake ${intakeId}: ${msg}`,
    );
    try {
      await updateIntakeStatus(tenantId, intakeId, "FAILED");
    } catch (statusErr) {
      console.error(
        `[Pipeline] Failed to update intake ${intakeId} status: ${statusErr}`,
      );
    }
    throw err;
  }
}
