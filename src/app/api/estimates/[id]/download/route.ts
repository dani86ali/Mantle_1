/**
 * GET /api/estimates/[id]/download?artifact=bom|compliance|proposal|financial
 * Streams a generated artifact back to the browser. xlsx artifacts are
 * regenerated server-side from stored E1/E2 outputs; docx/xlsx artifacts
 * already written to disk by E3 are streamed from their stored path.
 */

import { NextRequest, NextResponse } from "next/server";
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
import { requireAuth } from "@/lib/middleware/auth";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface Resolved {
  intakeId: string;
  customerName: string;
  country: string;
  estimateId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const artifact = new URL(request.url).searchParams.get("artifact");
  if (!artifact) {
    return NextResponse.json(
      { error: "Missing ?artifact parameter" },
      { status: 400 }
    );
  }
  const resolved = await resolveIntake(params.id, session.tenantId);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  try {
    const { e1, e2, e3 } = await loadArtifacts(resolved.intakeId);
    if (artifact === "bom") return await downloadBom(resolved, e2);
    if (artifact === "compliance") return await downloadCompliance(resolved, e1);
    if (artifact === "proposal") return await streamFile(e3?.proposalPath, DOCX_MIME);
    if (artifact === "financial") return await streamFile(e3?.financialPath, XLSX_MIME);
    return NextResponse.json(
      { error: `Unknown artifact: ${artifact}` },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function downloadBom(
  resolved: Resolved,
  e2: Awaited<ReturnType<typeof loadArtifacts>>["e2"]
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
    path
  );
  const filename = `BoM_${slug(resolved.customerName)}.xlsx`;
  return await respondWithFile(path, XLSX_MIME, filename);
}

async function downloadCompliance(
  resolved: Resolved,
  e1: Awaited<ReturnType<typeof loadArtifacts>>["e1"]
): Promise<NextResponse> {
  if (!e1 || !e1.complianceMatrix) {
    return NextResponse.json(
      { error: "Compliance matrix not generated" },
      { status: 400 }
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
    path
  );
  const filename = `Compliance_Matrix_${slug(resolved.customerName)}.xlsx`;
  return await respondWithFile(path, XLSX_MIME, filename);
}

async function streamFile(
  path: string | undefined,
  mime: string
): Promise<NextResponse> {
  if (!path) {
    return NextResponse.json(
      { error: "Artifact not generated" },
      { status: 400 }
    );
  }
  return await respondWithFile(path, mime, basename(path));
}

async function respondWithFile(
  path: string,
  mime: string,
  filename: string
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

async function resolveIntake(
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
