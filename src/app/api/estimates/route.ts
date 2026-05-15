/**
 * GET /api/estimates — list both chat-backed (bom_drafts) and wizard
 * pipeline-backed (intakes + pipeline_runs) estimates, merged by createdAt.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes, pipelineRuns } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/middleware/auth";

interface MergedEstimate {
  id: string;
  estimateId: string;
  customer: string | null;
  domain: string;
  status: string;
  engineer: string;
  created: Date;
  totalPrice: number;
  lineCount: number;
  source: "chat" | "pipeline";
}

interface DraftLine {
  unitListPrice?: number;
  quantity?: number;
  extendedNetPrice?: number;
}

interface E2ArtifactShape {
  bom?: unknown[];
  totals?: { grandTotalIncVat?: number } | null;
}

export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const draftRows = await db
      .select({
        id: bomDrafts.id,
        status: bomDrafts.status,
        estimateId: bomDrafts.estimateId,
        linesJson: bomDrafts.linesJson,
        createdAt: bomDrafts.createdAt,
        customerName: intakes.customerName,
        domain: intakes.domain,
      })
      .from(bomDrafts)
      .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
      .where(eq(intakes.tenantId, session.tenantId))
      .orderBy(desc(bomDrafts.createdAt));

    const draftEstimates: MergedEstimate[] = draftRows.map((r) => {
      const lines = (r.linesJson as DraftLine[] | null) ?? [];
      const totalPrice = lines.reduce(
        (sum, l) =>
          sum +
          (l.extendedNetPrice ?? (l.unitListPrice ?? 0) * (l.quantity ?? 1)),
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
        source: "chat",
      };
    });

    const intakeRows = await db
      .select({
        id: intakes.id,
        intakeStatus: intakes.status,
        createdAt: intakes.createdAt,
        customerName: intakes.customerName,
        domain: intakes.domain,
        pipelineStatus: pipelineRuns.status,
        e2Artifacts: pipelineRuns.e2Artifacts,
      })
      .from(intakes)
      .leftJoin(bomDrafts, eq(bomDrafts.intakeId, intakes.id))
      .leftJoin(pipelineRuns, eq(pipelineRuns.intakeId, intakes.id))
      .where(
        and(eq(intakes.tenantId, session.tenantId), isNull(bomDrafts.id))
      )
      .orderBy(desc(intakes.createdAt));

    const pipelineEstimates: MergedEstimate[] = intakeRows.map((r) => {
      const e2 = (r.e2Artifacts as E2ArtifactShape | null) ?? null;
      const totalPrice = e2?.totals?.grandTotalIncVat ?? 0;
      const lineCount = e2?.bom?.length ?? 0;
      return {
        id: r.id,
        estimateId: r.id.slice(0, 12).toUpperCase(),
        customer: r.customerName,
        domain: r.domain,
        status: mergeStatus(r.intakeStatus, r.pipelineStatus),
        engineer: "Danish Ali",
        created: r.createdAt,
        totalPrice,
        lineCount,
        source: "pipeline",
      };
    });

    const merged = [...draftEstimates, ...pipelineEstimates].sort(
      (a, b) => b.created.getTime() - a.created.getTime()
    );

    return NextResponse.json({ estimates: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Approved/Failed intake status wins. Otherwise translate the pipeline run
// status into something the UI's mapStatus understands.
function mergeStatus(
  intakeStatus: string,
  pipelineStatus: string | null
): string {
  if (intakeStatus === "APPROVED" || intakeStatus === "FAILED") {
    return intakeStatus === "FAILED" ? "AGENT_FAILED" : "APPROVED";
  }
  if (!pipelineStatus) return intakeStatus;
  if (pipelineStatus === "failed") return "AGENT_FAILED";
  if (pipelineStatus === "running") return "PROCESSING";
  if (pipelineStatus === "completed") return "READY_FOR_REVIEW";
  return intakeStatus;
}
