/**
 * GET /api/estimates/[id] — load BoM draft (if present) plus pipeline
 * artifacts and state for an intake. The [id] path param accepts either a
 * bomDraft id or an intake id; we resolve to an intakeId for the pipeline
 * lookups.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import {
  agentRuns,
  bomDrafts,
  exports as exportsTable,
  intakes,
  pipelineRuns,
  reviews,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  loadArtifacts,
  loadPipelineStateByIntake,
} from "@/lib/db/pipeline-store";
import { requireAuth } from "@/lib/middleware/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const [draftRow] = await db
      .select({
        id: bomDrafts.id,
        status: bomDrafts.status,
        estimateId: bomDrafts.estimateId,
        version: bomDrafts.version,
        linesJson: bomDrafts.linesJson,
        validationReportJson: bomDrafts.validationReportJson,
        summary: bomDrafts.summary,
        quoteAdvisory: bomDrafts.quoteAdvisory,
        ccwUrl: bomDrafts.ccwUrl,
        createdAt: bomDrafts.createdAt,
        updatedAt: bomDrafts.updatedAt,
        intakeId: bomDrafts.intakeId,
        customerName: intakes.customerName,
        region: intakes.region,
        country: intakes.country,
        domain: intakes.domain,
        requirementsJson: intakes.requirementsJson,
      })
      .from(bomDrafts)
      .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
      .where(and(eq(bomDrafts.id, params.id), eq(intakes.tenantId, session.tenantId)))
      .limit(1);

    let estimate: Record<string, unknown> | null = draftRow ?? null;
    let intakeId: string | null = draftRow?.intakeId ?? null;

    if (!estimate) {
      const [intakeRow] = await db
        .select({
          id: intakes.id,
          customerName: intakes.customerName,
          region: intakes.region,
          country: intakes.country,
          domain: intakes.domain,
          requirementsJson: intakes.requirementsJson,
          createdAt: intakes.createdAt,
          status: intakes.status,
        })
        .from(intakes)
        .where(and(eq(intakes.id, params.id), eq(intakes.tenantId, session.tenantId)))
        .limit(1);
      if (intakeRow) {
        estimate = intakeRow;
        intakeId = intakeRow.id;
      }
    }

    if (!estimate || !intakeId) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    const [{ e1, e2, e3 }, pipelineState] = await Promise.all([
      loadArtifacts(intakeId),
      loadPipelineStateByIntake(intakeId),
    ]);

    return NextResponse.json({
      estimate,
      e1: e1 ?? null,
      e2: e2 ?? null,
      e3: e3 ?? null,
      pipeline: pipelineState,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/estimates/[id] — approve the deal at the commercial gate.
 * Body: { status: "APPROVED", strategicJustification?: string }
 * Updates status on whichever row the id resolves to (bomDraft or intake)
 * and stores the optional justification in that row's jsonb summary blob.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json()) as {
      status?: string;
      strategicJustification?: string;
    };
    if (body.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Only status 'APPROVED' is supported" },
        { status: 400 }
      );
    }

    const justification = body.strategicJustification?.trim() || undefined;

    const [draftRow] = await db
      .select({ id: bomDrafts.id, summary: bomDrafts.summary })
      .from(bomDrafts)
      .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
      .where(and(eq(bomDrafts.id, params.id), eq(intakes.tenantId, session.tenantId)))
      .limit(1);
    if (draftRow) {
      const summary = (draftRow.summary as Record<string, unknown>) ?? {};
      const nextSummary = justification
        ? { ...summary, strategicJustification: justification, approvedAt: new Date().toISOString() }
        : { ...summary, approvedAt: new Date().toISOString() };
      const [updated] = await db
        .update(bomDrafts)
        .set({ status: "APPROVED", summary: nextSummary, updatedAt: new Date() })
        .where(eq(bomDrafts.id, params.id))
        .returning();
      return NextResponse.json({ estimate: updated });
    }

    const [intakeRow] = await db
      .select({ id: intakes.id, requirementsJson: intakes.requirementsJson })
      .from(intakes)
      .where(and(eq(intakes.id, params.id), eq(intakes.tenantId, session.tenantId)))
      .limit(1);
    if (intakeRow) {
      const reqs = (intakeRow.requirementsJson as Record<string, unknown>) ?? {};
      const nextReqs = justification
        ? { ...reqs, strategicJustification: justification, approvedAt: new Date().toISOString() }
        : { ...reqs, approvedAt: new Date().toISOString() };
      const [updated] = await db
        .update(intakes)
        .set({ status: "APPROVED", requirementsJson: nextReqs })
        .where(eq(intakes.id, params.id))
        .returning();
      return NextResponse.json({ estimate: updated });
    }

    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/estimates/[id] — remove either a bomDraft-backed estimate
 * (with its review/export/agent_run/intake) or an intake-backed wizard
 * estimate (with its pipelineRun). 204 on success, 404 when neither
 * resolves under the caller's tenant.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const [draft] = await db
      .select({
        id: bomDrafts.id,
        intakeId: bomDrafts.intakeId,
        agentRunId: bomDrafts.agentRunId,
      })
      .from(bomDrafts)
      .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
      .where(
        and(eq(bomDrafts.id, params.id), eq(intakes.tenantId, session.tenantId))
      )
      .limit(1);

    if (draft) {
      await db.delete(exportsTable).where(eq(exportsTable.bomDraftId, draft.id));
      await db.delete(reviews).where(eq(reviews.bomDraftId, draft.id));
      await db.delete(bomDrafts).where(eq(bomDrafts.id, draft.id));
      await db.delete(pipelineRuns).where(eq(pipelineRuns.intakeId, draft.intakeId));
      await db.delete(agentRuns).where(eq(agentRuns.id, draft.agentRunId));
      await db.delete(intakes).where(eq(intakes.id, draft.intakeId));
      return new NextResponse(null, { status: 204 });
    }

    const [intakeRow] = await db
      .select({ id: intakes.id })
      .from(intakes)
      .where(and(eq(intakes.id, params.id), eq(intakes.tenantId, session.tenantId)))
      .limit(1);

    if (intakeRow) {
      await db.delete(pipelineRuns).where(eq(pipelineRuns.intakeId, intakeRow.id));
      await db.delete(agentRuns).where(eq(agentRuns.intakeId, intakeRow.id));
      await db.delete(intakes).where(eq(intakes.id, intakeRow.id));
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Delete failed: ${message}` }, { status: 500 });
  }
}
