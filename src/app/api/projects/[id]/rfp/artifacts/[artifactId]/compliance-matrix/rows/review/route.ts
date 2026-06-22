/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/rows/review.
 *
 * Records engineer row-level review decisions for the EXACT needs_review
 * compliance_matrix artifact named in the URL by delegating to the deterministic
 * compliance-matrix row-review persistence service, which creates ONE new
 * needs_review compliance_matrix version carrying the edited row metadata and an
 * append-only review history. This route is a transport adapter and records HUMAN
 * review data only: it never approves the artifact, creates no approval, reads no
 * file contents, parses no documents, rereads no evidence, generates no
 * compliance/HLD/TP/proposal, prices nothing, resolves no SKU, expands no
 * configuration, exports nothing, looks up no catalog, runs no runner, and calls
 * no AI. The existing compliance_matrix artifact approval route at
 * compliance-matrix/review stays separate and untouched - this route is NOT
 * artifact approval and must never create approvals.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority,
 * session.userId is the only reviewedBy authority, and the route params
 * id/artifactId are the only project / compliance_matrix artifact authority. The
 * request body supplies ONLY { decisions }, a nonempty array; each decision is
 * sanitized to rowId (when string), action (when string), reason (when string),
 * note (when string), and editedFields (when a non-null non-array object, then
 * narrowed to the editable whitelist) before reaching the service. reviewedAt is
 * never read from the body - the service defaults it. Every other field in the
 * body or in a decision - tenant/project/artifact/complianceMatrixArtifactId/
 * reviewedBy/reviewedAt/status/source ids/payload/rows/approval/pricing/SKU/
 * catalog/config/export, plus forbidden editedFields keys (id, requirementId,
 * rowReviewStatus, notApplicableReason, removedReason, reviewHistory,
 * evidenceReferences, configurationReferences, pricing/SKU/config authority) - is
 * dropped. An editedFields object whose every key is dropped is still forwarded
 * as {} so the service reports invalid_edit instead of silently dropping the edit
 * payload. A missing/malformed body, a non-object body, a non-array decisions, or
 * an empty decisions yields 400 invalid_rfp_compliance_matrix_row_review_request
 * with the error "decisions must be a nonempty array."
 *
 * Per-decision shape validation stays in the service: when it throws a
 * deterministic per-decision validation error (message prefixed
 * "decisions[<index>]") the route surfaces it as the same 400 with the thrown
 * message as the error (those messages carry no secrets); a defensive backstop
 * also maps a service throw of exactly "decisions must be a nonempty array." to
 * the same 400; any other throw is an unexpected failure mapped to a controlled
 * 500 (rfp_compliance_matrix_row_review_failed) that never exposes the thrown
 * error.
 *
 * The service result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary),
 * compliance_matrix_not_found -> 404 compliance_matrix_artifact_not_found,
 * artifact_not_compliance_matrix -> 409 artifact_not_compliance_matrix (with the
 * artifact summary), compliance_matrix_not_reviewable -> 409
 * compliance_matrix_artifact_not_reviewable (with the artifact summary),
 * invalid_compliance_matrix_payload -> 422 rfp_compliance_matrix_invalid_payload
 * (with the artifact summary), duplicate_decision -> 409
 * rfp_compliance_matrix_duplicate_decision (with rowIds), decision_target_not_found
 * -> 409 rfp_compliance_matrix_decision_target_not_found (with rowIds),
 * row_already_removed -> 409 rfp_compliance_matrix_row_already_removed (with
 * rowIds), row_not_removed -> 409 rfp_compliance_matrix_row_not_removed (with
 * rowIds), reason_required -> 400 rfp_compliance_matrix_reason_required (with
 * rowIds), invalid_edit -> 400 rfp_compliance_matrix_invalid_edit (with edits),
 * ok -> 200 with { artifact, payloadSummary } only (no status discriminator, no
 * tenantId, no row or evidence bodies, no approval data). Imports only Next.js
 * server primitives, requireAuth, and the compliance-matrix row-review service.
 * POST is the only exported method.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  reviewRfpComplianceMatrixRows,
  type RfpComplianceMatrixRowReviewDecisionInput,
} from "@/lib/projects/project-rfp-compliance-matrix-row-review";

const INVALID_REQUEST_CODE = "invalid_rfp_compliance_matrix_row_review_request";
const INVALID_REQUEST_ERROR = "decisions must be a nonempty array.";

/**
 * The only editedFields keys forwarded to the service. Every other key (identity,
 * the lifecycle status set by mark/remove/restore, locator references, history,
 * pricing/SKU/config authority) is dropped here, and the service whitelists and
 * validates what remains.
 */
const EDITABLE_FIELD_KEYS = [
  "response",
  "rationale",
  "notes",
  "complianceStatus",
  "sectionReference",
  "responseLane",
  "ownerLane",
  "hldImpact",
  "tpImpact",
  "boqConfigImpact",
  "requiresOwnerReview",
] as const;

/**
 * One decision forwarded to the service. Every field is optional because the
 * service owns per-decision shape validation; the route only narrows by type and
 * by the editable-field whitelist.
 */
