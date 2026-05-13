/**
 * DELETE /api/review/[id] — delete an estimate and its associated records.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { bomDrafts, reviews, agentRuns, intakes, exports as exportsTable } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/middleware/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const bomDraftId = params.id;

  try {
    const [draft] = await db
      .select({
        id: bomDrafts.id,
        intakeId: bomDrafts.intakeId,
        agentRunId: bomDrafts.agentRunId,
      })
      .from(bomDrafts)
      .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
      .where(and(eq(bomDrafts.id, bomDraftId), eq(intakes.tenantId, session.tenantId)))
      .limit(1);

    if (!draft) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    // Delete in order: exports → reviews → bom_draft → agent_run → intake
    await db.delete(exportsTable).where(eq(exportsTable.bomDraftId, bomDraftId));
    await db.delete(reviews).where(eq(reviews.bomDraftId, bomDraftId));
    await db.delete(bomDrafts).where(eq(bomDrafts.id, bomDraftId));
    await db.delete(agentRuns).where(eq(agentRuns.id, draft.agentRunId));
    await db.delete(intakes).where(eq(intakes.id, draft.intakeId));

    return NextResponse.json({ deleted: true, id: bomDraftId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Delete failed: ${message}` },
      { status: 500 }
    );
  }
}
