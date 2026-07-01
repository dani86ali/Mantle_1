/**
 * /api/projects/[id]/rfp/hld-intake-questionnaires.
 *
 * GET - read-only list of the Project's hld_intake_questionnaire artifact
 * versions for engineer review. Authenticated via requireAuth; session.tenantId
 * is the only tenant authority and the route param id is the only project
 * authority. The request body is never read. Result maps to HTTP: not_found ->
 * 404 project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean
 * project summary), ok -> 200 with { project, artifactCount, artifacts }. An
 * unexpected service error maps to a controlled 500 that never exposes the thrown
 * error.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files, parses no documents, prices nothing, resolves no SKU or
 * configuration, and calls no AI or catalog. Imports only Next.js server
 * primitives, requireAuth, and the read-only inspection service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldIntakeQuestionnaireList } from "@/lib/projects/project-rfp-hld-intake-questionnaire-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldIntakeQuestionnaireList({
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
        code: "rfp_hld_intake_questionnaire_inspection_failed",
        error: "Unable to inspect HLD intake questionnaires.",
      },
      { status: 500 }
    );
  }
}
