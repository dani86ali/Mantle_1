/**
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/hld-intake-questionnaire.
 *
 * Read-only sanitized detail of the EXACT hld_intake_questionnaire artifact named
 * in the URL, for engineer review. The questionnaire is CANDIDATE / review input,
 * not authority: this route writes nothing, approves nothing, drafts nothing,
 * prices nothing, resolves no SKU or configuration, looks up no catalog, and calls
 * no AI - it only invokes the read-only inspection service and maps its result to
 * HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority and
 * the route params id/artifactId are the only project/artifact authority. The
 * request body is never read. Result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), artifact_not_found -> 404
 * hld_intake_questionnaire_artifact_not_found, artifact_not_questionnaire -> 409
 * artifact_not_hld_intake_questionnaire (with the lean payload-free artifact
 * summary), invalid_questionnaire_payload -> 409
 * hld_intake_questionnaire_invalid_payload (with the same lean summary), ok -> 200
 * with { project, artifact, questionnaire }. An unexpected service error maps to a
 * controlled 500 that never exposes the thrown error. Imports only Next.js server
 * primitives, requireAuth, and the inspection service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldIntakeQuestionnaireDetail } from "@/lib/projects/project-rfp-hld-intake-questionnaire-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldIntakeQuestionnaireDetail({
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
          code: "hld_intake_questionnaire_artifact_not_found",
          error: "HLD intake questionnaire artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_questionnaire") {
      return NextResponse.json(
        {
          code: "artifact_not_hld_intake_questionnaire",
          error: "Artifact is not an hld_intake_questionnaire artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_questionnaire_payload") {
      return NextResponse.json(
        {
          code: "hld_intake_questionnaire_invalid_payload",
          error: "HLD intake questionnaire payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        artifact: result.artifact,
        questionnaire: result.questionnaire,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_intake_questionnaire_inspection_failed",
        error: "Unable to inspect HLD intake questionnaire.",
      },
      { status: 500 }
    );
  }
}
