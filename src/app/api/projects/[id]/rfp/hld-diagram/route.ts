/**
 * /api/projects/[id]/rfp/hld-diagram.
 *
 * GET - read-only list of internal `hld_diagram` draft artifact versions for the
 * project. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route param id is the only project authority. The request body
 * is never read. Result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary), ok -> 200
 * with { project, artifactCount, artifacts }.
 *
 * POST - create exactly ONE deterministic `hld_diagram` draft from the approved
 * `hld_design_model` topology, gated by Stage 6F generation readiness.
 * session.tenantId is the only tenant authority, session.userId is the only
 * createdBy authority, and the route param id is the only project authority. The
 * request body is NEVER read: the diagram type is fixed to "topology" and all
 * source ids are resolved server-side from the readiness report. Result maps to
 * HTTP: not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode,
 * final_hld_already_approved -> 409 hld_diagram_final_authority_exists (with
 * sanitized finalAuthority), readiness_blocked -> 409
 * hld_diagram_generation_not_ready (with nextAction), no_topology -> 409
 * hld_diagram_no_topology (with blockerCode),
 * precondition_failed -> 409 hld_diagram_precondition_failed (with blockerCode),
 * invalid_payload -> 409 hld_diagram_payload_invalid (with errors; nothing was
 * written), ok -> 201 with { artifact, payloadSummary }.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, prices nothing,
 * resolves no SKU or configuration, approves nothing, calls no AI or catalog, and
 * generates no final HLD document/HTML/draw.io/diagram-markup/proposal/export.
 * Imports only Next.js server primitives, requireAuth, the read-only inspection
 * service, and the deterministic diagram-draft service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDiagramList } from "@/lib/projects/project-rfp-hld-diagram-inspection";
import { createRfpHldDiagramDraft } from "@/lib/projects/project-rfp-hld-diagram-draft";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldDiagramList({
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
        code: "rfp_hld_diagram_inspection_failed",
        error: "Unable to inspect HLD diagram drafts.",
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
    const result = await createRfpHldDiagramDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      createdBy: session.userId,
      diagramType: "topology",
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
          code: "hld_diagram_final_authority_exists",
          error: "An approved final HLD document already exists; regeneration is blocked.",
          finalAuthority: result.finalAuthority,
        },
        { status: 409 }
      );
    }
    if (result.status === "readiness_blocked") {
      return NextResponse.json(
        {
          code: "hld_diagram_generation_not_ready",
          error: "HLD generation readiness is not satisfied.",
          nextAction: result.nextAction,
        },
        { status: 409 }
      );
    }
    if (result.status === "no_topology") {
      return NextResponse.json(
        {
          code: "hld_diagram_no_topology",
          error: "The approved HLD design model has no topology to draw.",
          blockerCode: result.code,
        },
        { status: 409 }
      );
    }
    if (result.status === "precondition_failed") {
      return NextResponse.json(
        {
          code: "hld_diagram_precondition_failed",
          error: "A required approved upstream artifact could not be resolved.",
          blockerCode: result.code,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_diagram_payload_invalid",
          error: "The derived HLD diagram draft payload is invalid.",
          errors: result.errors,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_diagram_failed",
        error: "Unable to create RFP HLD diagram draft.",
      },
      { status: 500 }
    );
  }
}
