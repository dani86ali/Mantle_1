import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { generateCsv } from "@/lib/export/csv";
import { generateXlsx } from "@/lib/export/xlsx";
import { requireAuth } from "@/lib/middleware/auth";

/** GET /api/export?bomDraftId=...&format=csv|xlsx */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const bomDraftId = searchParams.get("bomDraftId");
  const format = searchParams.get("format") ?? "csv";

  if (!bomDraftId) {
    return NextResponse.json(
      { error: "bomDraftId parameter required" },
      { status: 400 }
    );
  }

  const [draft] = await db
    .select({
      id: bomDrafts.id,
      linesJson: bomDrafts.linesJson,
      estimateId: bomDrafts.estimateId,
      summary: bomDrafts.summary,
      customerName: intakes.customerName,
    })
    .from(bomDrafts)
    .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
    .where(and(eq(bomDrafts.id, bomDraftId), eq(intakes.tenantId, session.tenantId)))
    .limit(1);

  if (!draft) {
    return NextResponse.json(
      { error: "BoM draft not found" },
      { status: 404 }
    );
  }

  const exportOptions = {
    customerName: draft.customerName || "Customer",
    estimateId: draft.estimateId ?? bomDraftId.slice(0, 12).toUpperCase(),
    priceList: "Global Price List Emerging (USD)",
    date: new Date(),
    summary: (draft.summary as Record<string, unknown>) ?? {},
  };

  if (format === "csv") {
    const csvContent = generateCsv(
      draft.linesJson as unknown[],
      exportOptions
    );

    const bom = "\uFEFF";
    const filename = `BOMatic_Estimate_${exportOptions.estimateId}.csv`;
    return new NextResponse(bom + csvContent, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === "xlsx") {
    const xlsxBuffer = generateXlsx(
      draft.linesJson as unknown[],
      exportOptions
    );

    const filename = `BOMatic_Estimate_${exportOptions.estimateId}.xlsx`;
    return new NextResponse(new Uint8Array(xlsxBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json(
    { error: `Export format '${format}' not supported. Use: csv, xlsx` },
    { status: 400 }
  );
}
