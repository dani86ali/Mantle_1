/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta.
 *
 * Creates ONE reviewable extraction_delta draft from the EXACT approved
 * input_package artifact named in the URL and the candidate inputs the caller
 * already supplied. This route is only the transport adapter for the
 * deterministic draft service: it never runs AI, invokes the candidate-drafting
 * executor, reads file bytes, parses documents, extracts, builds or rereads
 * evidence, reviews deltas, applies accepted deltas into final evidence,
 * approves the final evidence_package, generates requirements/compliance/HLD/
 * proposal, prices, resolves SKUs, expands configuration, exports, looks up a
 * catalog, or runs the runner.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority,
 * session.userId is the only createdBy authority, and the route params
 * id/artifactId are the only project / input_package authority. The request
 * body supplies ONLY { proposalSource, candidates }: proposalSource must be one
 * of the known provenance labels and candidates must be an array (empty is
 * valid). Each candidate is narrowed to kind/sourceFileId/title/description/
 * severity (only when a string), confidence (only when a number), rationale
 * (only when a string), evidenceIds (only when an array, filtered to string
 * entries), and proposedEvidence (only when a non-null non-array object,
 * forwarded whole - the service owns proposal whitelisting). Every other field
 * in the body or in a candidate - tenant, project, artifact,
 * inputPackageArtifactId, createdBy, status, source ids, payload, reviewStatus,
 * reviewHistory, approval, pricing, SKU, config, export, compliance, HLD,
 * catalog - is dropped.
 *
 * A missing/malformed body, an invalid/missing proposalSource, or a non-array
 * candidates yields 400 invalid_rfp_extraction_delta_request with the error
 * "proposalSource must be deterministic, ai, or engineer, and candidates must
 * be an array." Per-candidate shape validation stays in the service: when it
 * throws a deterministic validation error for proposalSource/candidates/
 * candidates[<index>] the route surfaces it as the same 400 with the thrown
 * message as the error (those messages name the offending field/index only and
 * carry no secrets); any other throw - including the createdBy/projectId/
 * inputPackageArtifactId authority guards - is an unexpected failure mapped to a
 * controlled 500 (rfp_extraction_delta_failed) that never exposes the thrown
 * error.
 *
 * The service result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary),
 * input_package_not_found -> 404 input_package_artifact_not_found,
 * artifact_not_input_package -> 409 (with the artifact summary),
 * input_package_not_approved -> 409 (with the artifact summary),
 * input_package_has_no_source_files -> 409 (with the artifact summary),
 * candidate_source_file_not_in_package -> 422
 * rfp_extraction_delta_candidate_source_file_not_in_package (with sourceFileIds),
 * evidence_not_found -> 409 rfp_extraction_delta_evidence_not_found (with
 * missingEvidenceIds), evidence_not_rfp_extraction -> 409
 * rfp_extraction_delta_evidence_not_rfp_extraction (with evidence),
 * evidence_not_for_input_package -> 409
 * rfp_extraction_delta_evidence_not_for_input_package (with evidence), ok -> 201
 * with { artifact, payloadSummary } only (no status discriminator, no tenantId,
 * no candidate or proposal bodies). Imports only Next.js server primitives,
 * requireAuth, and the extraction-delta draft service. POST is the only exported
 * method.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  createRfpExtractionDeltaDraft,
  RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES,
  type RfpExtractionDeltaCandidateInput,
  type RfpExtractionDeltaProposalSource,
} from "@/lib/projects/project-rfp-extraction-delta";

const INVALID_REQUEST_CODE = "invalid_rfp_extraction_delta_request";
const INVALID_REQUEST_ERROR =
  "proposalSource must be deterministic, ai, or engineer, and candidates must be an array.";

/**
 * One candidate forwarded to the service. Every field is optional because the
 * service owns per-candidate shape validation; the route only narrows by type.
 * proposedEvidence is forwarded whole (the service whitelists its inner keys),
 * so an arbitrary proposal object may travel inside it but is never inspected
 * here.
 */
