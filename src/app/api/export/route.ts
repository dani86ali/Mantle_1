import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { getBomDraftById, createExport } from "@/lib/db/queries";
import { appendAuditLog } from "@/lib/db/queries";
import { generateCsv } from "@/lib/export/csv";
import { generateXlsx } from "@/lib/export/xlsx";

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

  const draft = await getBomDraftById(session.tenantId, bomDraftId);
  if (!draft) {
    return NextResponse.json(
      { error: "BoM draft not found" },
      { status: 404 }
    );
  }

  if (format === "csv") {
    const csvContent = generateCsv(
      draft.linesJson as unknown[],
      {
        customerName: "", // Would come from intake
        estimateId: draft.estimateId ?? "",
        priceList: "Global Price List Emerging (USD)",
        date: new Date(),
        summary: draft.summary as Record<string, unknown>,
      }
    );

    // Record export
    await createExport({
      tenantId: session.tenantId,
      bomDraftId,
      type: "csv",
      destination: "download",
    });

    await appendAuditLog(session.tenantId, "export:csv", session.userId, {
      bomDraftId,
    });

    // UTF-8 with BOM for Excel compatibility
    const bom = "\uFEFF";
    return new NextResponse(bom + csvContent, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="BOMatic_Estimate_${draft.estimateId ?? bomDraftId}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const xlsxBuffer = generateXlsx(
      draft.linesJson as unknown[],
      {
        customerName: "",
        estimateId: draft.estimateId ?? "",
        priceList: "Global Price List Emerging (USD)",
        date: new Date(),
        summary: draft.summary as Record<string, unknown>,
      }
    );

    await createExport({
      tenantId: session.tenantId,
      bomDraftId,
      type: "csv",
      destination: "download",
    });

    await appendAuditLog(session.tenantId, "export:xlsx", session.userId, {
      bomDraftId,
    });

    const filename = `BOMatic_Estimate_${draft.estimateId ?? bomDraftId}.xlsx`;

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
