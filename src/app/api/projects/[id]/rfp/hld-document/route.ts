/**
 * GET + POST /api/projects/[id]/rfp/hld-document.
 *
 * GET reads the active FINAL HLD authority (Stage 6H-0I-B). session.tenantId is the
 * only tenant authority and the route param id is the only project authority; the GET
 * reads NO request body. Result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary), not_finalized
 * -> 409 hld_document_not_final (with blockerCode and any pending latestArtifact),
 * stale_final_authority -> 409 hld_document_final_authority_stale (with blockerCode +
 * the lean artifact summary), ok -> 200 { project, finalAuthority }. The 200 body omits
 * the full payload and NEVER carries drawio XML. An unexpected service error maps to a
 * controlled 500.
 *
 * POST /api/projects/[id]/rfp/hld-document.
 *
 * Record ONE reviewable (needs_review) FINAL hld_document artifact from a SE MANUAL
 * draw.io upload. session.tenantId is the only tenant authority, session.userId is the
 * only createdBy authority, and the route param id is the only project authority. The
 * body is STRICT: a plain object whose only keys are { documentModelArtifactId, title,
 * uploadedFileName, drawioXml, note? }, each a string (note optional). Any extra key,
 * missing required key, non-string value, non-object body, or malformed JSON yields
 * 400 invalid_rfp_hld_document_request before the service is called. No client source
 * ids beyond the document-model id, no payload, status, createdBy, versions, or
 * authority field is ever accepted.
 *
 * Result maps to HTTP: not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode (with the lean project summary), precondition_failed -> 409
 * hld_document_precondition_failed (with blockerCode), invalid_payload -> 409
 * hld_document_payload_invalid (with errors), ok -> 201 with { artifact, payloadSummary }.
 * The 201 body carries NO drawio XML. An unexpected service error maps to a controlled
 * 500 that never exposes the thrown error.
 *
 * This route is a transport adapter only: it never touches the DB or any store, reads
 * no raw RFP files or storage paths, parses no documents, prices nothing, resolves no
 * SKU or configuration, looks up no catalog, calls no AI, and approves nothing. Imports
 * only Next.js server primitives, requireAuth, and the manual-upload service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createRfpHldDocumentManualUpload } from "@/lib/projects/project-rfp-hld-document-manual-upload";
import { selectRfpHldFinalAuthority } from "@/lib/projects/project-rfp-hld-document-final-authority";

const REQUIRED_KEYS: readonly string[] = [
  "documentModelArtifactId",
  "title",
  "uploadedFileName",
  "drawioXml",
];
const ALLOWED_KEYS: readonly string[] = [...REQUIRED_KEYS, "note"];

interface ParsedUploadBody {
  documentModelArtifactId: string;
  title: string;
  uploadedFileName: string;
  drawioXml: string;
  note?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_hld_document_request",
      error: "Request body must carry only the allowed manual-upload fields.",
    },
    { status: 400 }
  );
}

/**
 * Strictly validate the request body to the minimal SE manual-upload shape, or null
 * when invalid. The body must be a plain object whose only keys are the four required
 * string fields plus an optional string note; any extra key, missing required key, or
 * non-string value is rejected. Strings are passed through verbatim - the contract
 * validator, not the transport, enforces draw.io/well-formedness rules.
 */
function parseUploadBody(body: unknown): ParsedUploadBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.includes(key)) return null;
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in record) || typeof record[key] !== "string") return null;
  }
  if ("note" in record && typeof record.note !== "string") return null;

  return {
    documentModelArtifactId: record.documentModelArtifactId as string,
    title: record.title as string,
    uploadedFileName: record.uploadedFileName as string,
    drawioXml: record.drawioXml as string,
    ...("note" in record ? { note: record.note as string } : {}),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await selectRfpHldFinalAuthority({
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
    if (result.status === "not_finalized") {
      return NextResponse.json(
        {
          code: "hld_document_not_final",
          error: "No approved final HLD document authority is available.",
          blockerCode: result.blockerCode,
          ...(result.latestArtifact !== undefined
            ? { latestArtifact: result.latestArtifact }
            : {}),
        },
        { status: 409 }
      );
    }
    if (result.status === "stale_final_authority") {
      return NextResponse.json(
        {
          code: "hld_document_final_authority_stale",
          error: "The approved final HLD document is no longer valid authority.",
          blockerCode: result.blockerCode,
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { project: result.project, finalAuthority: result.authority },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_document_authority_failed",
        error: "Unable to read final RFP HLD document authority.",
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  const parsed = parseUploadBody(body);
  if (parsed === null) return invalidRequest();

  try {
    const result = await createRfpHldDocumentManualUpload({
      tenantId: session.tenantId,
      projectId: params.id,
      createdBy: session.userId,
      documentModelArtifactId: parsed.documentModelArtifactId,
      title: parsed.title,
      uploadedFileName: parsed.uploadedFileName,
      drawioXml: parsed.drawioXml,
      ...(parsed.note !== undefined ? { note: parsed.note } : {}),
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
    if (result.status === "precondition_failed") {
      return NextResponse.json(
        {
          code: "hld_document_precondition_failed",
          error: "HLD document manual-upload preconditions are not met.",
          blockerCode: result.code,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_document_payload_invalid",
          error: "Manual HLD document payload is invalid.",
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
        code: "rfp_hld_document_failed",
        error: "Unable to record manual RFP HLD document.",
      },
      { status: 500 }
    );
  }
}
