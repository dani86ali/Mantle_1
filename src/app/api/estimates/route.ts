/**
 * GET /api/estimates — list all bom_drafts with intake data joined.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/middleware/auth";

export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const results = await db
      .select({
        id: bomDrafts.id,
        status: bomDrafts.status,
        estimateId: bomDrafts.estimateId,
        version: bomDrafts.version,
        linesJson: bomDrafts.linesJson,
        summary: bomDrafts.summary,
        ccwUrl: bomDrafts.ccwUrl,
        createdAt: bomDrafts.createdAt,
        updatedAt: bomDrafts.updatedAt,
        customerName: intakes.customerName,
        region: intakes.region,
        domain: intakes.domain,
      })
      .from(bomDrafts)
      .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
      .where(eq(intakes.tenantId, session.tenantId))
      .orderBy(desc(bomDrafts.createdAt));

    const estimates = results.map((r) => {
      const lines = (r.linesJson as Array<{ unitListPrice?: number; quantity?: number; extendedNetPrice?: number }>) ?? [];
      const totalPrice = lines.reduce(
        (sum, l) => sum + ((l.extendedNetPrice ?? (l.unitListPrice ?? 0) * (l.quantity ?? 1))),
        0
      );

      return {
        id: r.id,
        estimateId: r.estimateId ?? r.id.slice(0, 12).toUpperCase(),
        customer: r.customerName,
        domain: r.domain,
        status: r.status,
        engineer: "Danish Ali",
        created: r.createdAt,
        totalPrice,
        lineCount: lines.length,
      };
    });

    return NextResponse.json({ estimates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
