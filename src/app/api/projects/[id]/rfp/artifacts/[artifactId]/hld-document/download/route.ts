/**
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/hld-document/download
 *
 * Streams a reviewable GENERATED HLD document CANDIDATE for manual editing. This
 * route is artifact-scoped and non-authoritative: it does not select approved final
 * authority, approve the document, close HLD, export, generate TP/proposal content,
 * call a provider, or read raw customer files. GET only; the request body and query
 * string are not read. Caller-supplied tenant/project/status/source/filename values
 * are ignored because only session.tenantId and route params are passed to the
 * service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadProjectRfpHldDocumentCandidateDownload } from "@/lib/projects/project-rfp-hld-document-candidate-download";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadProjectRfpHldDocumentCandidateDownload({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: params.artifactId,
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
    if (result.status === "artifact_not_found") {
      return NextResponse.json(
        {
          code: "hld_document_artifact_not_found",
          error: "HLD document candidate artifact was not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_hld_document") {
      return NextResponse.json(
        {
          code: "artifact_not_hld_document",
          error: "Artifact is not an HLD document candidate.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_reviewable") {
      return NextResponse.json(
        {
          code: "hld_document_artifact_not_reviewable",
          error: "HLD document candidate is not pending review.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "not_generated_candidate") {
      return NextResponse.json(
        {
          code: "hld_document_not_generated_candidate",
          error: "HLD document candidate is not generated output.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_document_payload_invalid",
          error: "HLD document candidate payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "stale_source_chain") {
      return NextResponse.json(
        {
          code: "hld_document_source_chain_stale",
          error: "HLD document candidate source chain is stale.",
          staleCode: result.staleCode,
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
        code: "rfp_hld_document_candidate_download_failed",
        error: "Unable to download the generated HLD document candidate.",
      },
      { status: 500 }
    );
  }
}
