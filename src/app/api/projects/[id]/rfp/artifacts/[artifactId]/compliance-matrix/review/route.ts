/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/review.
 *
 * Records an approve/reject decision for the exact compliance_matrix artifact
 * named in the URL. The request body supplies only { decision, note? };
 * session tenant/user and route params are the only authority.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { reviewRfpComplianceMatrixArtifact } from "@/lib/projects/project-rfp-compliance-matrix-approval";

interface ParsedReviewBody {
  decision: "approved" | "rejected";
  note?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_compliance_matrix_review_request",
      error: "decision is required.",
    },
    { status: 400 }
  );
}

function parseReviewBody(body: unknown): ParsedReviewBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (record.decision !== "approved" && record.decision !== "rejected") {
    return null;
  }
  return {
    decision: record.decision,
    ...(typeof record.note === "string" ? { note: record.note } : {}),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  const parsed = parseReviewBody(body);
  if (parsed === null) return invalidRequest();

  try {
    const result = await reviewRfpComplianceMatrixArtifact({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: params.artifactId,
      decision: parsed.decision,
      decidedBy: session.userId,
      ...(parsed.note !== undefined ? { note: parsed.note } : {}),
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
          error: "Artifact is not a reviewable compliance_matrix artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_reviewable") {
      return NextResponse.json(
        {
          code: "compliance_matrix_artifact_not_reviewable",
          error: "Compliance matrix artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "approval_failed") {
      return NextResponse.json(
        {
          code: "compliance_matrix_review_failed",
          error: "Compliance matrix review could not be recorded.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        approval: result.approval,
        artifactStatus: result.artifactStatus,
        stageStatus: result.stageStatus,
        artifact: result.artifact,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "compliance_matrix_review_failed",
        error: "Unable to review compliance matrix.",
      },
      { status: 500 }
    );
  }
}
