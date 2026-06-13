/**
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix.
 *
 * Read-only sanitized detail of the exact compliance_matrix artifact version
 * named in the URL. The detail contains row text and responses plus
 * locator-only references; it never reads raw files or mutates state.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpComplianceMatrixDetail } from "@/lib/projects/project-rfp-compliance-matrix-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpComplianceMatrixDetail({
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
    if (result.status === "artifact_not_found") {
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
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "compliance_matrix_invalid_payload",
          error: "Compliance matrix payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        artifact: result.artifact,
        matrix: result.matrix,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_inspection_failed",
        error: "Unable to inspect compliance matrix.",
      },
      { status: 500 }
    );
  }
}
