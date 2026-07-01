/**
 * GET /api/projects/[id]/rfp/hld-document/download - stream the approved FINAL HLD
 * document authority's draw.io XML body (Stage 6H-0I-D). Download/serve ONLY: it
 * generates, regenerates, approves, closes, or exports nothing, creates no artifact or
 * approval, calls no AI/provider, and makes no pricing/SKU/catalog/config decision.
 *
 * GET only. Authenticated via requireAuth; session.tenantId is the only tenant authority
 * and the route param id is the only project authority. The request body and query
 * string are NEVER read - this route accepts no caller-supplied authority (no tenantId,
 * projectId, artifactId, filePath, filename, status, or authority). The service result
 * maps to HTTP: not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode
 * (with the lean project summary), not_finalized -> 409 hld_document_not_final (with
 * blockerCode and any pending latestArtifact), stale_final_authority -> 409
 * hld_document_final_authority_stale (with blockerCode + the lean artifact summary), ok
 * -> 200 with the exact draw.io XML bytes (attachment, no-store, content length). An
 * unexpected service error maps to a controlled 500 (rfp_hld_document_download_failed)
 * that never exposes the thrown error. Imports only Next.js server primitives,
 * requireAuth, and the final-HLD download service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadProjectRfpHldDocumentDownload } from "@/lib/projects/project-rfp-hld-document-download";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadProjectRfpHldDocumentDownload({
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

    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(result.contentLength),
      },
    });
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_document_download_failed",
        error: "Unable to download the final RFP HLD document.",
      },
      { status: 500 }
    );
  }
}
