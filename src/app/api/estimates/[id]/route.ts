/**
 * GET /api/estimates/[id] — load BoM draft (if present) plus pipeline
 * artifacts and state for an intake. The [id] path param accepts either a
 * bomDraft id or an intake id; we resolve to an intakeId for the pipeline
 * lookups.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  loadArtifacts,
  loadPipelineStateByIntake,
} from "@/lib/db/pipeline-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      .where(eq(bomDrafts.id, params.id))
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
        .where(eq(intakes.id, params.id))
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
