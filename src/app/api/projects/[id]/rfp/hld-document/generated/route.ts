/**
 * POST /api/projects/[id]/rfp/hld-document/generated.
 *
 * Record ONE reviewable (needs_review) FINAL hld_document artifact as a deterministically
 * GENERATED draw.io output (Stage G3). session.tenantId is the only tenant authority,
 * session.userId is the only createdBy authority, and the route param id is the only
 * project authority. The body is STRICT: a plain object whose ONLY key is
 * { documentModelArtifactId: string }. Any extra key, missing key, non-string value,
 * non-object body, or malformed JSON yields 400 invalid_rfp_hld_document_generated_request
 * before the service is called. No client draw.io XML, source ids, versions, status,
 * title, file name, or authority is ever accepted.
 *
 * Result maps to HTTP: not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode (with the lean project summary), final_hld_already_approved -> 409
 * hld_document_final_authority_exists (with the sanitized finalAuthority summary),
 * precondition_failed -> 409 hld_document_precondition_failed (with blockerCode),
 * invalid_payload -> 409 hld_document_payload_invalid (with errors), ok -> 201 with
 * { artifact, payloadSummary }. The 201 body carries NO drawio XML or payload body. An
 * unexpected service error maps to a controlled 500 that never exposes the thrown error.
 *
 * This route is a transport adapter only: it never touches the DB or any store, reads no
 * raw RFP files or storage paths, parses no documents, prices nothing, resolves no SKU or
 * configuration, looks up no catalog, calls no AI, and approves nothing. Imports only
 * Next.js server primitives, requireAuth, and the generated-document service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createRfpHldDocumentGenerated } from "@/lib/projects/project-rfp-hld-document-generated";

const ALLOWED_KEYS: readonly string[] = ["documentModelArtifactId"];

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_hld_document_generated_request",
      error: "Request body must be { documentModelArtifactId: string } only.",
    },
    { status: 400 }
  );
}

/**
 * Strictly validate the request body to exactly { documentModelArtifactId: string }, or
 * null when invalid. Any extra key, a missing key, a non-string value, or a non-object
 * body is rejected before the service runs.
 */
function parseBody(body: unknown): { documentModelArtifactId: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.includes(key)) return null;
  }
  if (typeof record.documentModelArtifactId !== "string") return null;
  return { documentModelArtifactId: record.documentModelArtifactId };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  const parsed = parseBody(body);
  if (parsed === null) return invalidRequest();

  try {
    const result = await createRfpHldDocumentGenerated({
      tenantId: session.tenantId,
      projectId: params.id,
      createdBy: session.userId,
      documentModelArtifactId: parsed.documentModelArtifactId,
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
          code: "hld_document_final_authority_exists",
          error: "An approved final HLD authority already exists.",
          finalAuthority: result.finalAuthority,
        },
        { status: 409 }
      );
    }
    if (result.status === "precondition_failed") {
      return NextResponse.json(
        {
          code: "hld_document_precondition_failed",
          error: "HLD document generation preconditions are not met.",
          blockerCode: result.code,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_document_payload_invalid",
          error: "Generated HLD document payload is invalid.",
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
        code: "rfp_hld_document_generated_failed",
        error: "Unable to record generated RFP HLD document.",
      },
      { status: 500 }
    );
  }
}
