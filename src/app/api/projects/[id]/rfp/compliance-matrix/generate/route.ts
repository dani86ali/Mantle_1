/**
 * /api/projects/[id]/rfp/compliance-matrix/generate.
 *
 * POST - generate ONE needs_review compliance_matrix artifact by drafting
 * candidate rows from an approved requirements_baseline, approved final
 * evidence_package, and a required approved configuration_expansion (or the
 * approved no-BoQ/service-only exception artifact) that the current RFP
 * BoQ/configuration readiness gate authorizes. The route is
 * transport only: auth, minimal body parsing, configured-executor availability,
 * and HTTP mapping (configuration-gate blocks map to 409). It does not read stores,
 * evidence bodies, raw files, pricing, SKU/config authority, catalog, approvals,
 * exports, or provider SDKs.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  generateRfpComplianceMatrixDraft,
  type RfpComplianceMatrixGenerationCreationBlockedResult,
  type RfpComplianceMatrixGenerationDraftingBlockedResult,
} from "@/lib/projects/project-rfp-compliance-matrix-generation";
import {
  getConfiguredRfpComplianceMatrixDraftingExecutor,
} from "@/lib/projects/project-rfp-compliance-matrix-drafting-executor";

interface ParsedGenerateBody {
  requirementsBaselineArtifactId: string;
  evidencePackageArtifactId: string;
  configurationExpansionArtifactId: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_compliance_matrix_generation_request",
      error:
        "requirementsBaselineArtifactId, evidencePackageArtifactId, and configurationExpansionArtifactId must be nonblank strings.",
    },
    { status: 400 }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGenerateBody(body: unknown): ParsedGenerateBody | null {
  if (!isRecord(body)) return null;
  const requirementsBaselineArtifactId = body.requirementsBaselineArtifactId;
  const evidencePackageArtifactId = body.evidencePackageArtifactId;
  const configurationExpansionArtifactId =
    body.configurationExpansionArtifactId;
  if (
    typeof requirementsBaselineArtifactId !== "string" ||
    requirementsBaselineArtifactId.trim() === ""
  ) {
    return null;
  }
  if (
    typeof evidencePackageArtifactId !== "string" ||
    evidencePackageArtifactId.trim() === ""
  ) {
    return null;
  }
  if (
    typeof configurationExpansionArtifactId !== "string" ||
    configurationExpansionArtifactId.trim() === ""
  ) {
    return null;
  }
  return {
    requirementsBaselineArtifactId,
    evidencePackageArtifactId,
    configurationExpansionArtifactId,
  };
}

function sharedProjectBlockResponse(
  status: "not_found" | "wrong_mode",
  project?: unknown
): NextResponse {
  if (status === "not_found") {
    return NextResponse.json(
      { code: "project_not_found", error: "Project not found." },
      { status: 404 }
    );
  }
  return NextResponse.json(
    {
      code: "wrong_project_mode",
      error: "Project is not an RFP project.",
      project,
    },
    { status: 409 }
  );
}

function draftingBlockResponse(
  drafting: RfpComplianceMatrixGenerationDraftingBlockedResult
): NextResponse {
  if (drafting.status === "not_found") {
    return sharedProjectBlockResponse("not_found");
  }
  if (drafting.status === "wrong_mode") {
    return sharedProjectBlockResponse("wrong_mode", drafting.project);
  }
  if (drafting.status === "requirements_baseline_not_found") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_requirements_baseline_not_found",
        error: "The cited requirements baseline artifact was not found.",
      },
      { status: 409 }
    );
  }
  if (drafting.status === "artifact_not_requirements_baseline") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_artifact_not_requirements_baseline",
        error: "The cited artifact is not a requirements baseline artifact.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "requirements_baseline_not_approved") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_requirements_baseline_not_approved",
        error: "The cited requirements baseline artifact is not approved.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "invalid_requirements_baseline_payload") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_invalid_requirements_baseline_payload",
        error: "The cited requirements baseline artifact payload is invalid.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "evidence_package_not_found") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_evidence_package_not_found",
        error: "The cited evidence package artifact was not found.",
      },
      { status: 409 }
    );
  }
  if (drafting.status === "artifact_not_evidence_package") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_artifact_not_evidence_package",
        error: "The cited artifact is not an evidence package artifact.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "evidence_package_not_approved") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_evidence_package_not_approved",
        error: "The cited evidence package artifact is not approved.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "invalid_evidence_package_payload") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_invalid_evidence_package_payload",
        error: "The cited evidence package artifact payload is invalid.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "configuration_expansion_not_found") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_configuration_expansion_not_found",
        error: "The cited configuration expansion artifact was not found.",
      },
      { status: 409 }
    );
  }
  if (drafting.status === "artifact_not_configuration_expansion") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_artifact_not_configuration_expansion",
        error: "The cited artifact is not a configuration expansion artifact.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "configuration_expansion_not_approved") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_configuration_expansion_not_approved",
        error: "The cited configuration expansion artifact is not approved.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "invalid_configuration_expansion_payload") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_invalid_configuration_expansion_payload",
        error: "The cited configuration expansion artifact payload is invalid.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "configuration_gate_unsatisfied") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_configuration_gate_unsatisfied",
        error:
          "The RFP BoQ configuration gate is not satisfied. Approve a configuration expansion (or a no-BoQ service-only exception) for this project before generating the compliance matrix.",
        gateStatus: drafting.gateStatus,
        gateMessage: drafting.gateMessage,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "configuration_gate_mismatch") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_configuration_gate_mismatch",
        error:
          "The supplied configuration expansion artifact is not the one authorized by the current RFP BoQ configuration gate.",
        gateStatus: drafting.gateStatus,
        gateMessage: drafting.gateMessage,
        authorizedConfigurationExpansionArtifactId:
          drafting.authorizedConfigurationExpansionArtifactId,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "drafting_failed") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_drafting_failed",
        error: "Compliance matrix drafting failed.",
      },
      { status: 502 }
    );
  }
  return NextResponse.json(
    {
      code: "rfp_compliance_matrix_drafting_invalid_output",
      error: "Compliance matrix drafting returned invalid row output.",
      errors: drafting.errors,
    },
    { status: 502 }
  );
}

function creationBlockResponse(
  creation: RfpComplianceMatrixGenerationCreationBlockedResult
): NextResponse {
  if (creation.status === "not_found") {
    return sharedProjectBlockResponse("not_found");
  }
  if (creation.status === "wrong_mode") {
    return sharedProjectBlockResponse("wrong_mode", creation.project);
  }
  if (creation.status === "invalid_compliance_matrix_rows") {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_invalid_draft_rows",
        error: "Compliance matrix draft rows failed creation validation.",
        errors: creation.errors,
      },
      { status: 502 }
    );
  }
  return draftingBlockResponse(creation);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  const parsed = parseGenerateBody(body);
  if (parsed === null) return invalidRequest();

  try {
    const executor = getConfiguredRfpComplianceMatrixDraftingExecutor();
    if (executor === null) {
      return NextResponse.json(
        {
          code: "rfp_compliance_matrix_drafting_unavailable",
          error:
            "No compliance matrix drafting executor is configured; compliance matrix generation is unavailable.",
        },
        { status: 503 }
      );
    }

    const result = await generateRfpComplianceMatrixDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      requirementsBaselineArtifactId: parsed.requirementsBaselineArtifactId,
      evidencePackageArtifactId: parsed.evidencePackageArtifactId,
      configurationExpansionArtifactId:
        parsed.configurationExpansionArtifactId,
      requestedBy: session.userId,
      executor,
    });

    if (result.status === "blocked") {
      return result.phase === "compliance_drafting"
        ? draftingBlockResponse(result.drafting)
        : creationBlockResponse(result.creation);
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
        draftSummary: {
          rowCount: result.rowCount,
          requirementCount: result.requirementCount,
          evidenceCount: result.evidenceCount,
          requirementsBaselineArtifactId:
            result.requirementsBaselineArtifactId,
          evidencePackageArtifactId: result.evidencePackageArtifactId,
          configurationExpansionArtifactId:
            result.configurationExpansionArtifactId,
          sourceFileIds: result.sourceFileIds,
          sourceArtifactIds: result.sourceArtifactIds,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_compliance_matrix_generation_failed",
        error: "Unable to generate RFP compliance matrix draft.",
      },
      { status: 500 }
    );
  }
}
