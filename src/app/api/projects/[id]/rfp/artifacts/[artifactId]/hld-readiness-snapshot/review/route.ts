/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/hld-readiness-snapshot/review.
 *
 * Records an approve/reject decision for the EXACT hld_readiness_snapshot
 * artifact named in the URL (the HLD readiness snapshot review gate). This
 * route never reads file contents, parses documents, generates downstream
 * artifacts, prices, looks up a catalog, resolves SKUs or configuration, or
 * calls AI - it only records one human decision.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority,
 * session.userId is the only decidedBy authority, and the route params
 * id/artifactId are the only project/artifact authority. The request body
 * supplies ONLY { decision, note? }; any tenantId/projectId/artifactId/
 * decidedBy/status/payload fields in the body are ignored. A missing/malformed
 * body or an invalid decision yields 400
 * invalid_rfp_hld_readiness_snapshot_review_request. Result maps to HTTP:
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode
 * (with the lean project summary), artifact_not_found -> 404
 * hld_readiness_snapshot_artifact_not_found, artifact_not_hld_readiness_snapshot
 * -> 409 artifact_not_hld_readiness_snapshot (with the artifact summary),
 * artifact_not_reviewable -> 409 hld_readiness_snapshot_artifact_not_reviewable
 * (with the artifact summary), invalid_hld_readiness_snapshot_payload -> 409
 * hld_readiness_snapshot_payload_invalid (with the artifact summary),
 * approval_failed -> 409 hld_readiness_snapshot_review_failed, ok -> 200 with
 * { approval, artifactStatus, stageStatus, artifact }. An unexpected service
 * error maps to a controlled 500 that never exposes the thrown error. Imports
 * only Next.js server primitives, requireAuth, and the HLD readiness snapshot
 * approval service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { reviewRfpHldReadinessSnapshotArtifact } from "@/lib/projects/project-rfp-hld-readiness-snapshot-approval";

interface ParsedReviewBody {
  decision: "approved" | "rejected";
  note?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_hld_readiness_snapshot_review_request",
      error: "decision is required.",
    },
    { status: 400 }
  );
}

/**
 * Validate the request body to the minimal review shape, or null when invalid.
 * Reads ONLY decision and an optional string note - never any tenant/project/
 * artifact/decidedBy/status/payload authority field. A non-string note is
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
    const result = await reviewRfpHldReadinessSnapshotArtifact({
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
          code: "hld_readiness_snapshot_artifact_not_found",
          error: "HLD readiness snapshot artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_hld_readiness_snapshot") {
      return NextResponse.json(
        {
          code: "artifact_not_hld_readiness_snapshot",
          error: "Artifact is not a reviewable hld_readiness_snapshot artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_reviewable") {
      return NextResponse.json(
        {
          code: "hld_readiness_snapshot_artifact_not_reviewable",
          error: "HLD readiness snapshot artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_hld_readiness_snapshot_payload") {
      return NextResponse.json(
        {
          code: "hld_readiness_snapshot_payload_invalid",
          error: "HLD readiness snapshot payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "approval_failed") {
      return NextResponse.json(
        {
          code: "hld_readiness_snapshot_review_failed",
          error: "HLD readiness snapshot review could not be recorded.",
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
        code: "hld_readiness_snapshot_review_failed",
        error: "Unable to review HLD readiness snapshot.",
      },
      { status: 500 }
    );
  }
}
