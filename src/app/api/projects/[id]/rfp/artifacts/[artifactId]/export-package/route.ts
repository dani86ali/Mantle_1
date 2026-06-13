/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/export-package - create a
 * Mantle `export_package` artifact (status needs_review) from one already-approved RFP
 * `priced_boq` artifact. This is export package CREATION only - not download/serve and
 * not export approval. The workbook output path is generated server-side by the wrapper
 * service.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route params id/artifactId are the only project / source priced_boq
 * artifact authority. The request body is NEVER read - this route accepts no
 * body-supplied authority (no tenantId, projectId, artifactId, pricedBoqArtifactId,
 * outputPath, filePath, category map, pricing/config, decidedBy, or export approval
 * field). The service result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary),
 * priced_boq_not_found -> 404 priced_boq_artifact_not_found, artifact_not_priced_boq ->
 * 409, priced_boq_not_approved -> 409 priced_boq_artifact_not_approved,
 * invalid_priced_boq_payload -> 409, export_workbook_failed -> 500 (a server-side
 * workbook fault, distinct from the catch-all), ok -> 200 with { artifact,
 * payloadSummary, exportSummary }. An unexpected service error maps to a controlled 500
 * (rfp_boq_export_package_failed) that never exposes the thrown error. Imports only
 * Next.js server primitives, requireAuth, and the RFP BoQ export wrapper service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createProjectRfpBoqExportPackage } from "@/lib/projects/project-rfp-boq-export";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await createProjectRfpBoqExportPackage({
      tenantId: session.tenantId,
      projectId: params.id,
      pricedBoqArtifactId: params.artifactId,
    });

    if (result.status === "not_found") {
      return NextResponse.json(
        { code: "project_not_found", error: "Project not found." },
        { status: 404 }
      );
    }
    if (result.status === "wrong_mode") {
      return NextResponse.json(
        {
          code: "wrong_project_mode",
          error: "Project is not an RFP project.",
          project: result.project,
        },
        { status: 409 }
      );
    }
    if (result.status === "priced_boq_not_found") {
      return NextResponse.json(
        {
          code: "priced_boq_artifact_not_found",
          error: "Priced BoQ artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_priced_boq") {
      return NextResponse.json(
        {
          code: "artifact_not_priced_boq",
          error: "Artifact is not a priced_boq artifact.",
        },
        { status: 409 }
      );
    }
    if (result.status === "priced_boq_not_approved") {
      return NextResponse.json(
        {
          code: "priced_boq_artifact_not_approved",
          error: "Priced BoQ artifact must be approved before export.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_priced_boq_payload") {
      return NextResponse.json(
        {
          code: "invalid_priced_boq_payload",
          error: "Priced BoQ artifact payload is invalid.",
        },
        { status: 409 }
      );
    }
    if (result.status === "export_workbook_failed") {
      return NextResponse.json(
        {
          code: "export_workbook_failed",
          error: "Unable to generate the export workbook.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
        exportSummary: result.exportSummary,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_boq_export_package_failed",
        error: "Unable to create RFP BoQ export package.",
      },
      { status: 500 }
    );
  }
}
