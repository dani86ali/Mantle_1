import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { validateBody, reviewActionSchema } from "@/lib/middleware/validate";
import {
  getBomDraftsByTenant,
  getBomDraftById,
  updateBomDraft,
  createReview,
  getReviewsByBomDraft,
} from "@/lib/db/queries";
import { appendAuditLog } from "@/lib/db/queries";

/** GET /api/review — list BoM drafts ready for review */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "READY_FOR_REVIEW";
  const bomDraftId = searchParams.get("id");

  if (bomDraftId) {
    const draft = await getBomDraftById(session.tenantId, bomDraftId);
    if (!draft) {
      return NextResponse.json(
        { error: "BoM draft not found" },
        { status: 404 }
      );
    }

    const reviews = await getReviewsByBomDraft(
      session.tenantId,
      bomDraftId
    );

    return NextResponse.json({ draft, reviews });
  }

  const drafts = await getBomDraftsByTenant(session.tenantId, status);
  return NextResponse.json({ drafts });
}

/** POST /api/review — submit review action (with optimistic locking) */
export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, reviewActionSchema);
  if (data instanceof NextResponse) return data;

  // Optimistic locking: check version before update
  const draft = await getBomDraftById(session.tenantId, data.bomDraftId);
  if (!draft) {
    return NextResponse.json(
      { error: "BoM draft not found" },
      { status: 404 }
    );
  }

  // Check engineer assignment
  if (
    draft.assignedEngineerId &&
    draft.assignedEngineerId !== session.userId
  ) {
    return NextResponse.json(
      {
        error: "Currently being reviewed by another engineer",
        assignedTo: draft.assignedEngineerId,
      },
      { status: 409 }
    );
  }

  // Attempt update with optimistic locking
  const updateData: Record<string, unknown> = {
    assignedEngineerId: session.userId,
  };

  if (data.decision) {
    updateData.status =
      data.decision === "rejected"
        ? "NEEDS_CLARIFICATION"
        : "APPROVED";
  }

  if (data.lineOverrides?.length) {
    // Apply line overrides to the existing lines
    const lines = (draft.linesJson as unknown[]) ?? [];
    updateData.linesJson = lines; // In production, apply overrides
  }

  const updated = await updateBomDraft(
    session.tenantId,
    data.bomDraftId,
    data.expectedVersion,
    updateData
  );

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "This BoM was modified by another user. Please reload and try again.",
        currentVersion: draft.version,
      },
      { status: 409 }
    );
  }

  // Create review record if decision is provided
  if (data.decision) {
    await createReview({
      tenantId: session.tenantId,
      bomDraftId: data.bomDraftId,
      engineerId: session.userId,
      decision: data.decision,
      lineOverridesJson: data.lineOverrides ?? [],
      commentsJson: data.comments ?? [],
    });
  }

  await appendAuditLog(
    session.tenantId,
    data.decision ? `review:${data.decision}` : "review:draft_saved",
    session.userId,
    {
      bomDraftId: data.bomDraftId,
      version: updated.version,
    }
  );

  return NextResponse.json({
    id: data.bomDraftId,
    version: updated.version,
    status: updated.status,
  });
}
