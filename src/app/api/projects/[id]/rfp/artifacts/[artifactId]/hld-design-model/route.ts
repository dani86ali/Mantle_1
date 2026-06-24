/**
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model.
 *
 * Read-only sanitized detail of the EXACT hld_design_model artifact version named
 * in the URL, for engineer inspection. This route parses no documents, reads no
 * file bytes, writes nothing, approves nothing, prices nothing, resolves no SKU or
 * configuration, looks up no catalog, and calls no AI - it only invokes the
 * read-only inspection service and maps its result to HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority
 * and the route params id/artifactId are the only project/artifact authority.
 * The request body is never read. Result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), artifact_not_found -> 404 hld_design_model_artifact_not_found,
 * artifact_not_hld_design_model -> 409 artifact_not_hld_design_model (with the
 * lean payload-free artifact summary), invalid_payload -> 409
 * hld_design_model_invalid_payload (with the same lean summary), ok -> 200 with
 * { project, artifact, designModel }. An unexpected service error maps to a
 * controlled 500 that never exposes the thrown error. Imports only Next.js
 * server primitives, requireAuth, and the inspection service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDesignModelDetail } from "@/lib/projects/project-rfp-hld-design-model-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldDesignModelDetail({
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
          error: "Artifact is not an hld_design_model artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_invalid_payload",
          error: "HLD design model payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        artifact: result.artifact,
        designModel: result.designModel,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_design_model_inspection_failed",
        error: "Unable to inspect HLD design model.",
      },
      { status: 500 }
    );
  }
}
