/**
 * POST /api/pipeline/[id]/checkpoint — record a human checkpoint decision.
 * When `checkpointId` is provided, updates that specific checkpoint by id.
 * When omitted, falls back to updating the latest checkpoint (backward compat).
 *
 * When the decision is 'approved' AND all checkpoints for the just-approved
 * engine are now approved AND the pipeline is paused, kicks off
 * resumeAndPersistPipeline so the next engine runs in the background.
 *
 * The mutation logic itself lives in @/coordinator/checkpoint-decision so the
 * design-page PATCH handlers can apply the same advancement rules.
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
import {
  applyCheckpointDecision,
  isCheckpointDecisionError,
} from "@/coordinator/checkpoint-decision";

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

  const result = applyCheckpointDecision(
    state,
    data.checkpointId,
    data.status,
    data.notes,
  );
  if (isCheckpointDecisionError(result)) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await savePipelineState(state);

  if (result.willResume && state.intakeId) {
    void resumeAndPersistPipeline(session.tenantId, state.intakeId);
  }

  return NextResponse.json({
    pipelineId: state.id,
    checkpoint: result.target,
    advancing: result.willResume,
  });
}
