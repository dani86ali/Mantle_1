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
    if (result.status === "invalid_compliance_matrix_payload") {
      return NextResponse.json(
        {
          code: "compliance_matrix_payload_invalid",
          error: "Compliance matrix payload is not approval-ready.",
        },
        { status: 409 }
      );
    }
    if (result.status === "no_active_rows") {
      return NextResponse.json(
        {
          code: "compliance_matrix_no_active_rows",
          error: "Compliance matrix has no active rows to approve.",
        },
        { status: 409 }
      );
    }
    if (result.status === "rows_need_review") {
      return NextResponse.json(
        {
          code: "compliance_matrix_rows_need_review",
          error: "Some compliance rows still need a compliance decision.",
          rowIds: result.rowIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "rows_not_reviewed") {
      return NextResponse.json(
        {
          code: "compliance_matrix_rows_not_reviewed",
          error: "Some compliance rows are not marked reviewed.",
          rowIds: result.rowIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "not_applicable_reason_required") {
      return NextResponse.json(
        {
          code: "compliance_matrix_not_applicable_reason_required",
          error: "Some not-applicable rows are missing a reason.",
          rowIds: result.rowIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "removed_reason_required") {
      return NextResponse.json(
        {
          code: "compliance_matrix_removed_reason_required",
          error: "Some removed rows are missing a reason.",
          rowIds: result.rowIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "missing_source_configuration") {
      return NextResponse.json(
        {
          code: "compliance_matrix_source_configuration_missing",
          error:
            "Compliance matrix has no source configuration and cannot be approved under the configuration gate.",
        },
        { status: 409 }
      );
    }
    if (result.status === "configuration_gate_unsatisfied") {
      return NextResponse.json(
        {
          code: "compliance_matrix_configuration_gate_unsatisfied",
          error:
            "The RFP configuration gate is not satisfied for this compliance matrix.",
          gateStatus: result.gateStatus,
          gateMessage: result.gateMessage,
        },
        { status: 409 }
      );
    }
    if (result.status === "configuration_gate_mismatch") {
      return NextResponse.json(
        {
          code: "compliance_matrix_configuration_gate_mismatch",
          error:
            "This compliance matrix was drafted from a configuration that is no longer the gate-authorized one.",
          authorizedConfigurationExpansionArtifactId:
            result.authorizedConfigurationExpansionArtifactId,
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