interface SanitizedReviewDecision {
  rowId?: string;
  action?: string;
  reason?: string;
  note?: string;
  editedFields?: Record<string, unknown>;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Copy only the editable-whitelist keys that are present from one raw editedFields
 * object; the values cross unvalidated (the service validates each). The result
 * may be {} when every supplied key was forbidden - the caller still forwards it
 * so the service reports invalid_edit instead of silently dropping the edit.
 */
function narrowEditedFields(
  value: Record<string, unknown>
): Record<string, unknown> {
  const edits: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELD_KEYS) {
    if (value[key] !== undefined) edits[key] = value[key];
  }
  return edits;
}

/**
 * Sanitize one raw decision to the narrow forwarded shape: rowId/action/reason/
 * note only when strings, editedFields only when a non-null non-array object
 * (then narrowed to the editable whitelist). A non-object raw item becomes {} so
 * the service reports the missing rowId. No authority or content field (tenant/
 * project/artifact/reviewedBy/reviewedAt/status/source/payload/rows/approval/
 * pricing/SKU/config/export, or a forbidden editedFields key) ever survives.
 */
function sanitizeReviewDecision(raw: unknown): SanitizedReviewDecision {
  const record = isNonArrayObject(raw) ? raw : {};
  const sanitized: SanitizedReviewDecision = {};
  if (typeof record.rowId === "string") sanitized.rowId = record.rowId;
  if (typeof record.action === "string") sanitized.action = record.action;
  if (typeof record.reason === "string") sanitized.reason = record.reason;
  if (typeof record.note === "string") sanitized.note = record.note;
  if (isNonArrayObject(record.editedFields)) {
    sanitized.editedFields = narrowEditedFields(record.editedFields);
  }
  return sanitized;
}

function invalidRequest(error: string = INVALID_REQUEST_ERROR): NextResponse {
  return NextResponse.json(
    { code: INVALID_REQUEST_CODE, error },
    { status: 400 }
  );
}

/**
 * True for a deterministic per-decision shape validation throw from the service
 * (message prefixed "decisions[<index>]") or the defensive empty-decisions
 * backstop (exactly "decisions must be a nonempty array."). Those messages name
 * the offending decision index/field only and carry no secrets, so they are
 * surfaced verbatim as a 400; every other throw is mapped to a controlled 500.
 */
function isDecisionValidationError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (/^decisions\[\d+\]/.test(error.message) ||
      error.message === INVALID_REQUEST_ERROR)
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
    return invalidRequest();
  }
  if (
    !isNonArrayObject(body) ||
    !Array.isArray(body.decisions) ||
    body.decisions.length === 0
  ) {
    return invalidRequest();
  }
  const sanitizedDecisions = body.decisions.map(sanitizeReviewDecision);

  try {
    const result = await reviewRfpComplianceMatrixRows({
      tenantId: session.tenantId,
      projectId: params.id,
      complianceMatrixArtifactId: params.artifactId,
      reviewedBy: session.userId,
      // The forwarded shape is sanitized but unvalidated; per-decision shape
      // validation is the service's job, so this crosses the seam as-is.
      decisions: sanitizedDecisions as unknown as RfpComplianceMatrixRowReviewDecisionInput[],
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
          error: "Artifact is not a reviewable compliance_matrix artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "compliance_matrix_not_reviewable") {
      return NextResponse.json(
        {
          code: "compliance_matrix_artifact_not_reviewable",
          error: "Compliance matrix artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_compliance_matrix_payload") {
      return NextResponse.json(
        {
          code: "rfp_compliance_matrix_invalid_payload",
          error: "Compliance matrix payload is invalid.",
          artifact: result.artifact,
        },
        { status: 422 }
      );
    }
    if (result.status === "duplicate_decision") {
      return NextResponse.json(
        {
          code: "rfp_compliance_matrix_duplicate_decision",
          error:
            "Compliance matrix row review has a duplicate decision for a rowId.",
          rowIds: result.rowIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "decision_target_not_found") {
      return NextResponse.json(
        {
          code: "rfp_compliance_matrix_decision_target_not_found",
          error:
            "Compliance matrix row review decision references an unknown rowId.",
          rowIds: result.rowIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "row_already_removed") {
      return NextResponse.json(
        {
          code: "rfp_compliance_matrix_row_already_removed",
          error: "One or more compliance matrix rows are already removed.",
          rowIds: result.rowIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "row_not_removed") {
      return NextResponse.json(
        {
          code: "rfp_compliance_matrix_row_not_removed",
          error: "One or more compliance matrix rows are not removed.",
          rowIds: result.rowIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "reason_required") {
      return NextResponse.json(
        {
          code: "rfp_compliance_matrix_reason_required",
          error: "A mark_not_applicable or remove decision requires a reason.",
          rowIds: result.rowIds,
        },
        { status: 400 }
      );
    }
    if (result.status === "invalid_edit") {
      return NextResponse.json(
        {
          code: "rfp_compliance_matrix_invalid_edit",
          error: "One or more compliance matrix edit decisions are invalid.",
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
        code: "rfp_compliance_matrix_row_review_failed",
        error: "Unable to review compliance matrix rows.",
      },
      { status: 500 }
    );
  }
}
