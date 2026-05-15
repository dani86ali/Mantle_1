/**
 * Shared helpers for /api/estimates/[id]/download. Keeps route.ts ≤ 200 lines.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import { tmpdir } from "os";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import { loadArtifacts } from "@/lib/db/pipeline-store";
import { writeBoMExport, type BoMExportLine } from "@/lib/io/excel-writer";
import { writeComplianceMatrix } from "@/lib/io/compliance-matrix-writer";

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface Resolved {
  intakeId: string;
  customerName: string;
  country: string;
  estimateId: string;
}

export async function downloadBom(
  resolved: Resolved,
  e2: Awaited<ReturnType<typeof loadArtifacts>>["e2"],
): Promise<NextResponse> {
  if (!e2 || !e2.bom?.length) {
    return NextResponse.json({ error: "BoM not generated" }, { status: 400 });
  }
  const lines: BoMExportLine[] = e2.bom.map((p) => ({
    sku: p.sku,
    description: p.description,
    qty: p.qty,
    category: p.category,
    unitListPrice: p.unitListSar,
    unitSellPrice: p.unitSellPrice,
    extendedSell: p.extendedSell,
    currency: "SAR",
  }));
  const path = join(tmpdir(), `bom-${randomUUID()}.xlsx`);
  await writeBoMExport(
    lines,
    {
      customerName: resolved.customerName,
      estimateId: resolved.estimateId,
      date: new Date().toISOString().slice(0, 10),
      country: resolved.country,
    },
    path,
  );
  return await respondWithFile(path, XLSX_MIME, `BoM_${slug(resolved.customerName)}.xlsx`);
}

export async function downloadCompliance(
  resolved: Resolved,
  e1: Awaited<ReturnType<typeof loadArtifacts>>["e1"],
): Promise<NextResponse> {
  if (!e1 || !e1.complianceMatrix) {
    return NextResponse.json(
      { error: "Compliance matrix not generated" },
      { status: 400 },
    );
  }
  const path = join(tmpdir(), `compliance-${randomUUID()}.xlsx`);
  await writeComplianceMatrix(
    e1.complianceMatrix,
    {
      customerName: resolved.customerName,
      projectName: resolved.estimateId,
      date: new Date().toISOString().slice(0, 10),
      frameworks: (e1.frameworks ?? []).map((f) => f.id),
    },
    path,
  );
  return await respondWithFile(
    path,
    XLSX_MIME,
    `Compliance_Matrix_${slug(resolved.customerName)}.xlsx`,
  );
}

export async function streamFile(
  path: string | undefined,
  mime: string,
  filename?: string,
): Promise<NextResponse> {
  if (!path) {
    return NextResponse.json({ error: "Artifact not generated" }, { status: 400 });
  }
  return await respondWithFile(path, mime, filename ?? basename(path));
}

export function streamString(
  body: string | undefined,
  mime: string,
  filename: string,
): NextResponse {
  if (!body) {
    return NextResponse.json({ error: "Artifact not generated" }, { status: 400 });
  }
  return new NextResponse(body, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function respondWithFile(
  path: string,
  mime: string,
  filename: string,
): Promise<NextResponse> {
  const buf = await readFile(path);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function slug(s: string): string {
  return s.replace(/[^\w-]+/g, "_");
}

export async function resolveIntake(
  id: string,
  tenantId: string,
): Promise<Resolved | null> {
  const [draft] = await db
    .select({
      intakeId: bomDrafts.intakeId,
      estimateId: bomDrafts.estimateId,
      customerName: intakes.customerName,
      country: intakes.country,
    })
    .from(bomDrafts)
    .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
    .where(and(eq(bomDrafts.id, id), eq(intakes.tenantId, tenantId)))
    .limit(1);
  if (draft) {
    return {
      intakeId: draft.intakeId,
      customerName: draft.customerName ?? "estimate",
      country: draft.country ?? "KSA",
      estimateId: draft.estimateId ?? id.slice(0, 12).toUpperCase(),
    };
  }
  const [intake] = await db
    .select({
      id: intakes.id,
      customerName: intakes.customerName,
      country: intakes.country,
    })
    .from(intakes)
    .where(and(eq(intakes.id, id), eq(intakes.tenantId, tenantId)))
    .limit(1);
  if (intake) {
    return {
      intakeId: intake.id,
      customerName: intake.customerName ?? "estimate",
      country: intake.country ?? "KSA",
      estimateId: id.slice(0, 12).toUpperCase(),
    };
  }
  return null;
}
