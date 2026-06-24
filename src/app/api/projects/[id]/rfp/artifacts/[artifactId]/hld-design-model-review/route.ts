/**
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model-review.
 *
 * Read-only sanitized detail of the EXACT advisory `hld_design_model_review`
 * artifact version named in the URL, for engineer inspection. This route parses
 * no documents, reads no file bytes, writes nothing, approves nothing, prices
 * nothing, resolves no SKU or configuration, looks up no catalog, runs no
 * rebuild, and calls no AI - it only invokes the read-only inspection service and
 * maps its result to HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority
 * and the route params id/artifactId are the only project/artifact authority.
 * The request body is never read. Result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), artifact_not_found -> 404
 * hld_design_model_review_artifact_not_found, artifact_not_hld_design_model_review
 * -> 409 artifact_not_hld_design_model_review (with the lean payload-free artifact
 * summary), invalid_payload -> 409 hld_design_model_review_invalid_payload (with
 * the same lean summary), ok -> 200 with { project, artifact, review }. An
 * unexpected service error maps to a controlled 500 that never exposes the thrown
 * error. Imports only Next.js server primitives, requireAuth, and the inspection
 * service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDesignModelReviewDetail } from "@/lib/projects/project-rfp-hld-design-model-review-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldDesignModelReviewDetail({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: params.artifactId,
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
          code: "hld_design_model_review_artifact_not_found",
          error: "HLD design model review artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_hld_design_model_review") {
      return NextResponse.json(
        {
          code: "artifact_not_hld_design_model_review",
          error: "Artifact is not an hld_design_model_review artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_review_invalid_payload",
          error: "HLD design model review payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        artifact: result.artifact,
        review: result.review,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_design_model_review_inspection_failed",
        error: "Unable to inspect HLD design model review.",
      },
      { status: 500 }
    );
  }
}
