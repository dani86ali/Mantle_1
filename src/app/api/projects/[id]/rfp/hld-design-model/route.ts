/**
 * /api/projects/[id]/rfp/hld-design-model.
 *
 * GET - read-only list of hld_design_model artifact versions plus a read-only
 * design-model readiness probe. Authenticated via requireAuth; session.tenantId
 * is the only tenant authority and the route param id is the only project
 * authority. The request body is never read. Result maps to HTTP:
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode (with
 * the lean project summary), ok -> 200 with
 * { project, artifactCount, artifacts, designModelReadiness }.
 *
 * POST - draft ONE reviewable hld_design_model from the already-approved upstream
 * Project authorities. session.tenantId is the only tenant authority,
 * session.userId is the only createdBy authority, and the route param id is the
 * only project authority. No body is required; any body supplied
 * (tenantId/projectId/createdBy/status/source ids/payload) is ignored entirely
 * and the request body is never parsed. Result maps to HTTP:
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode,
 * final_hld_already_approved -> 409 hld_design_model_final_authority_exists
 * (with sanitized finalAuthority), blocked -> 409 hld_design_model_blocked
 * (with blockerCode + messages),
 * invalid_source_bundle_payload -> 409 hld_design_model_source_bundle_invalid
 * (with errors), candidate_input_blocked -> 409
 * hld_design_model_candidate_input_blocked (with reason), drafting_unavailable ->
 * 503 hld_design_model_drafting_unavailable, drafting_failed -> 502
 * hld_design_model_drafting_failed, invalid_draft_payload -> 502
 * hld_design_model_invalid_draft_payload (with errors), ok -> 201 with
 * { artifact, sourceBundle, payloadSummary }.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, prices nothing,
 * resolves no SKU or configuration, and calls no AI or catalog. Imports only
 * Next.js server primitives, requireAuth, and the design-model services.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDesignModelList } from "@/lib/projects/project-rfp-hld-design-model-inspection";
import { createRfpHldDesignModelDraft } from "@/lib/projects/project-rfp-hld-design-model-draft";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldDesignModelList({
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
        designModelReadiness: result.designModelReadiness,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_design_model_inspection_failed",
        error: "Unable to inspect HLD design models.",
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

  try {
    const result = await createRfpHldDesignModelDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      createdBy: session.userId,
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
    if (result.status === "final_hld_already_approved") {
      return NextResponse.json(
        {
          code: "hld_design_model_final_authority_exists",
          error: "An approved final HLD document already exists; regeneration is blocked.",
          finalAuthority: result.finalAuthority,
        },
        { status: 409 }
      );
    }
    if (result.status === "blocked") {
      return NextResponse.json(
        {
          code: "hld_design_model_blocked",
          error: "HLD design model prerequisites are not met.",
          blockerCode: result.code,
          messages: result.messages,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_source_bundle_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_source_bundle_invalid",
          error: "The approved HLD source bundle payload is invalid.",
          errors: result.errors,
        },
        { status: 409 }
      );
    }
    if (result.status === "candidate_input_blocked") {
      return NextResponse.json(
        {
          code: "hld_design_model_candidate_input_blocked",
          error: "HLD design model candidate input could not be assembled.",
          reason: result.reason,
        },
        { status: 409 }
      );
    }
    if (result.status === "drafting_unavailable") {
      return NextResponse.json(
        {
          code: "hld_design_model_drafting_unavailable",
          error: "HLD design model drafting is not available.",
        },
        { status: 503 }
      );
    }
    if (result.status === "drafting_failed") {
      return NextResponse.json(
        {
          code: "hld_design_model_drafting_failed",
          error: "HLD design model drafting failed.",
        },
        { status: 502 }
      );
    }
    if (result.status === "invalid_draft_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_invalid_draft_payload",
          error: "Drafted HLD design model payload is invalid.",
          errors: result.errors,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        sourceBundle: result.sourceBundle,
        payloadSummary: result.payloadSummary,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_design_model_failed",
        error: "Unable to draft RFP HLD design model.",
      },
      { status: 500 }
    );
  }
}
