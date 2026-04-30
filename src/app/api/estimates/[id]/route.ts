/**
 * GET /api/estimates/[id] — get a single bom_draft with intake data.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [result] = await db
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

    if (!result) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ estimate: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
