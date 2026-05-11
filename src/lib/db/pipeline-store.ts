import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { pipelineRuns } from "./schema";
import type { PipelineState } from "@/coordinator/types";
import type { E1Output } from "@/engines/e1/orchestrator";
import type { E2Output } from "@/engines/e2/orchestrator";

export async function savePipelineState(state: PipelineState): Promise<void> {
  const status = state.timestamps.completedAt ? "completed" : "running";
  const now = new Date();
  await db
    .insert(pipelineRuns)
    .values({
      id: state.id,
      opportunityId: state.opportunityId,
      state: state as unknown as Record<string, unknown>,
      status,
      createdAt: state.timestamps.createdAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pipelineRuns.id,
      set: {
        opportunityId: state.opportunityId,
        state: state as unknown as Record<string, unknown>,
        status,
        updatedAt: now,
      },
    });
}

export async function loadPipelineState(
  pipelineId: string,
): Promise<PipelineState | null> {
  const [row] = await db
    .select({ state: pipelineRuns.state })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.id, pipelineId))
    .limit(1);
  if (!row || !row.state) return null;
  return reviveState(row.state as Record<string, unknown>);
}

export async function saveE1Artifacts(
  intakeId: string,
  e1Output: E1Output,
): Promise<void> {
  await upsertByIntake(intakeId, { e1Artifacts: serialize(e1Output) });
}

export async function saveE2Artifacts(
  intakeId: string,
  e2Output: E2Output,
): Promise<void> {
  await upsertByIntake(intakeId, { e2Artifacts: serialize(e2Output) });
}

export async function loadArtifacts(
  intakeId: string,
): Promise<{ e1?: E1Output; e2?: E2Output }> {
  const [row] = await db
    .select({
      e1Artifacts: pipelineRuns.e1Artifacts,
      e2Artifacts: pipelineRuns.e2Artifacts,
    })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.intakeId, intakeId))
    .limit(1);
  if (!row) return {};
  const out: { e1?: E1Output; e2?: E2Output } = {};
  if (row.e1Artifacts) out.e1 = row.e1Artifacts as unknown as E1Output;
  if (row.e2Artifacts) out.e2 = row.e2Artifacts as unknown as E2Output;
  return out;
}

// PipelineState carries no intakeId, so artifact rows are independent of
// state rows: a pipeline that calls savePipelineState AND saveE*Artifacts
// will produce two pipeline_runs rows. Plumb intakeId into PipelineState to merge.
async function upsertByIntake(
  intakeId: string,
  patch: { e1Artifacts?: Record<string, unknown>; e2Artifacts?: Record<string, unknown> },
): Promise<void> {
  const now = new Date();
  await db
    .insert(pipelineRuns)
    .values({
      id: uuid(),
      opportunityId: `intake:${intakeId}`,
      intakeId,
      ...patch,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pipelineRuns.intakeId,
      set: { ...patch, updatedAt: now },
    });
}

function serialize<T>(obj: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
}

interface SerializedTimestamps {
  createdAt: string | Date;
  updatedAt: string | Date;
  completedAt?: string | Date;
}

function reviveState(raw: Record<string, unknown>): PipelineState {
  const ts = raw.timestamps as SerializedTimestamps;
  const calls = (raw.engineCalls ?? []) as Array<{
    startedAt: string | Date;
    completedAt?: string | Date;
    [k: string]: unknown;
  }>;
  const checkpoints = (raw.checkpoints ?? []) as Array<{
    decidedAt?: string | Date;
    [k: string]: unknown;
  }>;
  return {
    ...(raw as unknown as PipelineState),
    timestamps: {
      createdAt: new Date(ts.createdAt),
      updatedAt: new Date(ts.updatedAt),
      completedAt: ts.completedAt ? new Date(ts.completedAt) : undefined,
    },
    engineCalls: calls.map((c) => ({
      ...c,
      startedAt: new Date(c.startedAt),
      completedAt: c.completedAt ? new Date(c.completedAt) : undefined,
    })) as PipelineState["engineCalls"],
    checkpoints: checkpoints.map((c) => ({
      ...c,
      decidedAt: c.decidedAt ? new Date(c.decidedAt) : undefined,
    })) as PipelineState["checkpoints"],
  };
}