interface SanitizedCandidate {
  kind?: string;
  sourceFileId?: string;
  title?: string;
  description?: string;
  severity?: string;
  confidence?: number;
  rationale?: string;
  evidenceIds?: string[];
  proposedEvidence?: Record<string, unknown>;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True for one of the known candidate provenance labels (indexed scan). */
function isProposalSource(
  value: unknown
): value is RfpExtractionDeltaProposalSource {
  for (const source of RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES) {
    if (source === value) return true;
  }
  return false;
}

/**
 * Sanitize one raw candidate to the narrow forwarded shape: kind/sourceFileId/
 * title/description/severity only when strings, confidence only when a number,
 * rationale only when a string, evidenceIds only when an array (filtered to
 * string entries), and proposedEvidence only when a non-null non-array object
 * (forwarded whole). A non-object raw item becomes {} so the service reports the
 * missing required fields. No authority or content field (tenant/project/
 * artifact/inputPackageArtifactId/createdBy/status/source ids/payload/
 * reviewStatus/reviewHistory/approval/pricing/SKU/config/export) ever survives.
 */
function sanitizeCandidate(raw: unknown): SanitizedCandidate {
  const record = isNonArrayObject(raw) ? raw : {};
  const sanitized: SanitizedCandidate = {};
  if (typeof record.kind === "string") {
    sanitized.kind = record.kind;
  }
  if (typeof record.sourceFileId === "string") {
    sanitized.sourceFileId = record.sourceFileId;
  }
  if (typeof record.title === "string") {
    sanitized.title = record.title;
  }
  if (typeof record.description === "string") {
    sanitized.description = record.description;
  }
  if (typeof record.severity === "string") {
    sanitized.severity = record.severity;
  }
  if (typeof record.confidence === "number") {
    sanitized.confidence = record.confidence;
  }
  if (typeof record.rationale === "string") {
    sanitized.rationale = record.rationale;
  }
  if (Array.isArray(record.evidenceIds)) {
    sanitized.evidenceIds = record.evidenceIds.filter(
      (entry): entry is string => typeof entry === "string"
    );
  }
  if (isNonArrayObject(record.proposedEvidence)) {
    sanitized.proposedEvidence = record.proposedEvidence;
  }
  return sanitized;
}

function invalidRequest(error: string): NextResponse {
  return NextResponse.json(
    { code: INVALID_REQUEST_CODE, error },
    { status: 400 }
  );
}

/**
 * True for a deterministic request-shape validation throw from the service that
 * names proposalSource, candidates, or candidates[<index>]. Those messages name
 * the offending field/index only and carry no secrets, so they are surfaced
 * verbatim as a 400; the createdBy/projectId/inputPackageArtifactId authority
 * throws and every other throw are unexpected failures mapped to a 500.
 */
function isRequestValidationError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    /^(proposalSource|candidates)\b/.test(error.message)
  );
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
    return invalidRequest(INVALID_REQUEST_ERROR);
  }
  if (!isNonArrayObject(body)) {
    return invalidRequest(INVALID_REQUEST_ERROR);
  }
  const proposalSource = body.proposalSource;
  if (!isProposalSource(proposalSource) || !Array.isArray(body.candidates)) {
    return invalidRequest(INVALID_REQUEST_ERROR);
  }
  const sanitizedCandidates = body.candidates.map(sanitizeCandidate);

  try {
    const result = await createRfpExtractionDeltaDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      inputPackageArtifactId: params.artifactId,
      createdBy: session.userId,
      proposalSource,
      // The forwarded candidates are narrowed by type but unvalidated;
      // per-candidate shape validation is the service's job, so this crosses the
      // seam as-is.
      candidates:
        sanitizedCandidates as unknown as RfpExtractionDeltaCandidateInput[],
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
    if (result.status === "input_package_not_found") {
      return NextResponse.json(
        {
          code: "input_package_artifact_not_found",
          error: "Input package artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_input_package") {
      return NextResponse.json(
        {
          code: "artifact_not_input_package",
          error: "Artifact is not an approved input_package artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "input_package_not_approved") {
      return NextResponse.json(
        {
          code: "input_package_not_approved",
          error: "Input package artifact is not approved.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "input_package_has_no_source_files") {
      return NextResponse.json(
        {
          code: "input_package_has_no_source_files",
          error: "Input package has no source files.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "candidate_source_file_not_in_package") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_candidate_source_file_not_in_package",
          error: "One or more candidate source files are not in the input package.",
          sourceFileIds: result.sourceFileIds,
        },
        { status: 422 }
      );
    }
    if (result.status === "evidence_not_found") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_evidence_not_found",
          error: "One or more cited evidence rows were not found.",
          missingEvidenceIds: result.missingEvidenceIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "evidence_not_rfp_extraction") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_evidence_not_rfp_extraction",
          error: "One or more cited evidence rows are not RFP extraction evidence.",
          evidence: result.evidence,
        },
        { status: 409 }
      );
    }
    if (result.status === "evidence_not_for_input_package") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_evidence_not_for_input_package",
          error: "One or more cited evidence rows are not stored for this input package.",
          evidence: result.evidence,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
      },
      { status: 201 }
    );
  } catch (error) {
    if (isRequestValidationError(error)) {
      return invalidRequest(error.message);
    }
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_failed",
        error: "Unable to create extraction delta draft.",
      },
      { status: 500 }
    );
  }
}
