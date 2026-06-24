/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model/review.
 *
 * Records an approve/reject decision for the EXACT hld_design_model artifact named
 * in the URL (the HLD design-model review gate). This route never reads file
 * contents, parses documents, generates downstream artifacts, prices, looks up a
 * catalog, resolves SKUs or configuration, or calls AI - it only records one human
 * decision.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority,
 * session.userId is the only decidedBy authority, and the route params id/artifactId
 * are the only project/artifact authority. The request body supplies ONLY
 * { decision, note? }; any tenantId/projectId/artifactId/decidedBy/status/payload/
 * source authority fields in the body are ignored. A missing/malformed body or an
 * invalid decision yields 400 invalid_rfp_hld_design_model_review_request. Result
 * maps to HTTP: not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode (with the lean project summary), artifact_not_found -> 404
 * hld_design_model_artifact_not_found, artifact_not_hld_design_model -> 409
 * artifact_not_hld_design_model (with the artifact summary), artifact_not_reviewable
 * -> 409 hld_design_model_artifact_not_reviewable (with the artifact summary),
 * invalid_hld_design_model_payload -> 409 hld_design_model_payload_invalid (with the
 * artifact summary), stale_hld_design_model_payload -> 409
 * hld_design_model_payload_stale (with the artifact summary, the staleCode, and any
 * messages/errors), approval_failed -> 409 hld_design_model_review_failed, ok -> 200
 * with { approval, artifactStatus, stageStatus, artifact }. An unexpected service
 * error maps to a controlled 500 that never exposes the thrown error. Imports only
 * Next.js server primitives, requireAuth, and the HLD design-model approval service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { reviewRfpHldDesignModelArtifact } from "@/lib/projects/project-rfp-hld-design-model-approval";

interface ParsedReviewBody {
  decision: "approved" | "rejected";
  note?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_hld_design_model_review_request",
      error: "decision is required.",
    },
    { status: 400 }
  );
}

/**
 * Validate the request body to the minimal review shape, or null when invalid.
 * Reads ONLY decision and an optional string note - never any tenant/project/
 * artifact/decidedBy/status/payload/source authority field. A non-string note is
 * ignored rather than rejected.
 */
function parseReviewBody(body: unknown): ParsedReviewBody | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const { decision, note } = record;
  if (decision !== "approved" && decision !== "rejected") return null;
  return {
    decision,
    ...(typeof note === "string" ? { note } : {}),
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
    const result = await reviewRfpHldDesignModelArtifact({
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
          code: "hld_design_model_artifact_not_found",
          error: "HLD design model artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_hld_design_model") {
      return NextResponse.json(
        {
          code: "artifact_not_hld_design_model",
          error: "Artifact is not a reviewable hld_design_model artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_reviewable") {
      return NextResponse.json(
        {
          code: "hld_design_model_artifact_not_reviewable",
          error: "HLD design model artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_hld_design_model_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_payload_invalid",
          error: "HLD design model payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "stale_hld_design_model_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_payload_stale",
          error: "HLD design model payload is stale; redraft before approval.",
          artifact: result.artifact,
          staleCode: result.staleCode,
          ...(result.messages !== undefined ? { messages: result.messages } : {}),
          ...(result.errors !== undefined ? { errors: result.errors } : {}),
        },
        { status: 409 }
      );
    }
    if (result.status === "approval_failed") {
      return NextResponse.json(
        {
          code: "hld_design_model_review_failed",
          error: "HLD design model review could not be recorded.",
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
        code: "hld_design_model_review_failed",
        error: "Unable to review HLD design model.",
      },
      { status: 500 }
    );
  }
}
