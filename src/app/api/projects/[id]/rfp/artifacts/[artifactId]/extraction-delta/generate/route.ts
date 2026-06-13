/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/generate.
 *
 * Generates ONE reviewable AI-proposed extraction_delta draft against the EXACT
 * approved input_package artifact version named in the URL by handing the
 * CONFIGURED candidate-drafting executor to the extraction-delta generation
 * orchestrator. This route is the seam where that executor is injected: it asks
 * the executor factory for the configured executor BEFORE the orchestrator and,
 * while live provider wiring stays unconfigured (the factory returns null),
 * answers 503 rfp_extraction_delta_candidate_drafting_unavailable without
 * calling the orchestrator or loading any evidence. The route never invokes the
 * executor itself - the orchestrator forwards it into the drafting contract. The
 * generated draft is needs_review and carries no runtime authority until a human
 * reviews it; this route never reviews, applies, or approves a delta.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority,
 * params.id is the only project authority, params.artifactId is the only
 * inputPackageArtifactId authority, and session.userId is the only requestedBy
 * authority. No request body is read or parsed; every orchestrator input comes
 * from the session or the route params.
 *
 * Orchestrator results map to HTTP. The drafting phase and the delta-creation
 * phase return six structurally identical evidence/provenance gate statuses
 * (not_found, wrong_mode, input_package_not_found, artifact_not_input_package,
 * input_package_not_approved, input_package_has_no_source_files) mapped
 * identically through the shared helper; each phase then maps its own statuses.
 * Drafting phase: extraction_evidence_not_found -> 409
 * rfp_extraction_delta_extraction_evidence_not_found (with inputPackageArtifactId),
 * drafting_failed -> 502 rfp_extraction_delta_candidate_drafting_failed (the
 * executor detail was already swallowed by the drafting contract and is never
 * surfaced), invalid_candidate_output -> 502
 * rfp_extraction_delta_candidate_drafting_invalid_output (with the deterministic
 * sanitizer errors). Delta-creation phase:
 * candidate_source_file_not_in_package -> 422
 * rfp_extraction_delta_candidate_source_file_not_in_package (with sourceFileIds),
 * evidence_not_found -> 409 rfp_extraction_delta_evidence_not_found (with
 * missingEvidenceIds), evidence_not_rfp_extraction -> 409
 * rfp_extraction_delta_evidence_not_rfp_extraction (with evidence),
 * evidence_not_for_input_package -> 409
 * rfp_extraction_delta_evidence_not_for_input_package (with evidence). ok -> 201
 * with { artifact, payloadSummary, candidateSummary } where candidateSummary
 * carries candidateCount, evidenceCount, sourceFileIds, and sourceArtifactIds -
 * never candidates, proposed evidence, raw evidence text, table rows, executor
 * input, provider output, a tenantId, or the status discriminator. An unexpected
 * throw maps to a controlled 500 (rfp_extraction_delta_generation_failed) that
 * never exposes the thrown error.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw files, parses no documents, reads no evidence bodies/table rows/
 * storage paths, creates no approval, reviews/applies no delta, approves no
 * evidence_package, generates no requirements/compliance/HLD/proposal, prices
 * nothing, resolves no SKU or configuration, exports nothing, and calls no
 * catalog or runner. The only place a live provider can enter is through the
 * configured executor factory; the route never invokes the executor directly.
 * Imports only Next.js server primitives, requireAuth, the generation
 * orchestrator, and the executor factory. POST is the only exported method.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  generateRfpExtractionDeltaDraft,
  type RfpExtractionDeltaGenerationCreationBlockedResult,
  type RfpExtractionDeltaGenerationDraftingBlockedResult,
} from "@/lib/projects/project-rfp-extraction-delta-generation";
import {
  getConfiguredRfpExtractionDeltaCandidateDraftingExecutor,
} from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting-executor";

/**
 * The six evidence/provenance gate statuses both orchestrator phases return
 * with structurally identical shapes. Derived from the drafting blocked union;
 * the delta-creation blocked union's matching variants are structurally
 * identical, so both phases map them identically through the shared helper.
 */
type SharedGateBlockedResult = Extract<
  RfpExtractionDeltaGenerationDraftingBlockedResult,
  {
    status:
      | "not_found"
      | "wrong_mode"
      | "input_package_not_found"
      | "artifact_not_input_package"
      | "input_package_not_approved"
      | "input_package_has_no_source_files";
  }
>;

/**
 * Map one of the six shared evidence/provenance gate blocks to its HTTP
 * response. Both phases reuse this so a client sees stable codes regardless of
 * which phase tripped a shared gate.
 */
