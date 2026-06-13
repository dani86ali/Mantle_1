/**
 * GET /api/projects/[id]/rfp/extraction-delta.
 *
 * Read-only list of one rfp Project's extraction_delta artifact versions as
 * lean serializable summaries (identifiers, ISO dates, counts, copied source
 * arrays - never a candidate body, never proposed or raw evidence, never a
 * tenantId or a storage path). This route parses no documents, reads no file
 * bytes, writes nothing, drafts/reviews/applies/approves no delta, approves no
 * evidence package, generates no requirements/compliance/HLD/proposal, prices
 * nothing, resolves no SKU/configuration, exports nothing, looks up no
 * catalog, and calls no AI - it only invokes the read-only inspection service
 * and maps its result to HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route param id is the only project authority. The request
 * body is never read. Service results map to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean
 * project summary), ok -> 200 with { project, artifactCount, artifacts }. An
 * unexpected service error maps to a controlled 500
 * (rfp_extraction_delta_inspection_failed) that never exposes the thrown
 * error. Imports only Next.js server primitives, requireAuth, and the
 * inspection service. GET is the only exported method.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpExtractionDeltaList } from "@/lib/projects/project-rfp-extraction-delta-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpExtractionDeltaList({
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
        code: "rfp_extraction_delta_inspection_failed",
        error: "Unable to inspect extraction deltas.",
      },
      { status: 500 }
    );
  }
}
