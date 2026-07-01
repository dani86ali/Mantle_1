/**
 * /api/projects/[id]/rfp/hld-design-model-rebuild-request.
 *
 * POST - create exactly ONE bounded `hld_design_model_rebuild_request` over a
 * named candidate `hld_design_model` and its advisory `hld_design_model_review`.
 * session.tenantId is the only tenant authority, session.userId is the only
 * requestedBy authority, and the route param id is the only project authority.
 * The JSON body is parsed ONLY for the strings sourceHldDesignModelArtifactId,
 * sourceReviewArtifactId, reason, and instructions; any other supplied field
 * (tenantId/projectId/requestedBy/status/payload/sku/pricing/config/catalog) is
 * ignored entirely. Result maps to HTTP: invalid body -> 400
 * invalid_rfp_hld_design_model_rebuild_request, not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the project),
 * invalid_source_model -> 409 hld_design_model_rebuild_request_invalid_source_model,
 * invalid_review -> 409 hld_design_model_rebuild_request_invalid_review,
 * active_request_exists -> 409 hld_design_model_rebuild_request_already_active
 * (with the existing artifact), invalid_request_payload -> 409
 * hld_design_model_rebuild_request_payload_invalid (with errors; nothing written),
 * ok -> 201 with { artifact }.
 *
 * GET - list the executable-active `hld_design_model_rebuild_request` artifacts for
 * the project so the UI can discover which request to execute. session.tenantId is
 * the only tenant authority and the route param id is the only project authority;
 * the request body is NEVER read or parsed (no JSON, no multipart). Result maps to
 * HTTP: ok -> 200 with { artifactCount, artifacts } (lean summaries only - no
 * payload body or tenant id), not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode (with the project), unexpected throw -> controlled 500
 * rfp_hld_design_model_rebuild_request_list_failed (no thrown detail).
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, prices nothing,
 * resolves no SKU or configuration, approves nothing, executes no rebuild, and
 * calls no AI/provider/catalog. Imports only Next.js server primitives,
 * requireAuth, and the rebuild-request service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  createRfpHldDesignModelRebuildRequest,
  listRfpHldDesignModelRebuildRequests,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-request-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  // Parse the JSON body ONLY for the four bounded request fields. A missing /
  // malformed body or any blank/non-string field is a controlled 400; no other
  // field is ever read.
  let fields: {
    sourceHldDesignModelArtifactId: string;
    sourceReviewArtifactId: string;
    reason: string;
    instructions: string;
  };
  try {
    const body: unknown = await request.json();
    const o =
      body !== null && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : undefined;
    const pick = (key: string): string => {
      const v = o ? o[key] : undefined;
      if (typeof v !== "string" || v.trim() === "") {
        throw new Error(`${key} is required.`);
      }
      return v;
    };
    fields = {
      sourceHldDesignModelArtifactId: pick("sourceHldDesignModelArtifactId"),
      sourceReviewArtifactId: pick("sourceReviewArtifactId"),
      reason: pick("reason"),
      instructions: pick("instructions"),
    };
  } catch {
    return NextResponse.json(
      {
        code: "invalid_rfp_hld_design_model_rebuild_request",
        error:
          "Non-empty sourceHldDesignModelArtifactId, sourceReviewArtifactId, reason, and instructions are required.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await createRfpHldDesignModelRebuildRequest({
      tenantId: session.tenantId,
      projectId: params.id,
      requestedBy: session.userId,
      sourceHldDesignModelArtifactId: fields.sourceHldDesignModelArtifactId,
      sourceReviewArtifactId: fields.sourceReviewArtifactId,
      reason: fields.reason,
      instructions: fields.instructions,
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
    if (result.status === "invalid_source_model") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_request_invalid_source_model",
          error: "The source HLD design model artifact is missing or not reviewable.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_review") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_request_invalid_review",
          error: "The source HLD design model review is missing, invalid, or points to a different model.",
        },
        { status: 409 }
      );
    }
    if (result.status === "active_request_exists") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_request_already_active",
          error: "An active rebuild request already exists for this design model.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "redo_limit_exhausted") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_request_redo_limit_exhausted",
          error:
            "The initial OpenAI-forced redo budget for this design model is exhausted.",
          phase: result.phase,
          maxRedoAttempts: result.maxRedoAttempts,
          attemptCount: result.attemptCount,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_request_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_request_payload_invalid",
          error: "The HLD design model rebuild request payload is invalid.",
          errors: result.errors,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ artifact: result.artifact }, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_design_model_rebuild_request_failed",
        error: "Unable to create RFP HLD design model rebuild request.",
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    // The body is never read: every input comes from the session or the URL.
    const result = await listRfpHldDesignModelRebuildRequests({
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
      { artifactCount: result.artifactCount, artifacts: result.artifacts },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_design_model_rebuild_request_list_failed",
        error: "Unable to list RFP HLD design model rebuild requests.",
      },
      { status: 500 }
    );
  }
}
