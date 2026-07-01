/**
 * /api/projects/[id]/rfp/hld-document-model.
 *
 * GET - read-only list of internal hld_document_model artifacts plus counts-only
 * payload summaries. Authenticated via requireAuth; session.tenantId is the only
 * tenant authority and the route param id is the only project authority. The
 * request body is never read. Result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), ok -> 200 with { project, artifactCount, artifacts }.
 *
 * POST - compile ONE internal needs_review hld_document_model draft from the
 * already-approved upstream Project authorities. session.tenantId is the only
 * tenant authority, session.userId is the only createdBy authority, and the route
 * param id is the only project authority. The body must be absent, empty,
 * whitespace-only, or the empty JSON object {}; any non-empty malformed body and any
 * parsed non-empty/non-object value (null, array, string, number, boolean, or
 * non-empty object) is rejected with 400 invalid_rfp_hld_document_model_request
 * before the service is called. No client source ids, payload, status, createdBy, or
 * authority field is ever accepted.
 * Result maps to HTTP: not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode, final_hld_already_approved -> 409
 * hld_document_model_final_authority_exists (with sanitized finalAuthority),
 * readiness_blocked -> 409 hld_document_model_not_ready (with nextAction),
 * precondition_failed -> 409 hld_document_model_precondition_failed (with
 * blockerCode), invalid_payload -> 409 hld_document_model_payload_invalid (with
 * errors), ok -> 201 with { artifact, payloadSummary }.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, prices nothing,
 * resolves no SKU or configuration, looks up no catalog, calls no AI, and approves
 * nothing. Imports only Next.js server primitives, requireAuth, and the
 * document-model services.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDocumentModelList } from "@/lib/projects/project-rfp-hld-document-model-inspection";
import { createRfpHldDocumentModelDraft } from "@/lib/projects/project-rfp-hld-document-model-draft";

/**
 * Accept only a truly absent/empty/whitespace-only body or the empty JSON object
 * {}. The raw text is read once: blank text is allowed; non-blank text that is not
 * valid JSON is rejected; and any parsed value other than an empty plain object
 * (null, arrays, strings, numbers, booleans, non-empty objects) is rejected so no
 * client field can carry authority.
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
    const result = await loadRfpHldDocumentModelList({
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
        code: "rfp_hld_document_model_inspection_failed",
        error: "Unable to inspect HLD document models.",
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
        code: "invalid_rfp_hld_document_model_request",
        error: "Request body must be empty.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await createRfpHldDocumentModelDraft({
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
          code: "hld_document_model_final_authority_exists",
          error: "An approved final HLD document already exists; regeneration is blocked.",
          finalAuthority: result.finalAuthority,
        },
        { status: 409 }
      );
    }
    if (result.status === "readiness_blocked") {
      return NextResponse.json(
        {
          code: "hld_document_model_not_ready",
          error: "HLD document model prerequisites are not ready.",
          nextAction: result.nextAction,
        },
        { status: 409 }
      );
    }
    if (result.status === "precondition_failed") {
      return NextResponse.json(
        {
          code: "hld_document_model_precondition_failed",
          error: "HLD document model preconditions are not met.",
          blockerCode: result.code,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_document_model_payload_invalid",
          error: "Derived HLD document model payload is invalid.",
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
        code: "rfp_hld_document_model_failed",
        error: "Unable to draft RFP HLD document model.",
      },
      { status: 500 }
    );
  }
}
