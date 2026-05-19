/**
 * POST /api/pipeline/[id]/checkpoint — record a human checkpoint decision.
 * When `checkpointId` is provided, updates that specific checkpoint by id.
 * When omitted, falls back to updating the latest checkpoint (backward compat).
 *
 * When the decision is 'approved' AND all checkpoints for the just-approved
 * engine are now approved AND the pipeline is paused, kicks off
 * resumeAndPersistPipeline so the next engine runs in the background.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/middleware/validate";
import {
  loadPipelineStateForTenant,
  savePipelineState,
} from "@/lib/db/pipeline-store";
import { requireAuth } from "@/lib/middleware/auth";
import { resumeAndPersistPipeline } from "@/coordinator/run-and-persist";
import { ENGINE_CHECKPOINTS } from "@/coordinator/pipeline-state";

// Derive the allowlist from the single source of truth in pipeline-state.ts so
// new engines (or new checkpoint ids inside an existing engine) automatically
// pass Zod validation without a second list to keep in sync.
const VALID_CHECKPOINT_IDS = Object.values(ENGINE_CHECKPOINTS)
  .flat()
  .map((c) => c.id) as [string, ...string[]];

const checkpointSchema = z.object({
  checkpointId: z.enum(VALID_CHECKPOINT_IDS).optional(),
  status: z.enum(["approved", "revision_requested", "rejected"]),
  notes: z.string().max(5000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, checkpointSchema);
  if (data instanceof NextResponse) return data;

  const state = await loadPipelineStateForTenant(params.id, session.tenantId);
  if (!state) {
    return NextResponse.json(
      { error: "Pipeline not found" },
      { status: 404 }
    );
  }

  const target = data.checkpointId
    ? state.checkpoints.find((c) => c.id === data.checkpointId)
    : state.checkpoints[state.checkpoints.length - 1];

  if (!target) {
    const message = data.checkpointId
      ? `Checkpoint '${data.checkpointId}' not found on this pipeline`
      : "Pipeline has no checkpoints to update";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  target.status = data.status;
  if (data.notes !== undefined) target.revisionNotes = data.notes;
  target.decidedAt = new Date();
  state.timestamps.updatedAt = new Date();

  // Decide whether this approval should advance the pipeline. All checkpoints
  // for `target.engine` must now be 'approved' AND the pipeline must currently
  // be paused. We flip status to 'running' here as the mutex so a concurrent
  // approval that reads state after this save will see 'running' and won't
  // double-fire the resume. The race is best-effort, not transactional — fine
  // for human-driven UI clicks but would need a conditional UPDATE for true
  // concurrent safety.
  let willResume = false;
  if (data.status === "approved" && state.intakeId && state.status === "paused_at_checkpoint") {
    const engineCps = state.checkpoints.filter((c) => c.engine === target.engine);
    const allApproved =
      engineCps.length > 0 && engineCps.every((c) => c.status === "approved");
    if (allApproved) {
      state.status = "running";
      willResume = true;
    }
  }

  await savePipelineState(state);

  if (willResume && state.intakeId) {
    void resumeAndPersistPipeline(session.tenantId, state.intakeId);
  }

  return NextResponse.json({
    pipelineId: state.id,
    checkpoint: target,
    advancing: willResume,
  });
}