function sharedGateBlockResponse(block: SharedGateBlockedResult): NextResponse {
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
  if (block.status === "input_package_not_found") {
    return NextResponse.json(
      {
        code: "input_package_artifact_not_found",
        error: "Input package artifact not found.",
      },
      { status: 404 }
    );
  }
  if (block.status === "artifact_not_input_package") {
    return NextResponse.json(
      {
        code: "artifact_not_input_package",
        error: "Artifact is not an approved input_package artifact.",
        artifact: block.artifact,
      },
      { status: 409 }
    );
  }
  if (block.status === "input_package_not_approved") {
    return NextResponse.json(
      {
        code: "input_package_not_approved",
        error: "Input package artifact is not approved.",
        artifact: block.artifact,
      },
      { status: 409 }
    );
  }
  return NextResponse.json(
    {
      code: "input_package_has_no_source_files",
      error: "Input package has no source files.",
      artifact: block.artifact,
    },
    { status: 409 }
  );
}

/**
 * Map one candidate-drafting-phase block. Executor failures map to 502 (an
 * upstream drafting failure, never a client error and never internal detail);
 * the other drafting-only block reports the missing extraction evidence; every
 * remaining drafting block is a shared gate.
 */
function draftingBlockResponse(
  drafting: RfpExtractionDeltaGenerationDraftingBlockedResult
): NextResponse {
  if (drafting.status === "extraction_evidence_not_found") {
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_extraction_evidence_not_found",
        error:
          "No draftable RFP extraction evidence was found for the input package.",
        inputPackageArtifactId: drafting.inputPackageArtifactId,
      },
      { status: 409 }
    );
  }
  if (drafting.status === "drafting_failed") {
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_candidate_drafting_failed",
        error: "Extraction-delta candidate drafting failed.",
      },
      { status: 502 }
    );
  }
  if (drafting.status === "invalid_candidate_output") {
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_candidate_drafting_invalid_output",
        error:
          "Extraction-delta candidate drafting returned invalid candidate output.",
        errors: drafting.errors,
      },
      { status: 502 }
    );
  }
  return sharedGateBlockResponse(drafting);
}

/**
 * Map one delta-creation-phase block. The creation-only blocks report the
 * offending candidate source files or the cited evidence rows that failed
 * re-gating; every remaining creation block is a shared gate.
 */
function deltaCreationBlockResponse(
  creation: RfpExtractionDeltaGenerationCreationBlockedResult
): NextResponse {
  if (creation.status === "candidate_source_file_not_in_package") {
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_candidate_source_file_not_in_package",
        error:
          "One or more candidate source files are not in the input package.",
        sourceFileIds: creation.sourceFileIds,
      },
      { status: 422 }
    );
  }
  if (creation.status === "evidence_not_found") {
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_evidence_not_found",
        error: "One or more cited evidence rows were not found.",
        missingEvidenceIds: creation.missingEvidenceIds,
      },
      { status: 409 }
    );
  }
  if (creation.status === "evidence_not_rfp_extraction") {
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_evidence_not_rfp_extraction",
        error:
          "One or more cited evidence rows are not RFP extraction evidence.",
        evidence: creation.evidence,
      },
      { status: 409 }
    );
  }
  if (creation.status === "evidence_not_for_input_package") {
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_evidence_not_for_input_package",
        error:
          "One or more cited evidence rows are not stored for this input package.",
        evidence: creation.evidence,
      },
      { status: 409 }
    );
  }
  return sharedGateBlockResponse(creation);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    // The executor-availability gate runs BEFORE the orchestrator so no
    // evidence is loaded while candidate drafting is unconfigured.
    const executor = getConfiguredRfpExtractionDeltaCandidateDraftingExecutor();
    if (executor === null) {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_candidate_drafting_unavailable",
          error:
            "No extraction-delta candidate drafting executor is configured; extraction delta generation is unavailable.",
        },
        { status: 503 }
      );
    }

    const result = await generateRfpExtractionDeltaDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      inputPackageArtifactId: params.artifactId,
      requestedBy: session.userId,
      executor,
    });

    if (result.status === "blocked") {
      return result.phase === "candidate_drafting"
        ? draftingBlockResponse(result.drafting)
        : deltaCreationBlockResponse(result.creation);
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
        candidateSummary: {
          candidateCount: result.candidateCount,
          evidenceCount: result.evidenceCount,
          sourceFileIds: result.sourceFileIds,
          sourceArtifactIds: result.sourceArtifactIds,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_generation_failed",
        error: "Unable to generate extraction delta draft.",
      },
      { status: 500 }
    );
  }
}
