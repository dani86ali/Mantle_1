/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model-rebuild-request/execute.
 *
 * Executes exactly ONE bounded `hld_design_model_rebuild_request` named by the URL
 * artifact id, redrafting a candidate `hld_design_model` from the SAME current
 * approved source bundle after the model's advisory review. session.tenantId is
 * the only tenant authority, params.id is the only project authority,
 * params.artifactId is the only rebuild-request authority, and session.userId is
 * the only executedBy authority. The request body is intentionally IGNORED: it is
 * never read or parsed (no JSON body, no multipart parsing), so no tenant/project/
 * user/status/payload/source/model/review/SKU/pricing/catalog/configuration field
 * in the body can influence execution. The route also passes NO executor; the
 * service resolves
 * its own configured drafting executor and fails closed (drafting_unavailable)
 * while no provider is wired, consuming nothing.
 *
 * Result maps to stable codes/HTTP:
 *   ok                                    -> 201 { artifact, consumedRequest, sourceBundle, payloadSummary }
 *   not_found                             -> 404 project_not_found
 *   wrong_mode                            -> 409 wrong_project_mode (project)
 *   final_hld_already_approved            -> 409 hld_design_model_rebuild_final_authority_exists (finalAuthority)
 *   request_not_found                     -> 404 hld_design_model_rebuild_request_not_found
 *   artifact_not_rebuild_request          -> 409 artifact_not_hld_design_model_rebuild_request (artifact)
 *   request_not_active                    -> 409 hld_design_model_rebuild_request_not_active (artifact)
 *   request_payload_invalid               -> 409 hld_design_model_rebuild_request_payload_invalid (errors)
 *   source_model_unavailable              -> 409 hld_design_model_rebuild_source_model_unavailable
 *   source_review_unavailable             -> 409 hld_design_model_rebuild_source_review_unavailable
 *   source_review_does_not_justify_rebuild-> 409 hld_design_model_rebuild_not_justified
 *   stale_source_bundle                   -> 409 hld_design_model_rebuild_source_bundle_stale
 *   invalid_source_bundle_payload         -> 409 hld_design_model_rebuild_source_bundle_invalid (errors)
 *   candidate_input_blocked               -> 409 hld_design_model_rebuild_candidate_input_blocked (reason)
 *   drafting_unavailable                  -> 503 hld_design_model_rebuild_drafting_unavailable
 *   request_retire_failed                 -> 409 hld_design_model_rebuild_request_retire_failed (intendedStatus)
 *   drafting_failed                       -> 502 hld_design_model_rebuild_drafting_failed
 *   invalid_draft_payload                 -> 409 hld_design_model_rebuild_invalid_draft_payload (errors)
 *
 * The ok body carries only lean summaries: no status discriminator, no tenant id,
 * and no raw model/review/request payload body. drafting_failed never surfaces the
 * swallowed executor/provider detail, and invalid_draft_payload forwards only the
 * deterministic compatibility errors, never the untrusted draft JSON. Any
 * unexpected throw maps to a controlled 500 (hld_design_model_rebuild_execution_failed)
 * that exposes no thrown detail.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP/PDF/DOCX/XLSX files or storage paths, parses no documents,
 * prices nothing, resolves no SKU or configuration, sizes no hardware, infers no
 * topology/scope, approves nothing, and constructs no provider/AI/catalog client.
 * The rebuilt model stays candidate-only (needs_review) and subordinate to a fresh
 * deterministic review and human engineer approval; this route generates no final
 * HLD document, HTML, diagram, draw.io/XML, Mermaid, SVG, TP/proposal, export, or
 * customer deliverable. Imports only Next.js server primitives, requireAuth, and
 * the rebuild execution service. POST is the only exported method.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { executeRfpHldDesignModelRebuild } from "@/lib/projects/project-rfp-hld-design-model-rebuild-executor";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    // The body is never read: every input comes from the session or the URL.
    const result = await executeRfpHldDesignModelRebuild({
      tenantId: session.tenantId,
      projectId: params.id,
      rebuildRequestArtifactId: params.artifactId,
      executedBy: session.userId,
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
          code: "hld_design_model_rebuild_final_authority_exists",
          error: "An approved final HLD document already exists; regeneration is blocked.",
          finalAuthority: result.finalAuthority,
        },
        { status: 409 }
      );
    }
    if (result.status === "request_not_found") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_request_not_found",
          error: "HLD design model rebuild request artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_rebuild_request") {
      return NextResponse.json(
        {
          code: "artifact_not_hld_design_model_rebuild_request",
          error: "Artifact is not an HLD design model rebuild request.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "request_not_active") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_request_not_active",
          error: "HLD design model rebuild request is not active.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "request_payload_invalid") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_request_payload_invalid",
          error: "HLD design model rebuild request payload is invalid.",
          errors: result.errors,
        },
        { status: 409 }
      );
    }
    if (result.status === "source_model_unavailable") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_source_model_unavailable",
          error: "The source HLD design model is unavailable or no longer reviewable.",
        },
        { status: 409 }
      );
    }
    if (result.status === "source_review_unavailable") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_source_review_unavailable",
          error: "The source HLD design model review is unavailable.",
        },
        { status: 409 }
      );
    }
    if (result.status === "source_review_does_not_justify_rebuild") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_not_justified",
          error: "The advisory review does not justify a rebuild.",
        },
        { status: 409 }
      );
    }
    if (result.status === "stale_source_bundle") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_source_bundle_stale",
          error: "The approved HLD source bundle has changed; the rebuild basis is stale.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_source_bundle_payload") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_source_bundle_invalid",
          error: "The approved HLD source bundle payload is invalid.",
          errors: result.errors,
        },
        { status: 409 }
      );
    }
    if (result.status === "candidate_input_blocked") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_candidate_input_blocked",
          error: "The deterministic rebuild candidate input could not be built.",
          reason: result.reason,
        },
        { status: 409 }
      );
    }
    if (result.status === "drafting_unavailable") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_drafting_unavailable",
          error: "No HLD design model drafting executor is configured; rebuild is unavailable.",
        },
        { status: 503 }
      );
    }
    if (result.status === "request_retire_failed") {
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_request_retire_failed",
          error: "The rebuild request could not be claimed or retired.",
          intendedStatus: result.intendedStatus,
        },
        { status: 409 }
      );
    }
    if (result.status === "drafting_failed") {
      // The swallowed executor/provider detail is never surfaced.
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_drafting_failed",
          error: "HLD design model rebuild drafting failed.",
        },
        { status: 502 }
      );
    }
    if (result.status === "invalid_draft_payload") {
      // Only the deterministic compatibility errors cross the seam; never the
      // untrusted draft payload body.
      return NextResponse.json(
        {
          code: "hld_design_model_rebuild_invalid_draft_payload",
          error: "The rebuilt HLD design model draft failed deterministic validation.",
          errors: result.errors,
        },
        { status: 409 }
      );
    }

    // ok: lean summaries only - no status discriminator, no tenant id, no payload.
    return NextResponse.json(
      {
        artifact: result.artifact,
        consumedRequest: result.consumedRequest,
        sourceBundle: result.sourceBundle,
        payloadSummary: result.payloadSummary,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "hld_design_model_rebuild_execution_failed",
        error: "Unable to execute HLD design model rebuild.",
      },
      { status: 500 }
    );
  }
}
