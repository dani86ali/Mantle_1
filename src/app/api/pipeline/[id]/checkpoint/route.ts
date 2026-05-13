/**
 * POST /api/pipeline/[id]/checkpoint — record a human checkpoint decision.
 * When `checkpointId` is provided, updates that specific checkpoint by id.
 * When omitted, falls back to updating the latest checkpoint (backward compat).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/middleware/validate";
import {
  loadPipelineState,
  savePipelineState,
} from "@/lib/db/pipeline-store";
import { requireAuth } from "@/lib/middleware/auth";

const VALID_CHECKPOINT_IDS = [
  "e1-requirements",
  "e1-compliance",
  "e2-sku-confirmation",
  "e2-pricing-review",
  "e3-proposal",
] as const;

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

  const state = await loadPipelineState(params.id);
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

  await savePipelineState(state);

  return NextResponse.json({
    pipelineId: state.id,
    checkpoint: target,
  });
}
