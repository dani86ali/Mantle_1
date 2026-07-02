/**
 * /api/projects/[id]/rfp/hld-diagram-output.
 *
 * GET - read-only list of internal `hld_diagram_output` artifact versions plus
 * counts-only payload summaries. Authenticated via requireAuth; session.tenantId is the
 * only tenant authority and the route param id is the only project authority. The
 * request body is never read. Result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary), ok -> 200 with
 * { project, artifactCount, artifacts }.
 *
 * POST - create exactly ONE deterministic `hld_diagram_output` from the current
 * approved `hld_diagram`, gated by Stage 6F generation readiness and the full HLD
 * source chain. session.tenantId is the only tenant authority, session.userId is the
 * only createdBy authority, and the route param id is the only project authority. The
 * body must be absent, empty, whitespace-only, or the empty JSON object {}; any
 * non-empty malformed body and any parsed non-empty/non-object value is rejected with
 * 400 invalid_rfp_hld_diagram_output_request before the service is called. No client
 * source ids, payload, status, createdBy, or diagram id is ever accepted. Result maps
 * to HTTP: not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode,
 * final_hld_already_approved -> 409 hld_diagram_output_final_authority_exists (with
 * sanitized finalAuthority), readiness_blocked -> 409 hld_diagram_output_not_ready
 * (with nextAction), precondition_failed -> 409 hld_diagram_output_precondition_failed
 * (with blockerCode), current_output_exists -> 409
 * hld_diagram_output_current_output_exists (with lean artifact; nothing was written),
 * invalid_payload -> 409 hld_diagram_output_payload_invalid (with
 * errors; nothing was written), ok -> 201 with { artifact, payloadSummary }.
 *
 * This route is a transport adapter only: it never touches the DB or any store, reads
 * no raw RFP files or storage paths, parses no documents, prices nothing, resolves no
 * SKU or configuration, calls no AI or catalog, approves nothing, and generates no
 * draw.io XML/markup, rendered/downloadable output, or final HLD document. Imports only
 * Next.js server primitives, requireAuth, the read-only inspection service, and the
 * deterministic diagram-output generation service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDiagramOutputList } from "@/lib/projects/project-rfp-hld-diagram-output-inspection";
import { createRfpHldDiagramOutputDraft } from "@/lib/projects/project-rfp-hld-diagram-output-generation";

/**
 * Accept only a truly absent/empty/whitespace-only body or the empty JSON object {}.
 * The raw text is read once: blank text is allowed; non-blank text that is not valid
 * JSON is rejected; and any parsed value other than an empty plain object is rejected
 * so no client field can carry authority.
 */
async function isAcceptableEmptyBody(request: NextRequest): Promise<boolean> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return false;
  }
  if (text.trim() === "") return true;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return false;
  }
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldDiagramOutputList({
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
        code: "rfp_hld_diagram_output_inspection_failed",
        error: "Unable to inspect HLD diagram outputs.",
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

  if (!(await isAcceptableEmptyBody(request))) {
    return NextResponse.json(
      {
        code: "invalid_rfp_hld_diagram_output_request",
        error: "Request body must be empty.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await createRfpHldDiagramOutputDraft({
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
          code: "hld_diagram_output_final_authority_exists",
          error: "An approved final HLD document already exists; regeneration is blocked.",
          finalAuthority: result.finalAuthority,
        },
        { status: 409 }
      );
    }
    if (result.status === "readiness_blocked") {
      return NextResponse.json(
        {
          code: "hld_diagram_output_not_ready",
          error: "HLD generation readiness is not satisfied.",
          nextAction: result.nextAction,
        },
        { status: 409 }
      );
    }
    if (result.status === "precondition_failed") {
      return NextResponse.json(
        {
          code: "hld_diagram_output_precondition_failed",
          error: "A required approved upstream artifact could not be resolved.",
          blockerCode: result.code,
        },
        { status: 409 }
      );
    }
    if (result.status === "current_output_exists") {
      return NextResponse.json(
        {
          code: "hld_diagram_output_current_output_exists",
          error: "A current HLD diagram output already exists; create is blocked.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_diagram_output_payload_invalid",
          error: "The derived HLD diagram output payload is invalid.",
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
        code: "rfp_hld_diagram_output_failed",
        error: "Unable to create RFP HLD diagram output.",
      },
      { status: 500 }
    );
  }
}
