/**
 * GET + POST /api/projects/[id]/rfp/artifacts/[artifactId]/configuration-expansion/review
 *
 * GET returns a read-only line-review projection of ONE configuration_expansion DRAFT
 * artifact via the read model loader, tenant-scoped on session.tenantId with the route
 * params as the only project/artifact authority. Loader statuses map to HTTP: not_found
 * -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode,
 * configuration_expansion_draft_not_found -> 404, artifact_not_configuration_expansion
 * -> 409, configuration_expansion_not_draft -> 409,
 * configuration_expansion_draft_not_reviewable -> 409,
 * invalid_configuration_expansion_draft_payload -> 409, ok -> 200 { review }. An
 * unexpected loader error maps to a controlled 500 that never exposes the thrown error.
 *
 * POST applies explicit per-line human accept/reject decisions to one persisted
 * configuration_expansion DRAFT artifact, persisting the reviewed/accepted (non-draft)
 * configuration_expansion artifact.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority,
 * session.userId is the only reviewedBy authority, and the route params id/artifactId
 * are the only project / source-draft-artifact authority. The request body supplies
 * ONLY the `decisions` array (an empty array is allowed because a no-expansion draft may
 * legitimately require no decisions); any tenantId/projectId/artifactId/
 * configurationExpansionDraftArtifactId/reviewedBy/reviewedAt in the body (or in
 * individual decisions) is ignored. A missing/malformed body or any invalid decision
 * yields 400 invalid_configuration_expansion_review_request. The service result maps to
 * HTTP: not_found -> 404, wrong_mode -> 409 (lean project),
 * configuration_expansion_draft_not_found -> 404, artifact_not_configuration_expansion
 * -> 409 (with artifact), configuration_expansion_not_draft -> 409 (with artifact),
 * configuration_expansion_draft_not_reviewable -> 409 (with artifact),
 * invalid_configuration_expansion_draft_payload -> 409, normalized_boq_not_found ->
 * 404, artifact_not_normalized_boq -> 409, sku_resolution_not_found -> 404,
 * artifact_not_sku_resolution -> 409, invalid_sku_resolution_payload -> 409,
 * sku_resolution_normalized_boq_mismatch -> 409, sku_resolution_not_approved -> 409,
 * rule_pack_not_approved -> 409, duplicate_decision -> 400, decision_target_not_found
 * -> 404, customer_line_decision -> 400, missing_expansion_decision -> 400,
 * invalid_decision_action -> 400, accepted_line_not_traceable -> 409, ok -> 200 with
 * { artifact, payloadSummary, reviewSummary }. An unexpected service error maps to a
 * controlled 500 that never exposes the thrown error. Imports only Next.js server
 * primitives, requireAuth, the RFP configuration-expansion review wrapper service, and
 * the read-only configuration-expansion review workspace loader (no DB, stores,
 * lower-level config-expansion helpers, pricing, export, runner, AI, catalog, engine,
 * coordinator, or adapter).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  reviewProjectRfpConfigurationExpansionDraft,
  type ConfigurationExpansionReviewDecision,
} from "@/lib/projects/project-rfp-config-expansion-review";
import { loadRfpConfigurationExpansionReviewWorkspace } from "@/lib/projects/project-rfp-config-expansion-review-workspace";

const INVALID_REQUEST_CODE = "invalid_configuration_expansion_review_request";
const INVALID_REQUEST_ERROR = "A decisions array is required.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Validate the request body and extract a sanitized decisions array, or null when
 * anything is invalid. An empty array is valid. Reads ONLY each decision's lineId/
 * action/note - never any tenant/project/artifact/reviewedBy/reviewedAt authority
 * field. lineId must be a nonblank string, action must be accept or reject, and
 * note, when present, must be a string.
 */
