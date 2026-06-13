/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/review.
 *
 * Records engineer review decisions for the pending candidates of the EXACT
 * needs_review extraction_delta artifact named in the URL by delegating to the
 * deterministic extraction-delta review persistence service, which creates one
 * new extraction_delta version carrying the decided candidate statuses. This
 * route is a transport adapter only: it never reads file contents, parses
 * documents, extracts, builds or rereads evidence, applies accepted deltas into
 * final evidence, approves the final evidence_package, generates requirements/
 * compliance/HLD/proposal, prices, resolves SKUs, expands configuration,
 * exports, looks up a catalog, runs the runner, or calls AI.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority,
 * session.userId is the only reviewedBy authority, and the route params
 * id/artifactId are the only project / extraction_delta artifact authority. The
 * request body supplies ONLY { decisions }, an array; each decision is
 * sanitized to candidateId (when string), action (when string), note (when
 * string), and editedFields (when a non-null non-array object) before reaching
 * the service. Every other field in the body or in a decision - tenant,
 * project, artifact, reviewedBy, decidedAt, status, source ids, payload,
 * candidates, top-level proposedEvidence, evidence, pricing, SKU, config,
 * export, approval - is dropped (editedFields is forwarded whole and the
 * service whitelists its contents). A missing/malformed body or a non-array
 * decisions yields 400 invalid_rfp_extraction_delta_review_request with the
 * error "decisions must be an array."
 *
 * Per-decision shape validation stays in the service: when it throws a
 * deterministic per-decision validation error (message prefixed
 * "decisions[<index>]") the route surfaces it as the same 400
 * invalid_rfp_extraction_delta_review_request with the thrown message as the
 * error (those messages carry no secrets); any other throw is an unexpected
 * failure mapped to a controlled 500 (rfp_extraction_delta_review_failed) that
 * never exposes the thrown error.
 *
 * The service result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary),
 * extraction_delta_not_found -> 404 extraction_delta_artifact_not_found,
 * artifact_not_extraction_delta -> 409 artifact_not_extraction_delta (with the
 * artifact summary), extraction_delta_not_reviewable -> 409
 * extraction_delta_artifact_not_reviewable (with the artifact summary),
 * invalid_extraction_delta_payload -> 422 rfp_extraction_delta_invalid_payload
 * (with the artifact summary), duplicate_decision -> 409
 * rfp_extraction_delta_duplicate_decision (with candidateIds),
 * decision_target_not_found -> 409
 * rfp_extraction_delta_decision_target_not_found (with candidateIds),
 * candidate_not_pending -> 409 rfp_extraction_delta_candidate_not_pending (with
 * candidateIds), waiver_note_required -> 400
 * rfp_extraction_delta_waiver_note_required (with candidateIds), invalid_edit
 * -> 400 rfp_extraction_delta_invalid_edit (with edits), ok -> 200 with
 * { artifact, payloadSummary } only (no status discriminator, no tenantId, no
 * candidate or proposal bodies). Imports only Next.js server primitives,
 * requireAuth, and the extraction-delta review service. POST is the only
 * exported method.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  reviewRfpExtractionDeltaArtifact,
  type RfpExtractionDeltaReviewDecisionInput,
} from "@/lib/projects/project-rfp-extraction-delta-review";

const INVALID_REQUEST_CODE = "invalid_rfp_extraction_delta_review_request";
const INVALID_REQUEST_ERROR = "decisions must be an array.";

/**
 * One decision forwarded to the service. Every field is optional because the
 * service owns per-decision shape validation; the route only narrows by type.
 * editedFields is forwarded whole (the service whitelists its contents), so a
 * proposedEvidence may travel inside it but never as a top-level decision field.
 */
interface SanitizedReviewDecision {
  candidateId?: string;
  action?: string;
  note?: string;
  editedFields?: Record<string, unknown>;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Sanitize one raw decision to the narrow forwarded shape: candidateId/action/
 * note only when strings, editedFields only when a non-null non-array object. A
 * non-object raw item becomes {} so the service reports the missing candidateId.
 * No authority or content field (tenant/project/artifact/reviewedBy/status/
 * source/payload/candidates/evidence/pricing/SKU/config/export, or a top-level
 * proposedEvidence) ever survives.
 */
function sanitizeReviewDecision(raw: unknown): SanitizedReviewDecision {
  const record = isNonArrayObject(raw) ? raw : {};
  const sanitized: SanitizedReviewDecision = {};
  if (typeof record.candidateId === "string") {
    sanitized.candidateId = record.candidateId;
  }
  if (typeof record.action === "string") {
    sanitized.action = record.action;
  }
  if (typeof record.note === "string") {
    sanitized.note = record.note;
  }
  if (isNonArrayObject(record.editedFields)) {
    sanitized.editedFields = record.editedFields;
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
 * True for a deterministic per-decision shape validation throw from the service
 * (message prefixed "decisions[<index>]"). Those messages name the offending
 * decision index/field only and carry no secrets, so they are surfaced verbatim
 * as a 400; every other throw is an unexpected failure mapped to a 500.
 */
function isDecisionValidationError(error: unknown): error is Error {
  return error instanceof Error && /^decisions\[\d+\]/.test(error.message);
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
  if (!isNonArrayObject(body) || !Array.isArray(body.decisions)) {
    return invalidRequest(INVALID_REQUEST_ERROR);
  }
  const sanitizedDecisions = body.decisions.map(sanitizeReviewDecision);

  try {
    const result = await reviewRfpExtractionDeltaArtifact({
      tenantId: session.tenantId,
      projectId: params.id,
      extractionDeltaArtifactId: params.artifactId,
      reviewedBy: session.userId,
      // The forwarded shape is sanitized but unvalidated; per-decision shape
      // validation is the service's job, so this crosses the seam as-is.
      decisions: sanitizedDecisions as unknown as RfpExtractionDeltaReviewDecisionInput[],
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
    if (result.status === "extraction_delta_not_found") {
      return NextResponse.json(
        {
          code: "extraction_delta_artifact_not_found",
          error: "Extraction delta artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_extraction_delta") {
      return NextResponse.json(
        {
          code: "artifact_not_extraction_delta",
          error: "Artifact is not a reviewable extraction_delta artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "extraction_delta_not_reviewable") {
      return NextResponse.json(
        {
          code: "extraction_delta_artifact_not_reviewable",
          error: "Extraction delta artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_extraction_delta_payload") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_invalid_payload",
          error: "Extraction delta payload is invalid.",
          artifact: result.artifact,
        },
        { status: 422 }
      );
    }
    if (result.status === "duplicate_decision") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_duplicate_decision",
          error:
            "Extraction delta review has a duplicate decision for a candidateId.",
          candidateIds: result.candidateIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "decision_target_not_found") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_decision_target_not_found",
          error:
            "Extraction delta review decision references an unknown candidateId.",
          candidateIds: result.candidateIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "candidate_not_pending") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_candidate_not_pending",
          error:
            "One or more extraction delta candidates are no longer pending review.",
          candidateIds: result.candidateIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "waiver_note_required") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_waiver_note_required",
          error: "A waive decision requires a nonblank note.",
          candidateIds: result.candidateIds,
        },
        { status: 400 }
      );
    }
    if (result.status === "invalid_edit") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_invalid_edit",
          error: "One or more extraction delta edit decisions are invalid.",
          edits: result.edits,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
      },
      { status: 200 }
    );
  } catch (error) {
    if (isDecisionValidationError(error)) {
      return invalidRequest(error.message);
    }
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_review_failed",
        error: "Unable to review extraction delta.",
      },
      { status: 500 }
    );
  }
}
