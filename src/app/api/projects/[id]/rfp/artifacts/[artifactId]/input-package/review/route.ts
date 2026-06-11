/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/input-package/review.
 *
 * Records an approve/reject decision for the EXACT input_package artifact named
 * in the URL (the Intake Package Review gate after Prompt 175 creates the draft
 * needs_review). This route never reads file contents, parses documents,
 * extracts, builds evidence, generates downstream artifacts, prices, exports,
 * looks up a catalog, runs the runner, or calls AI - it only records one human
 * decision.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority,
 * session.userId is the only decidedBy authority, and the route params
 * id/artifactId are the only project/artifact authority. The request body
 * supplies ONLY { decision, note? }; any tenantId/projectId/artifactId/
 * artifactVersion/decidedBy/decidedAt/status/sourceFileIds/payload in the body
 * is ignored. A missing/malformed body or an invalid decision yields 400
 * invalid_rfp_input_package_review_request. The service result maps to HTTP:
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode
 * (with the lean project summary), artifact_not_found -> 404
 * input_package_artifact_not_found, artifact_not_input_package -> 409
 * artifact_not_input_package (with the artifact summary),
 * artifact_not_reviewable -> 409 input_package_artifact_not_reviewable (with
 * the artifact summary), approval_failed -> 409 input_package_review_failed,
 * ok -> 200 with { approval, artifactStatus, stageStatus, artifact }. An
 * unexpected service error maps to a controlled 500
 * (input_package_review_failed) that never exposes the thrown error. Imports
 * only Next.js server primitives, requireAuth, and the input-package approval
 * service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { reviewRfpInputPackageArtifact } from "@/lib/projects/project-rfp-input-package-approval";

interface ParsedReviewBody {
  decision: "approved" | "rejected";
  note?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_input_package_review_request",
      error: "decision is required.",
    },
    { status: 400 }
  );
}

/**
 * Validate the request body to the minimal review shape, or null when invalid.
 * Reads ONLY decision and an optional string note - never any tenant/project/
 * artifact/decidedBy/decidedAt/status/source/payload authority field. A
 * non-string note is ignored (matching the priced-boq review route) rather
 * than rejected.
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
    const result = await reviewRfpInputPackageArtifact({
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
          error: "Artifact is not a reviewable input_package artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_reviewable") {
      return NextResponse.json(
        {
          code: "input_package_artifact_not_reviewable",
          error: "Input package artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "approval_failed") {
      return NextResponse.json(
        {
          code: "input_package_review_failed",
          error: "Input package review could not be recorded.",
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
        code: "input_package_review_failed",
        error: "Unable to review input package.",
      },
      { status: 500 }
    );
  }
}
