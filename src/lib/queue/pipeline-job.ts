/**
 * BullMQ pipeline job definition.
 *
 * Replaces the fire-and-forget `void runAndPersistPipeline(...)` call in the
 * intake API route so pipeline runs survive process crashes and benefit from
 * BullMQ retries.
 */

import { Queue, type JobsOptions } from "bullmq";
import { redis } from "@/lib/redis";

export const PIPELINE_QUEUE_NAME = "intake-pipeline";

export interface PipelineJobData {
  tenantId: string;
  intakeId: string;
  mode: string;
  requirements: Record<string, unknown>;
}

export const pipelineQueue = new Queue<PipelineJobData>(PIPELINE_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: false,
  },
});

export async function enqueuePipelineJob(
  data: PipelineJobData,
  options?: Partial<JobsOptions>,
): Promise<string> {
  const job = await pipelineQueue.add("run-pipeline", data, {
    ...options,
    jobId: data.intakeId,
  });
  return job.id!;
}
