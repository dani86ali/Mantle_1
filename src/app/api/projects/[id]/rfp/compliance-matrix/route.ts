/**
 * GET /api/projects/[id]/rfp/compliance-matrix.
 *
 * Read-only list of the Project's compliance_matrix artifact versions for
 * engineer inspection. Authenticated via requireAuth; session tenant and route
 * project id are the only authorities. The request body is never read.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpComplianceMatrixList } from "@/lib/projects/project-rfp-compliance-matrix-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpComplianceMatrixList({
      tenantId: session.tenantId,
      projectId: params.id,
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

    return NextResponse.json(
      {
        project: result.project,
        artifactCount: result.artifactCount,
        artifacts: result.artifacts,
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
