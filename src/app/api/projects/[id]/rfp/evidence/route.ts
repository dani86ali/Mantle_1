/**
 * GET /api/projects/[id]/rfp/evidence.
 *
 * Read-only list of one rfp Project's persisted RFP extraction evidence as
 * lean serializable summaries (identifiers, ISO dates, counts - never a text
 * body, never table rows, never a tenantId or a storagePath). This route
 * parses no documents, reads no file bytes, writes nothing, approves
 * nothing, prices nothing, looks up no catalog, and calls no AI - it only
 * invokes the read-only inspection service and maps its result to HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route param id is the only project authority. The
 * request body is never read. Optional filters (sourceFileId, kind,
 * inputPackageArtifactId) are read from the request's nextUrl searchParams
 * only; blank values are ignored rather than passed on, and a nonblank kind
 * outside the two RFP extraction kinds returns 400
 * invalid_rfp_evidence_query without calling the service. Service results
 * map to HTTP: not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode (with the lean project summary), ok -> 200 with
 * { project, filters, evidenceCount, textChunkCount, tableEvidenceCount,
 * evidence }. An unexpected service error maps to a controlled 500
 * (rfp_evidence_inspection_failed) that never exposes the thrown error.
 * Imports only Next.js server primitives, requireAuth, and the inspection
 * service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpProjectEvidenceList } from "@/lib/projects/project-rfp-evidence-inspection";

/** Nonblank query value, or undefined so blank params are never passed on. */
function readQueryValue(value: string | null): string | undefined {
  return value === null || value.trim() === "" ? undefined : value;
}

/** True for the only two kinds this surface accepts as a kind filter. */
function isRfpExtractionEvidenceKind(
  value: string
): value is "rfp_document_text_chunk" | "rfp_document_table" {
  return value === "rfp_document_text_chunk" || value === "rfp_document_table";
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const query = request.nextUrl.searchParams;
  const sourceFileId = readQueryValue(query.get("sourceFileId"));
  const kind = readQueryValue(query.get("kind"));
  const inputPackageArtifactId = readQueryValue(
    query.get("inputPackageArtifactId")
  );
  if (kind !== undefined && !isRfpExtractionEvidenceKind(kind)) {
    return NextResponse.json(
      {
        code: "invalid_rfp_evidence_query",
        error: "kind must be rfp_document_text_chunk or rfp_document_table.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await loadRfpProjectEvidenceList({
      tenantId: session.tenantId,
      projectId: params.id,
      ...(sourceFileId !== undefined ? { sourceFileId } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(inputPackageArtifactId !== undefined
        ? { inputPackageArtifactId }
        : {}),
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
        filters: result.filters,
        evidenceCount: result.evidenceCount,
        textChunkCount: result.textChunkCount,
        tableEvidenceCount: result.tableEvidenceCount,
        evidence: result.evidence,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_evidence_inspection_failed",
        error: "Unable to inspect RFP evidence.",
      },
      { status: 500 }
    );
  }
}
