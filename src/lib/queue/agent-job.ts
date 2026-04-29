/**
 * BullMQ agent job definition.
 *
 * Job lifecycle: PENDING → ACTIVE → COMPLETED | RETRY → FAILED → DEAD_LETTER
 */

import { Queue, type JobsOptions } from "bullmq";
import { redis } from "@/lib/redis";

export const AGENT_QUEUE_NAME = "agent-jobs";
export const DEAD_LETTER_QUEUE_NAME = "agent-jobs-dlq";

export interface AgentJobData {
  tenantId: string;
  intakeId: string;
  agentRunId: string;
  priceListId: string;
}

export const agentQueue = new Queue<AgentJobData>(AGENT_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: false,
  },
});

export const deadLetterQueue = new Queue<AgentJobData>(DEAD_LETTER_QUEUE_NAME, {
  connection: redis,
});

export async function enqueueAgentJob(
  data: AgentJobData,
  options?: Partial<JobsOptions>
): Promise<string> {
  const job = await agentQueue.add("process-intake", data, {
    ...options,
    jobId: data.agentRunId,
  });
  return job.id!;
}

export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    agentQueue.getWaitingCount(),
    agentQueue.getActiveCount(),
    agentQueue.getCompletedCount(),
    agentQueue.getFailedCount(),
    agentQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}
