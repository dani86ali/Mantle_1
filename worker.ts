/**
 * BullMQ worker entry point.
 *
 * Run with: npx tsx worker.ts
 * Processes agent jobs from the queue with concurrency control.
 */

import { Worker, type Job } from "bullmq";
import { redis } from "./src/lib/redis";
import { runAgent } from "./src/lib/agent/agent";
import {
  AGENT_QUEUE_NAME,
  DEAD_LETTER_QUEUE_NAME,
  deadLetterQueue,
  type AgentJobData,
} from "./src/lib/queue/agent-job";
import {
  PIPELINE_QUEUE_NAME,
  type PipelineJobData,
} from "./src/lib/queue/pipeline-job";
import { processPipelineJob } from "./src/lib/queue/pipeline-worker";
import { updateAgentRun, createBomDraft, updateIntakeStatus } from "./src/lib/db/queries";
import { appendAuditLog } from "./src/lib/db/queries";
import { getTenantById } from "./src/lib/db/queries";
import { AgentTimeoutError, AgentBudgetError } from "./src/lib/agent/agent";
import { CiscoAuthError } from "./src/lib/adapters/auth";
import type { StandardsConfig } from "./src/types/tenant";

const DEFAULT_CONCURRENCY = 3;

const worker = new Worker<AgentJobData>(
  AGENT_QUEUE_NAME,
  async (job: Job<AgentJobData>) => {
    const { tenantId, intakeId, agentRunId, priceListId } = job.data;

    console.log(
      `[Worker] Processing job ${job.id} for tenant ${tenantId}, intake ${intakeId}`
    );

    // Update agent run status to ACTIVE
    await updateAgentRun(agentRunId, {
      status: "ACTIVE",
      startedAt: new Date(),
    });

    // Update intake status
    await updateIntakeStatus(tenantId, intakeId, "PROCESSING");

    try {
      // Load tenant for standards config
      const tenant = await getTenantById(tenantId);
      if (!tenant) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      const standards = (tenant.standardsConfig as StandardsConfig) ?? {
        approvedProductFamilies: [],
        preferredLicenseTier: "advantage" as const,
        preferredDnaTier: "advantage" as const,
        defaultSupportTerm: "CON-SNT",
        defaultSupportLevel: "8x5xNBD",
        regionRestrictions: [],
        approvedAlternates: {},
        engineeringRules: [],
        defaultPowerCableType: "CAB-TA-NA",
        requireRedundantPsu: true,
      };

      // TODO: Load credentials from tenant_credentials table
      // For now, use mock mode credentials
      const credentials = {
        clientId: "mock-client-id",
        clientSecret: "mock-client-secret",
        username: "mock-username",
        password: "mock-password",
      };

      // Load intake
      const { getIntakeById } = await import("./src/lib/db/queries");
      const intake = await getIntakeById(tenantId, intakeId);
      if (!intake) {
        throw new Error(`Intake ${intakeId} not found`);
      }

      // Run the agent
      const output = await runAgent({
        intake: {
          id: intake.id,
          tenantId: intake.tenantId,
          path: intake.path as "path_a" | "path_b",
          source: intake.source as "ui_form" | "paste_email" | "email_monitor",
          customerName: intake.customerName,
          region: intake.region,
          country: intake.country ?? intake.region,
          domain: intake.domain as "access_switching" | "wireless" | "access_switching_wireless",
          requirements: intake.requirementsJson as Record<string, unknown> as never,
          status: intake.status as never,
          createdAt: intake.createdAt,
        },
        tenantId,
        priceListId,
        standards,
        credentials,
      });

      // Update agent run with results
      await updateAgentRun(agentRunId, {
        status: "COMPLETED",
        completedAt: new Date(),
        llmCallsJson: output.llmCalls,
        ciscoCallsJson: output.ciscoCalls,
        tokenUsageJson: {
          totalInputTokens: output.totalInputTokens,
          totalOutputTokens: output.totalOutputTokens,
        },
      });

      // Create BoM draft
      await createBomDraft({
        tenantId,
        intakeId,
        agentRunId,
        version: 1,
        linesJson: output.lines,
        validationReportJson: { passed: 0, warnings: 0, errors: 0, rules: [] },
        summary: output.summary,
        estimateId: output.estimateId,
        ccwUrl: output.ccwUrl,
        quoteAdvisory: output.quoteAdvisory,
        status: "READY_FOR_REVIEW",
      });

      // Update intake status
      await updateIntakeStatus(tenantId, intakeId, "COMPLETED");

      await appendAuditLog(tenantId, "agent_run:completed", null, {
        agentRunId,
        intakeId,
        lineCount: output.lines.length,
        estimateId: output.estimateId,
      });

      console.log(
        `[Worker] Job ${job.id} completed. ${output.lines.length} lines, estimate: ${output.estimateId}`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorType = categorizeError(error);

      console.error(`[Worker] Job ${job.id} failed (${errorType}): ${errorMessage}`);

      await updateAgentRun(agentRunId, {
        status: errorType === "timeout" ? "TIMEOUT" : "FAILED",
        completedAt: new Date(),
        errorMessage,
      });

      await updateIntakeStatus(tenantId, intakeId, "AGENT_FAILED");

      await appendAuditLog(tenantId, "agent_run:failed", null, {
        agentRunId,
        intakeId,
        errorType,
        errorMessage,
      });

      // Move to dead letter queue on permanent failures
      if (errorType === "permanent" || errorType === "timeout" || errorType === "budget") {
        await deadLetterQueue.add("dead-letter", job.data, {
          jobId: `dlq-${job.id}`,
        });
      }

      throw error; // Let BullMQ handle retries for transient errors
    }
  },
  {
    connection: redis,
    concurrency: DEFAULT_CONCURRENCY,
    limiter: {
      max: 20, // Max 20 concurrent jobs per tenant
      duration: 1000,
    },
  }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

worker.on("error", (err) => {
  console.error(`[Worker] Error: ${err.message}`);
});

function categorizeError(error: unknown): string {
  if (error instanceof AgentTimeoutError) return "timeout";
  if (error instanceof AgentBudgetError) return "budget";
  if (error instanceof CiscoAuthError) return "auth";
  if (error instanceof Error) {
    if (error.message.includes("429") || error.message.includes("rate")) {
      return "rate_limit";
    }
    if (error.message.includes("SOAP") || error.message.includes("XML")) {
      return "soap_error";
    }
  }
  return "permanent";
}

console.log(`[Worker] BOMatic agent worker started (concurrency: ${DEFAULT_CONCURRENCY})`);

const pipelineWorker = new Worker<PipelineJobData>(
  PIPELINE_QUEUE_NAME,
  processPipelineJob,
  {
    connection: redis,
    concurrency: DEFAULT_CONCURRENCY,
  }
);

pipelineWorker.on("completed", (job) => {
  console.log(`[Pipeline] Job ${job.id} completed successfully`);
});

pipelineWorker.on("failed", (job, err) => {
  console.error(`[Pipeline] Job ${job?.id} failed: ${err.message}`);
});

pipelineWorker.on("error", (err) => {
  console.error(`[Pipeline] Error: ${err.message}`);
});

console.log(`[Pipeline] BOMatic pipeline worker started (concurrency: ${DEFAULT_CONCURRENCY})`);
