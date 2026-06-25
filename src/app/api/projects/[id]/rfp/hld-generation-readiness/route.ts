/**
 * GET /api/projects/[id]/rfp/hld-generation-readiness.
 *
 * Read-only Stage 6F readiness gate for future HLD generation. Authenticated via
 * requireAuth; session.tenantId is the only tenant authority and the route param
 * id is the only project authority. The request body is never read. This route
 * writes nothing, creates no artifacts, approves nothing, parses no raw files,
 * calls no AI/provider/catalog/pricing/configuration service, and generates no
 * diagram, document, HTML, XML, proposal, export, or customer deliverable.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldGenerationReadiness } from "@/lib/projects/project-rfp-hld-generation-readiness";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldGenerationReadiness({
      tenantId: session.tenantId,
      projectId: params.id,
    });

    if (result.status === "not_found") {
      return NextResponse.json(
        {
          status: result.status,
          ready: result.ready,
          blockers: result.blockers,
          warnings: result.warnings,
          nextAction: result.nextAction,
          code: "project_not_found",
          error: "Project not found.",
        },
        { status: 404 }
      );
    }

    if (result.status === "wrong_mode") {
      return NextResponse.json(
        {
          status: result.status,
          ready: result.ready,
          project: result.project,
          blockers: result.blockers,
          warnings: result.warnings,
          nextAction: result.nextAction,
          code: "wrong_project_mode",
          error: "Project is not an RFP project.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        status: "blocked",
        ready: false,
        blockers: [
          {
            code: "matching_review_missing",
            message: "Unable to inspect HLD generation readiness.",
          },
        ],
        warnings: [],
        nextAction: "Retry HLD generation readiness inspection.",
        code: "rfp_hld_generation_readiness_failed",
        error: "Unable to inspect HLD generation readiness.",
      },
      { status: 500 }
    );
  }
}
