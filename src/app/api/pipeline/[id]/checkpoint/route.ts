/**
 * POST /api/pipeline/[id]/checkpoint — record a human checkpoint decision
 * against the latest checkpoint on a stored pipeline state.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/middleware/validate";
import {
  loadPipelineState,
  savePipelineState,
} from "@/lib/db/pipeline-store";

const checkpointSchema = z.object({
  status: z.enum(["approved", "revision_requested", "rejected"]),
  notes: z.string().max(5000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const data = await validateBody(request, checkpointSchema);
  if (data instanceof NextResponse) return data;

  const state = await loadPipelineState(params.id);
  if (!state) {
    return NextResponse.json(
      { error: "Pipeline not found" },
      { status: 404 }
    );
  }

  const latest = state.checkpoints[state.checkpoints.length - 1];
  if (!latest) {
    return NextResponse.json(
      { error: "Pipeline has no checkpoints to update" },
      { status: 400 }
    );
  }

  latest.status = data.status;
  if (data.notes !== undefined) latest.revisionNotes = data.notes;
  latest.decidedAt = new Date();
  state.timestamps.updatedAt = new Date();

  await savePipelineState(state);

  return NextResponse.json({
    pipelineId: state.id,
    checkpoint: latest,
  });
}
