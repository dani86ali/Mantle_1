/**
 * /api/projects/[id]/rfp/hld-design-model-review.
 *
 * GET - read-only list of advisory `hld_design_model_review` artifact versions
 * for the project. Authenticated via requireAuth; session.tenantId is the only
 * tenant authority and the route param id is the only project authority. The
 * request body is never read. Result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), ok -> 200 with { project, artifactCount, artifacts }.
 *
 * POST - create exactly ONE advisory deterministic `hld_design_model_review` over
 * a named candidate `hld_design_model`. session.tenantId is the only tenant
 * authority, session.userId is the only reviewedBy authority, and the route param
 * id is the only project authority. The JSON body is parsed ONLY for the
 * non-empty string `sourceHldDesignModelArtifactId`; any other supplied field
 * (tenantId/projectId/artifactId/reviewedBy/status/payload/source arrays/decision/
 * scope/SKU/pricing/config/catalog) is ignored entirely. Result maps to HTTP:
 * invalid body -> 400 invalid_rfp_hld_design_model_review_create_request,
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode,
 * artifact_not_found -> 404 hld_design_model_artifact_not_found,
 * artifact_not_hld_design_model -> 409 artifact_not_hld_design_model (with artifact),
 * artifact_not_reviewable -> 409 hld_design_model_artifact_not_reviewable (with
 * artifact), source_bundle_unavailable -> 409
 * hld_design_model_review_source_bundle_unavailable (with blockerCode),
 * invalid_review_payload -> 409 hld_design_model_review_payload_invalid (with
 * errors; nothing was written), ok -> 201 with
 * { artifact, recommendation, findingCount, findingCountsBySeverity }.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, prices nothing,
 * resolves no SKU or configuration, approves nothing, and calls no AI or catalog.
 * Imports only Next.js server primitives, requireAuth, the read-only inspection
 * service, and the deterministic-review service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDesignModelReviewList } from "@/lib/projects/project-rfp-hld-design-model-review-inspection";
import { createRfpHldDesignModelDeterministicReview } from "@/lib/projects/project-rfp-hld-design-model-review-deterministic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldDesignModelReviewList({
      tenantId: session.tenantId,
      projectId: params.id,
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

    return NextResponse.json(
      {
        project: result.project,
        artifactCount: result.artifactCount,
        artifacts: result.artifacts,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_design_model_review_inspection_failed",
        error: "Unable to inspect HLD design model reviews.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  // Parse the JSON body ONLY for the candidate model artifact id. A missing /
  // malformed body or a blank/non-string id is a controlled 400; no other field
  // is ever read.
  let sourceHldDesignModelArtifactId: string;
  try {
    const body: unknown = await request.json();
    const raw =
      body !== null && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).sourceHldDesignModelArtifactId
        : undefined;
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error("sourceHldDesignModelArtifactId is required.");
    }
    sourceHldDesignModelArtifactId = raw;
  } catch {
    return NextResponse.json(
      {
        code: "invalid_rfp_hld_design_model_review_create_request",
        error: "A non-empty sourceHldDesignModelArtifactId is required.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await createRfpHldDesignModelDeterministicReview({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: sourceHldDesignModelArtifactId,
      reviewedBy: session.userId,
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
    if (result.status === "source_bundle_unavailable") {
      return NextResponse.json(
        {
          code: "hld_design_model_review_source_bundle_unavailable",
          error: "No approved HLD source bundle could be resolved to review against.",
          blockerCode: result.code,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_review_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_review_payload_invalid",
          error: "The deterministic HLD design model review payload is invalid.",
          errors: result.errors,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        recommendation: result.recommendation,
        findingCount: result.findingCount,
        findingCountsBySeverity: result.findingCountsBySeverity,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_design_model_review_failed",
        error: "Unable to create RFP HLD design model review.",
      },
      { status: 500 }
    );
  }
}
