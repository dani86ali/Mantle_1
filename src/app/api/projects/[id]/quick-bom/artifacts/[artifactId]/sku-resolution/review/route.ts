/**
 * GET + POST /api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/review.
 *
 * GET (Prompt 127) returns a read-only line-review projection of ONE sku_resolution
 * artifact via the read model loader, tenant-scoped on session.tenantId with the
 * route params as the only project/artifact authority. Loader statuses map to HTTP:
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode,
 * sku_resolution_not_found -> 404, artifact_not_sku_resolution -> 409,
 * invalid_sku_resolution_payload -> 409, ok -> 200 { review }. An unexpected loader
 * error maps to a controlled 500 that never exposes the thrown error.
 *
 * POST (Prompt 89) applies explicit per-line human accept/reject decisions to one
 * `needs_review` sku_resolution artifact. session.tenantId is the only tenant
 * authority, session.userId is the only decidedBy authority, and the route params
 * id/artifactId are the only project/artifact authority. The request body supplies
 * ONLY the `actions` array; any tenantId/projectId/artifactId/skuResolutionArtifactId
 * /decidedBy/decidedAt in the body (or in individual actions) is ignored. A missing/
 * malformed body or any invalid action yields 400. The service result maps to HTTP:
 * invalid_actions -> 400 (with reason), not_found -> 404, wrong_mode -> 409 (lean
 * project), sku_resolution_not_found -> 404, artifact_not_sku_resolution -> 409
 * (artifact when known), sku_resolution_not_reviewable -> 409 (with artifact),
 * invalid_sku_resolution_payload -> 409, review_action_not_reviewable -> 409,
 * accepted_sku_not_suggested -> 409, accept_deferred_not_allowed -> 409,
 * duplicate_action -> 400,
 * action_target_not_found -> 404, ok -> 200 with { artifact, payloadSummary,
 * reviewSummary }. An unexpected service error maps to a controlled 500 that never
 * exposes the thrown error. Imports only Next.js server primitives, requireAuth, the
 * Quick BoM SKU review wrapper service, and the read-only review workspace loader (no
 * DB, stores, lower-level SKU/catalog helpers, pricing, config expansion, export,
 * runner, AI, catalog, engine, coordinator, or adapter).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  reviewProjectQuickBomSkuResolutionLines,
  type QuickBomSkuResolutionReviewActionInput,
} from "@/lib/projects/project-quick-bom-sku-resolution-review";
import { loadQuickBomSkuResolutionReviewWorkspace } from "@/lib/projects/project-quick-bom-sku-resolution-review-workspace";

const INVALID_REQUEST_CODE = "invalid_sku_resolution_review_request";
const INVALID_REQUEST_ERROR = "A non-empty actions array is required.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Validate the request body and extract a sanitized, non-empty actions array, or
 * null when anything is invalid. Reads ONLY each action's decision/sourceFileId/
 * sourceRowNumber/acceptedSku/note - never any tenant/project/artifact/decidedBy/
 * decidedAt authority field. Accept requires a nonblank acceptedSku; reject must
 * not include an acceptedSku key; note, when present, must be a string.
 */
function parseReviewActions(
  body: unknown
): QuickBomSkuResolutionReviewActionInput[] | null {
  if (!isRecord(body) || !Array.isArray(body.actions) || body.actions.length === 0) {
    return null;
  }

  const parsed: QuickBomSkuResolutionReviewActionInput[] = [];
  for (const raw of body.actions) {
    if (!isRecord(raw)) return null;
    const { decision, sourceFileId, sourceRowNumber, acceptedSku, note } = raw;
    if (decision !== "accept" && decision !== "reject") return null;
    if (!isNonBlankString(sourceFileId)) return null;
    if (!isPositiveInteger(sourceRowNumber)) return null;
    if (note !== undefined && typeof note !== "string") return null;

    if (decision === "accept") {
      if (!isNonBlankString(acceptedSku)) return null;
      parsed.push({
        decision: "accept",
        sourceFileId,
        sourceRowNumber,
        acceptedSku,
        ...(note !== undefined ? { note } : {}),
      });
    } else {
      if ("acceptedSku" in raw) return null;
      parsed.push({
        decision: "reject",
        sourceFileId,
        sourceRowNumber,
        ...(note !== undefined ? { note } : {}),
      });
    }
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
  const actions = parseReviewActions(body);
  if (actions === null) return invalidRequest();

  try {
    const result = await reviewProjectQuickBomSkuResolutionLines({
      tenantId: session.tenantId,
      projectId: params.id,
      skuResolutionArtifactId: params.artifactId,
      decidedBy: session.userId,
      actions,
    });

    if (result.status === "invalid_actions") {
      return NextResponse.json(
        { code: INVALID_REQUEST_CODE, error: INVALID_REQUEST_ERROR, reason: result.reason },
        { status: 400 }
      );
    }
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
          error: "Project is not a Quick BoM project.",
          project: result.project,
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
          ...(result.artifact ? { artifact: result.artifact } : {}),
        },
        { status: 409 }
      );
    }
    if (result.status === "sku_resolution_not_reviewable") {
      return NextResponse.json(
        {
          code: "sku_resolution_artifact_not_reviewable",
          error: "SKU resolution artifact is not reviewable.",
          artifact: result.artifact,
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
    if (result.status === "review_action_not_reviewable") {
      return NextResponse.json(
        {
          code: "sku_resolution_review_action_not_reviewable",
          error: "SKU resolution decision is not reviewable.",
        },
        { status: 409 }
      );
    }
    if (result.status === "accepted_sku_not_suggested") {
      return NextResponse.json(
        {
          code: "accepted_sku_not_suggested",
          error: "Accepted SKU must match an existing suggestion.",
        },
        { status: 409 }
      );
    }
    if (result.status === "accept_deferred_not_allowed") {
      return NextResponse.json(
        {
          code: "sku_resolution_accept_deferred_not_allowed",
          error: "Deferred non-priced SKU resolution row cannot be accepted.",
        },
        { status: 409 }
      );
    }
    if (result.status === "duplicate_action") {
      return NextResponse.json(
        {
          code: "duplicate_sku_resolution_review_action",
          error: "Duplicate SKU resolution action for decision.",
        },
        { status: 400 }
      );
    }
    if (result.status === "action_target_not_found") {
      return NextResponse.json(
        {
          code: "sku_resolution_review_action_target_not_found",
          error: "SKU resolution action target was not found.",
        },
        { status: 404 }
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
        code: "quick_bom_sku_resolution_review_failed",
        error: "Unable to review Quick BoM SKU resolution lines.",
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
    const result = await loadQuickBomSkuResolutionReviewWorkspace(
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
        { code: "wrong_project_mode", error: "Project is not a Quick BoM project." },
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

    return NextResponse.json({ review: result.review }, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        code: "quick_bom_sku_resolution_review_load_failed",
        error: "Unable to load Quick BoM SKU resolution review.",
      },
      { status: 500 }
    );
  }
}