function parseReviewDecisions(
  body: unknown
): ConfigurationExpansionReviewDecision[] | null {
  if (!isRecord(body) || !Array.isArray(body.decisions)) return null;

  const parsed: ConfigurationExpansionReviewDecision[] = [];
  for (const raw of body.decisions) {
    if (!isRecord(raw)) return null;
    const { lineId, action, note } = raw;
    if (!isNonBlankString(lineId)) return null;
    if (action !== "accept" && action !== "reject") return null;
    if (note !== undefined && typeof note !== "string") return null;
    parsed.push({
      lineId,
      action,
      ...(note !== undefined ? { note } : {}),
    });
  }
  return parsed;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    { code: INVALID_REQUEST_CODE, error: INVALID_REQUEST_ERROR },
    { status: 400 }
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
  const decisions = parseReviewDecisions(body);
  if (decisions === null) return invalidRequest();

  try {
    const result = await reviewProjectRfpConfigurationExpansionDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      configurationExpansionDraftArtifactId: params.artifactId,
      reviewedBy: session.userId,
      decisions,
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
    if (result.status === "configuration_expansion_draft_not_found") {
      return NextResponse.json(
        {
          code: "configuration_expansion_draft_not_found",
          error: "Configuration expansion draft artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_configuration_expansion") {
      return NextResponse.json(
        {
          code: "artifact_not_configuration_expansion",
          error: "Artifact is not a configuration_expansion artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "configuration_expansion_not_draft") {
      return NextResponse.json(
        {
          code: "configuration_expansion_not_draft",
          error: "Configuration expansion artifact is not a draft.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "configuration_expansion_draft_not_reviewable") {
      return NextResponse.json(
        {
          code: "configuration_expansion_draft_not_reviewable",
          error: "Configuration expansion draft is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_configuration_expansion_draft_payload") {
      return NextResponse.json(
        {
          code: "invalid_configuration_expansion_draft_payload",
          error: "Configuration expansion draft payload is invalid.",
        },
        { status: 409 }
      );
    }
    if (result.status === "normalized_boq_not_found") {
      return NextResponse.json(
        {
          code: "normalized_boq_artifact_not_found",
          error: "Normalized BoQ artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_normalized_boq") {
      return NextResponse.json(
        {
          code: "artifact_not_normalized_boq",
          error: "Artifact is not a normalized_boq artifact.",
        },
        { status: 409 }
      );
    }
    if (result.status === "sku_resolution_not_found") {
      return NextResponse.json(
        {
          code: "sku_resolution_artifact_not_found",
          error: "SKU resolution artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_sku_resolution") {
      return NextResponse.json(
        {
          code: "artifact_not_sku_resolution",
          error: "Artifact is not a sku_resolution artifact.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_sku_resolution_payload") {
      return NextResponse.json(
        {
          code: "invalid_sku_resolution_payload",
          error: "SKU resolution artifact payload is invalid.",
        },
        { status: 409 }
      );
    }
    if (result.status === "sku_resolution_normalized_boq_mismatch") {
      return NextResponse.json(
        {
          code: "sku_resolution_normalized_boq_mismatch",
          error: "SKU resolution artifact does not match the normalized BoQ artifact.",
        },
        { status: 409 }
      );
    }
    if (result.status === "sku_resolution_not_approved") {
      return NextResponse.json(
        {
          code: "sku_resolution_artifact_not_approved",
          error: "SKU resolution artifact must be approved before configuration expansion.",
        },
        { status: 409 }
      );
    }
    if (result.status === "rule_pack_not_approved") {
      return NextResponse.json(
        {
          code: "configuration_expansion_rule_pack_not_approved",
          error: "Configuration expansion artifact requires an approved rule pack.",
        },
        { status: 409 }
      );
    }
    if (result.status === "duplicate_decision") {
      return NextResponse.json(
        {
          code: "duplicate_configuration_expansion_review_decision",
          error: "Configuration expansion review has a duplicate decision for a lineId.",
        },
        { status: 400 }
      );
    }
    if (result.status === "decision_target_not_found") {
      return NextResponse.json(
        {
          code: "configuration_expansion_review_decision_target_not_found",
          error: "Configuration expansion review decision references an unknown lineId.",
        },
        { status: 404 }
      );
    }
    if (result.status === "customer_line_decision") {
      return NextResponse.json(
        {
          code: "configuration_expansion_review_customer_line_decision",
          error: "Configuration expansion review decision must not target a customer line.",
        },
        { status: 400 }
      );
    }
    if (result.status === "missing_expansion_decision") {
      return NextResponse.json(
        {
          code: "missing_configuration_expansion_review_decision",
          error: "Configuration expansion review requires a decision for every expansion line.",
        },
        { status: 400 }
      );
    }
    if (result.status === "invalid_decision_action") {
      return NextResponse.json(
        {
          code: "invalid_configuration_expansion_review_decision_action",
          error: "Configuration expansion review decision action must be accept or reject.",
        },
        { status: 400 }
      );
    }
    if (result.status === "accepted_line_not_traceable") {
      return NextResponse.json(
        {
          code: "accepted_configuration_expansion_line_not_traceable",
          error: "Accepted configuration expansion line must carry a sourceRuleId and evidence.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
        reviewSummary: result.reviewSummary,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_configuration_expansion_review_failed",
        error: "Unable to review RFP configuration expansion draft.",
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpConfigurationExpansionReviewWorkspace(
      session.tenantId,
      params.id,
      params.artifactId
    );

    if (result.status === "not_found") {
      return NextResponse.json(
        { code: "project_not_found", error: "Project not found." },
        { status: 404 }
      );
    }
    if (result.status === "wrong_mode") {
      return NextResponse.json(
        { code: "wrong_project_mode", error: "Project is not an RFP project." },
        { status: 409 }
      );
    }
    if (result.status === "configuration_expansion_draft_not_found") {
      return NextResponse.json(
        {
          code: "configuration_expansion_draft_not_found",
          error: "Configuration expansion draft artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_configuration_expansion") {
      return NextResponse.json(
        {
          code: "artifact_not_configuration_expansion",
          error: "Artifact is not a configuration_expansion artifact.",
        },
        { status: 409 }
      );
    }
    if (result.status === "configuration_expansion_not_draft") {
      return NextResponse.json(
        {
          code: "configuration_expansion_not_draft",
          error: "Configuration expansion artifact is not a draft.",
        },
        { status: 409 }
      );
    }
    if (result.status === "configuration_expansion_draft_not_reviewable") {
      return NextResponse.json(
        {
          code: "configuration_expansion_draft_not_reviewable",
          error: "Configuration expansion draft is not reviewable.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_configuration_expansion_draft_payload") {
      return NextResponse.json(
        {
          code: "invalid_configuration_expansion_draft_payload",
          error: "Configuration expansion draft payload is invalid.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ review: result.review }, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        code: "rfp_configuration_expansion_review_load_failed",
        error: "Unable to load RFP configuration expansion review.",
      },
      { status: 500 }
    );
  }
}
