/**
 * /api/projects/[id]/rfp/requirements-baseline/generate.
 *
 * POST - generate ONE reviewable requirements_baseline draft artifact for an
 * RFP Project by drafting candidate requirements out of ONE APPROVED final
 * evidence_package artifact and handing the sanitized candidates to the
 * baseline draft service, via the generation orchestrator. The approved final
 * evidence_package is the only RFP evidence authority requirements generation
 * may build on: raw persisted ProjectEvidence ids are no longer accepted by
 * this route. This route is the seam where the CONFIGURED drafting executor is
 * injected: it asks the executor factory for the configured executor BEFORE
 * calling the orchestrator and, while live provider wiring remains unapproved
 * (the factory returns null), answers 503
 * rfp_requirements_candidate_drafting_unavailable without loading any evidence.
 * The generated draft is needs_review and carries no runtime authority until a
 * human approves it at requirements_baseline_review.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority, the route param is the only project id, and session.userId is the
 * only requestedBy authority. The JSON body supplies ONLY
 * { evidencePackageArtifactId }: it must be one nonblank string, else 400
 * invalid_rfp_requirements_baseline_generation_request; every other body field
 * (the now-rejected evidenceIds, tenant, project, requestedBy, createdBy,
 * status, artifact, source, approval, stage, payload, candidates, pricing,
 * SKU, configuration, export, raw content, executor, ...) is stripped and
 * never reaches the orchestrator. Trimming stays in the drafting service.
 *
 * Orchestrator results map to HTTP. A candidate-drafting block names an
 * approved-evidence_package provenance gate or an upstream executor failure:
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode
 * (with the lean project summary), evidence_package_artifact_not_found -> 409
 * rfp_requirements_baseline_evidence_package_not_found,
 * artifact_not_evidence_package -> 409
 * rfp_requirements_baseline_artifact_not_evidence_package (with the lean
 * artifact summary), evidence_package_not_approved -> 409
 * rfp_requirements_baseline_evidence_package_not_approved (with the lean
 * artifact summary), invalid_evidence_package_payload -> 409
 * rfp_requirements_baseline_invalid_evidence_package_payload (with the lean
 * artifact summary), evidence_package_empty -> 409
 * rfp_requirements_baseline_evidence_package_empty (with the lean artifact
 * summary). Executor failures are upstream failures: drafting_failed -> 502
 * rfp_requirements_candidate_drafting_failed (the thrown executor detail was
 * already swallowed by the drafting service and is never surfaced) and
 * invalid_candidate_output -> 502
 * rfp_requirements_candidate_drafting_invalid_output with the drafting
 * service's deterministic sanitizer violations.
 *
 * A baseline-creation block keeps the existing create-route evidence/provenance
 * gate codes: not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode (with the lean project summary), evidence_not_found -> 409
 * rfp_requirements_baseline_evidence_not_found (with missingEvidenceIds),
 * evidence_not_rfp_extraction -> 409
 * rfp_requirements_baseline_evidence_not_rfp_extraction (with lean evidence
 * summaries), evidence_missing_input_package -> 409
 * rfp_requirements_baseline_evidence_missing_input_package (with lean evidence
 * summaries), input_package_artifact_not_found -> 409
 * rfp_requirements_baseline_input_package_not_found (with missingArtifactIds),
 * artifact_not_input_package -> 409
 * rfp_requirements_baseline_artifact_not_input_package (with lean artifact
 * summaries), input_package_not_approved -> 409
 * rfp_requirements_baseline_input_package_not_approved (with lean artifact
 * summaries). ok -> 201 with { artifact, payloadSummary, candidateSummary }
 * where candidateSummary carries candidateCount, evidenceCount,
 * evidencePackageArtifactId, sourceFileIds, and sourceArtifactIds - never
 * candidate text, raw evidence text, table rows, or a tenantId. An unexpected
 * error maps to a controlled 500
 * (rfp_requirements_baseline_generation_failed) that never exposes the thrown
 * error.
 *
 * This route is a transport adapter only: it never touches the DB or any
 * store, parses no files, reads no raw text or storage path, creates no
 * approval, prices nothing, resolves no SKU or configuration, exports nothing,
 * and calls no AI, model, or catalog. Imports only Next.js server primitives,
 * requireAuth, the generation orchestrator, and the executor factory. POST is
 * the only exported method.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  generateRfpRequirementsBaselineDraftFromEvidencePackage,
  type RfpBaselineGenerationCreationBlockedResult,
  type RfpBaselineGenerationPackageDraftingBlockedResult,
} from "@/lib/projects/project-rfp-requirements-baseline-generation";
import {
  getConfiguredRfpRequirementCandidateDraftingExecutor,
} from "@/lib/projects/project-rfp-requirements-candidate-drafting-executor";

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_requirements_baseline_generation_request",
      error:
        "evidencePackageArtifactId must be a nonblank string naming one approved final evidence package artifact.",
    },
    { status: 400 }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validate the request body to a single nonblank evidencePackageArtifactId, or
 * null when invalid. evidencePackageArtifactId is the ONLY body field read; it
 * must be a string that is nonblank after trim. A raw evidenceIds field (or any
 * other field) is ignored entirely. Trimming stays in the drafting service, so
 * the verbatim string is returned.
 */
function parseEvidencePackageArtifactId(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const raw = body.evidencePackageArtifactId;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return raw;
}

