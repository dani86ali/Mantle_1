/**
 * PATCH /api/estimates/[id]/compliance — apply human edits (status/notes)
 * to the stored compliance matrix rows for an estimate (bomDraft or intake).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { validateBody } from "@/lib/middleware/validate";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import { loadArtifacts, saveE1Artifacts } from "@/lib/db/pipeline-store";
import { requireAuth } from "@/lib/middleware/auth";
import type { E1Output } from "@/engines/e1/orchestrator";
import type {
  ComplianceStatus,
  MatrixRow,
} from "@/engines/e1/compliance-matrix";

const STATUS = z.enum([
  "Compliant",
  "Partially Compliant",
  "Non-Compliant",
  "Alternative Proposed",
]);

const patchSchema = z.object({
  edits: z.record(
    z.string(),
    z.object({ status: STATUS, notes: z.string().max(2000) })
  ),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, patchSchema);
  if (data instanceof NextResponse) return data;

  const intakeId = await resolveIntakeId(params.id, session.tenantId);
  if (!intakeId) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const { e1 } = await loadArtifacts(intakeId);
  if (!e1 || !e1.complianceMatrix) {
    return NextResponse.json(
      { error: "Compliance matrix not generated for this estimate" },
      { status: 400 }
    );
  }

  const updatedRows: MatrixRow[] = e1.complianceMatrix.rows.map((r) => {
    const key = `${r.requirementId}#${r.frameworkId}#${r.controlId}`;
    const patch = data.edits[key];
    if (!patch) return r;
    return { ...r, status: patch.status as ComplianceStatus, notes: patch.notes };
  });

  const stats = {
    total: updatedRows.length,
    compliant: updatedRows.filter((r) => r.status === "Compliant").length,
    partial: updatedRows.filter((r) => r.status === "Partially Compliant").length,
    nonCompliant: updatedRows.filter((r) => r.status === "Non-Compliant").length,
    alternative: updatedRows.filter((r) => r.status === "Alternative Proposed").length,
  };

  const next: E1Output = {
    ...e1,
    complianceMatrix: {
      ...e1.complianceMatrix,
      rows: updatedRows,
      stats,
    },
  };

  await saveE1Artifacts(intakeId, next);

  return NextResponse.json({ ok: true, stats, count: Object.keys(data.edits).length });
}

async function resolveIntakeId(
  id: string,
  tenantId: string,
): Promise<string | null> {
  const [draft] = await db
    .select({ intakeId: bomDrafts.intakeId })
    .from(bomDrafts)
    .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
    .where(and(eq(bomDrafts.id, id), eq(intakes.tenantId, tenantId)))
    .limit(1);
  if (draft?.intakeId) return draft.intakeId;

  const [intake] = await db
    .select({ id: intakes.id })
    .from(intakes)
    .where(and(eq(intakes.id, id), eq(intakes.tenantId, tenantId)))
    .limit(1);
  return intake?.id ?? null;
}
