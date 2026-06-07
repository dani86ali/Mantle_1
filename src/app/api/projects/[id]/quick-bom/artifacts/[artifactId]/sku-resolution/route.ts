/**
 * POST /api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution -
 * create a sku_resolution draft from an already-recorded normalized_boq artifact.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route params id/artifactId are the only project/source-
 * artifact authority. The request body is ignored entirely - this action operates
 * on a persisted normalized_boq artifact. The service result maps to HTTP:
 * not_found -> 404, wrong_mode -> 409 (with the lean project summary),
 * normalized_boq_not_found -> 404, artifact_not_normalized_boq -> 409 (artifact
 * included when known), normalized_boq_not_ready -> 409 (with the source artifact
 * summary), invalid_normalized_boq_payload -> 409, ok -> 201 with
 * { artifact, payloadSummary }. An unexpected service error maps to a controlled
 * 500 that never exposes the thrown error. Imports only Next.js server primitives,
 * requireAuth, and the SKU-resolution wrapper service (no DB, stores, raw BoQ
 * loader/parser, artifact/approval/evidence store, pricing, config expansion,
 * export, runner, AI, catalog, engine, coordinator, or adapter).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createProjectQuickBomSkuResolutionDraft } from "@/lib/projects/project-quick-bom-sku-resolution";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await createProjectQuickBomSkuResolutionDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      normalizedBoqArtifactId: params.artifactId,
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
          error: "Project is not a Quick BoM project.",
          project: result.project,
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
          ...(result.artifact ? { artifact: result.artifact } : {}),
        },
        { status: 409 }
      );
    }
    if (result.status === "normalized_boq_not_ready") {
      return NextResponse.json(
        {
          code: "normalized_boq_artifact_not_ready",
          error: "Normalized BoQ artifact is not ready for SKU resolution.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_normalized_boq_payload") {
      return NextResponse.json(
        {
          code: "invalid_normalized_boq_payload",
          error: "Normalized BoQ artifact payload is invalid.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { artifact: result.artifact, payloadSummary: result.payloadSummary },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "quick_bom_sku_resolution_failed",
        error: "Unable to create Quick BoM SKU resolution draft.",
      },
      { status: 500 }
    );
  }
}