/**
 * Map one baseline-creation gate block to the existing create-route response.
 * The creation phase re-gates the cited evidence/provenance, so its blocks keep
 * the stable create-route codes clients already know.
 */
function creationBlockResponse(
  block: RfpBaselineGenerationCreationBlockedResult
): NextResponse {
  if (block.status === "not_found") {
    return NextResponse.json(
      { code: "project_not_found", error: "Project not found." },
      { status: 404 }
    );
  }
  if (block.status === "wrong_mode") {
    return NextResponse.json(
      {
        code: "wrong_project_mode",
        error: "Project is not an RFP project.",
        project: block.project,
      },
      { status: 409 }
    );
  }
  if (block.status === "evidence_not_found") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_evidence_not_found",
        error: "One or more cited evidence items were not found.",
        missingEvidenceIds: block.missingEvidenceIds,
      },
      { status: 409 }
    );
  }
  if (block.status === "evidence_not_rfp_extraction") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_evidence_not_rfp_extraction",
        error:
          "One or more cited evidence items are not RFP extraction evidence.",
        evidence: block.evidence,
      },
      { status: 409 }
    );
  }
  if (block.status === "evidence_missing_input_package") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_evidence_missing_input_package",
        error:
          "One or more cited evidence items do not name their input package artifact.",
        evidence: block.evidence,
      },
      { status: 409 }
    );
  }
  if (block.status === "input_package_artifact_not_found") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_input_package_not_found",
        error: "One or more cited input package artifacts were not found.",
        missingArtifactIds: block.missingArtifactIds,
      },
      { status: 409 }
    );
  }
  if (block.status === "artifact_not_input_package") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_artifact_not_input_package",
        error: "One or more cited artifacts are not input package artifacts.",
        artifacts: block.artifacts,
      },
      { status: 409 }
    );
  }
  return NextResponse.json(
    {
      code: "rfp_requirements_baseline_input_package_not_approved",
      error: "One or more cited input package artifacts are not approved.",
      artifacts: block.artifacts,
    },
    { status: 409 }
  );
}

/**
 * Map one candidate-drafting block from the approved-evidence_package drafting
 * path. Executor failures map to 502 (an upstream drafting failure, never
 * client error and never internal detail); every other block is an
 * evidence_package provenance gate that maps to its own 4xx code, with
 * not_found / wrong_mode reusing the shared project codes.
 */
function draftingBlockResponse(
  drafting: RfpBaselineGenerationPackageDraftingBlockedResult
): NextResponse {
  if (drafting.status === "not_found") {
    return NextResponse.json(
      { code: "project_not_found", error: "Project not found." },
      { status: 404 }
    );
  }
  if (drafting.status === "wrong_mode") {
    return NextResponse.json(
      {
        code: "wrong_project_mode",
        error: "Project is not an RFP project.",
        project: drafting.project,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "evidence_package_artifact_not_found") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_evidence_package_not_found",
        error: "The cited evidence package artifact was not found.",
      },
      { status: 409 }
    );
  }
  if (drafting.status === "artifact_not_evidence_package") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_artifact_not_evidence_package",
        error: "The cited artifact is not an evidence package artifact.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "evidence_package_not_approved") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_evidence_package_not_approved",
        error: "The cited evidence package artifact is not approved.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "invalid_evidence_package_payload") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_invalid_evidence_package_payload",
        error: "The cited evidence package artifact payload is invalid.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "evidence_package_empty") {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_evidence_package_empty",
        error: "The cited evidence package artifact has no evidence.",
        artifact: drafting.artifact,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "drafting_failed") {
    return NextResponse.json(
      {
        code: "rfp_requirements_candidate_drafting_failed",
        error: "Candidate drafting failed.",
      },
      { status: 502 }
    );
  }
  return NextResponse.json(
    {
      code: "rfp_requirements_candidate_drafting_invalid_output",
      error: "Candidate drafting returned invalid candidate output.",
      errors: drafting.errors,
    },
    { status: 502 }
  );
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
  const evidencePackageArtifactId = parseEvidencePackageArtifactId(body);
  if (evidencePackageArtifactId === null) return invalidRequest();

  try {
    // The executor-availability gate runs BEFORE the orchestrator so no
    // evidence is loaded while candidate drafting is unconfigured.
    const executor = getConfiguredRfpRequirementCandidateDraftingExecutor();
    if (executor === null) {
      return NextResponse.json(
        {
          code: "rfp_requirements_candidate_drafting_unavailable",
          error:
            "No candidate drafting executor is configured; requirements baseline generation is unavailable.",
        },
        { status: 503 }
      );
    }

    const result =
      await generateRfpRequirementsBaselineDraftFromEvidencePackage({
        tenantId: session.tenantId,
        projectId: params.id,
        evidencePackageArtifactId,
        requestedBy: session.userId,
        executor,
      });

    if (result.status === "blocked") {
      return result.phase === "candidate_drafting"
        ? draftingBlockResponse(result.drafting)
        : creationBlockResponse(result.creation);
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
        candidateSummary: {
          candidateCount: result.candidateCount,
          evidenceCount: result.evidenceCount,
          evidencePackageArtifactId: result.evidencePackageArtifactId,
          sourceFileIds: result.sourceFileIds,
          sourceArtifactIds: result.sourceArtifactIds,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_generation_failed",
        error: "Unable to generate RFP requirements baseline draft.",
      },
      { status: 500 }
    );
  }
}
