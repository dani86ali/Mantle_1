/**
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/export -
 * download the standard four-column CSV of one already-APPROVED RFP
 * compliance_matrix artifact. This is projection/serve ONLY: it builds, mutates,
 * re-decides, and approves nothing.
 *
 * GET only. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route params id/artifactId are the only project / artifact
 * authority. The request body and query string are NEVER read - this route accepts
 * no caller-supplied authority. The service result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), compliance_matrix_not_found -> 404 compliance_matrix_artifact_not_found,
 * artifact_not_compliance_matrix -> 409, compliance_matrix_not_approved -> 409
 * compliance_matrix_artifact_not_approved, invalid_payload -> 409
 * compliance_matrix_invalid_payload, no_exportable_rows -> 409
 * compliance_matrix_no_exportable_rows, ok -> 200 with the CSV bytes (attachment,
 * no-store, content length). An unexpected service error maps to a controlled 500
 * (rfp_compliance_matrix_export_failed) that never exposes the thrown error. Imports
 * only Next.js server primitives, requireAuth, and the CSV export service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { exportRfpComplianceMatrixCsv } from "@/lib/projects/project-rfp-compliance-matrix-export";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await exportRfpComplianceMatrixCsv({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: params.artifactId,
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
    if (result.status === "compliance_matrix_not_found") {
      return NextResponse.json(
        {
          code: "compliance_matrix_artifact_not_found",
          error: "Compliance matrix artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_compliance_matrix") {
      return NextResponse.json(
        {
          code: "artifact_not_compliance_matrix",
          error: "Artifact is not a compliance_matrix artifact.",
        },
        { status: 409 }
      );
    }
    if (result.status === "compliance_matrix_not_approved") {
      return NextResponse.json(
        {
          code: "compliance_matrix_artifact_not_approved",
          error: "Compliance matrix artifact must be approved before export.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "compliance_matrix_invalid_payload",
          error: "Compliance matrix payload is invalid.",
        },
        { status: 409 }
      );
    }
    if (result.status === "no_exportable_rows") {
      return NextResponse.json(
        {
          code: "compliance_matrix_no_exportable_rows",
          error: "Compliance matrix has no exportable rows.",
        },
        { status: 409 }
      );
    }

    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(result.contentLength),
      },
    });
  } catch {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_export_failed",
        error: "Unable to export RFP compliance matrix.",
      },
      { status: 500 }
    );
  }
}
