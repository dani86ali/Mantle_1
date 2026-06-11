/**
 * POST /api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion
 * - create a configuration_expansion DRAFT from an already-approved
 * sku_resolution artifact.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route params id/artifactId are the only project/source-
 * artifact (sku_resolution) authority. The request body is ignored entirely -
 * this action operates on a persisted, approved sku_resolution artifact. The
 * service result maps to HTTP: not_found -> 404 project_not_found, wrong_mode ->
 * 409 wrong_project_mode (with the lean project summary), sku_resolution_not_found
 * -> 404 sku_resolution_artifact_not_found, artifact_not_sku_resolution -> 409
 * (with the source artifact summary), sku_resolution_not_approved -> 409
 * sku_resolution_artifact_not_approved (with the source artifact summary),
 * invalid_sku_resolution_payload -> 409, normalized_boq_not_found -> 404
 * normalized_boq_artifact_not_found, artifact_not_normalized_boq -> 409 (with the
 * artifact summary), normalized_boq_version_mismatch -> 409
 * normalized_boq_artifact_version_mismatch (with the artifact summary),
 * normalized_boq_not_ready -> 409 normalized_boq_artifact_not_ready,
 * invalid_normalized_boq_payload -> 409, ok -> 201 with { artifact,
 * payloadSummary }. An unexpected service error maps to a controlled 500 that
 * never exposes the thrown error. Imports only Next.js server primitives,
 * requireAuth, and the configuration-expansion draft wrapper service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createProjectQuickBomConfigurationExpansionDraft } from "@/lib/projects/project-quick-bom-config-expansion-draft";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await createProjectQuickBomConfigurationExpansionDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      skuResolutionArtifactId: params.artifactId,
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
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "sku_resolution_not_approved") {
      return NextResponse.json(
        {
          code: "sku_resolution_artifact_not_approved",
          error: "SKU resolution artifact must be approved before configuration expansion.",
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
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "normalized_boq_version_mismatch") {
      return NextResponse.json(
        {
          code: "normalized_boq_artifact_version_mismatch",
          error: "Normalized BoQ artifact version does not match the SKU resolution source.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "normalized_boq_not_ready") {
      return NextResponse.json(
        {
          code: "normalized_boq_artifact_not_ready",
          error: "Normalized BoQ artifact is not ready for configuration expansion.",
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
        code: "quick_bom_configuration_expansion_draft_failed",
        error: "Unable to create Quick BoM configuration expansion draft.",
      },
      { status: 500 }
    );
  }
}
