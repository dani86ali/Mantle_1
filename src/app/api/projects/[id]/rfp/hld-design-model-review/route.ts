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
 * POST - create exactly ONE advisory OpenAI internal BOMATIC quality review (an
 * `hld_design_model_review`) over a named candidate `hld_design_model`. This is
 * NOT a deterministic review: it wraps the CANDIDATE findings of the configured
 * OpenAI advisory review executor through the Stage 6H-0H-A service boundary. The
 * OpenAI review is advisory and a mandatory internal gate only - it never approves
 * or finalizes the model, always precedes the human engineer gate, and carries no
 * SKU/pricing/catalog/configuration/final-design authority. session.tenantId is
 * the only tenant authority, session.userId is the only reviewedBy authority, and
 * the route param id is the only project authority. The JSON body is parsed ONLY
 * for the non-empty string `sourceHldDesignModelArtifactId`; any other supplied
 * field (tenantId/projectId/artifactId/reviewedBy/executor/status/payload/provider/
 * model/source arrays/decision/scope/SKU/pricing/config/catalog) is ignored
 * entirely. The executor is always the one returned by the configured factory,
 * which is the safe null seam in this stage (no live provider call), so the
 * default behavior is a stable 503 unavailable. Result maps to HTTP:
 * invalid body -> 400 invalid_rfp_hld_design_model_review_create_request,
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode,
 * artifact_not_found -> 404 hld_design_model_artifact_not_found,
 * artifact_not_hld_design_model -> 409 artifact_not_hld_design_model (with artifact),
 * artifact_not_reviewable -> 409 hld_design_model_artifact_not_reviewable (with
 * artifact), invalid_hld_design_model_payload -> 409
 * hld_design_model_payload_invalid (with artifact), stale_hld_design_model_payload
 * -> 409 hld_design_model_openai_review_source_stale (with staleCode and only the
 * optional messages/errors arrays supplied by the service), unavailable -> 503
 * hld_design_model_openai_review_unavailable, review_failed -> 502
 * hld_design_model_openai_review_failed, invalid_candidate_output -> 409
 * hld_design_model_openai_review_candidate_invalid (with deterministic errors),
 * ok -> 201 with { artifact, recommendation, findingCount, findingCountsBySeverity }.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, reads no env,
 * imports no provider SDK, prices nothing, resolves no SKU or configuration,
 * approves or finalizes nothing, and calls no catalog or legacy runtime AI module.
 * Imports only Next.js server primitives, requireAuth, the read-only inspection
 * service, and the OpenAI advisory review service (create + configured executor).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDesignModelReviewList } from "@/lib/projects/project-rfp-hld-design-model-review-inspection";
import {
  createRfpHldDesignModelOpenAiReview,
  getConfiguredRfpHldDesignModelOpenAiReviewExecutor,
} from "@/lib/projects/project-rfp-hld-design-model-openai-review-service";

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
    const result = await createRfpHldDesignModelOpenAiReview({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: sourceHldDesignModelArtifactId,
      reviewedBy: session.userId,
      executor: getConfiguredRfpHldDesignModelOpenAiReviewExecutor(),
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
    if (result.status === "invalid_hld_design_model_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_payload_invalid",
          error: "The persisted HLD design model payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "stale_hld_design_model_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_openai_review_source_stale",
          error: "The HLD design model is no longer current with its approved source.",
          staleCode: result.staleCode,
          ...(result.messages !== undefined ? { messages: result.messages } : {}),
          ...(result.errors !== undefined ? { errors: result.errors } : {}),
        },
        { status: 409 }
      );
    }
    if (result.status === "unavailable") {
      return NextResponse.json(
        {
          code: "hld_design_model_openai_review_unavailable",
          error: "OpenAI advisory HLD design model review is not available.",
        },
        { status: 503 }
      );
    }
    if (result.status === "review_failed") {
      return NextResponse.json(
        {
          code: "hld_design_model_openai_review_failed",
          error: "The OpenAI advisory HLD design model review failed.",
        },
        { status: 502 }
      );
    }
    if (result.status === "invalid_candidate_output") {
      return NextResponse.json(
        {
          code: "hld_design_model_openai_review_candidate_invalid",
          error: "The OpenAI advisory HLD design model review candidate is invalid.",
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
