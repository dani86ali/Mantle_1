/**
 * GET /api/estimates/[id]/compliance/export — download the compliance
 * matrix as an .xlsx file. Server-side build, no LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import { loadArtifacts } from "@/lib/db/pipeline-store";
import { requireAuth } from "@/lib/middleware/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const resolved = await resolveIntake(params.id, session.tenantId);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const { e1 } = await loadArtifacts(resolved.intakeId);
  if (!e1 || !e1.complianceMatrix) {
    return NextResponse.json(
      { error: "Compliance matrix not generated" },
      { status: 400 }
    );
  }

  const matrix = e1.complianceMatrix;
  const wb = XLSX.utils.book_new();

  const matrixRows: (string | number)[][] = [
    [
      "Req ID",
      "Requirement",
      "Framework",
      "Control ID",
      "Control Name",
      "Status",
      "Notes",
      "TP Section",
    ],
    ...matrix.rows.map((r) => [
      r.requirementId,
      r.requirementText,
      r.frameworkId,
      r.controlId,
      r.controlName,
      r.status,
      r.notes,
      r.tpSection,
    ]),
  ];
  const matrixSheet = XLSX.utils.aoa_to_sheet(matrixRows);
  matrixSheet["!cols"] = [
    { wch: 12 }, { wch: 60 }, { wch: 14 }, { wch: 14 },
    { wch: 32 }, { wch: 22 }, { wch: 40 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, matrixSheet, "Compliance Matrix");

  const gapRows: (string | number)[][] = [
    ["Framework", "Control ID", "Control Name"],
    ...matrix.gaps.coverageGaps.map((g) => [g.frameworkId, g.controlId, g.controlName]),
  ];
  const gapSheet = XLSX.utils.aoa_to_sheet(gapRows);
  gapSheet["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, gapSheet, "Coverage Gaps");

  const orphanRows: (string | number)[][] = [
    ["Req ID", "Requirement"],
    ...matrix.gaps.orphanRequirements.map((o) => [o.requirementId, o.requirementText]),
  ];
  const orphanSheet = XLSX.utils.aoa_to_sheet(orphanRows);
  orphanSheet["!cols"] = [{ wch: 12 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, orphanSheet, "Orphan Requirements");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `Compliance_Matrix_${resolved.customerName.replace(/[^\w-]+/g, "_")}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function resolveIntake(
  id: string,
  tenantId: string,
): Promise<{ intakeId: string; customerName: string } | null> {
  const [draft] = await db
    .select({ intakeId: bomDrafts.intakeId, customerName: intakes.customerName })
    .from(bomDrafts)
    .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
    .where(and(eq(bomDrafts.id, id), eq(intakes.tenantId, tenantId)))
    .limit(1);
  if (draft) return { intakeId: draft.intakeId, customerName: draft.customerName ?? "estimate" };

  const [intake] = await db
    .select({ id: intakes.id, customerName: intakes.customerName })
    .from(intakes)
    .where(and(eq(intakes.id, id), eq(intakes.tenantId, tenantId)))
    .limit(1);
  if (intake) return { intakeId: intake.id, customerName: intake.customerName ?? "estimate" };

  return null;
}
