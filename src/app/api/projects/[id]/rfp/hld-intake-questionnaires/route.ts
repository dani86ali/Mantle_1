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
 * POST - trigger creation of ONE candidate hld_intake_questionnaire from the
 * approved upstream source chain. Authenticated via requireAuth; the session tenant
 * and user and the route project id are the only authority. The request body is
 * never read. It delegates entirely to the creation
 * service, which fail-closes before any candidate drafting, drafts through the
 * existing OpenAI executor boundary (candidate-only), re-validates, and persists.
 *
 * This route is a transport adapter only: it never touches the DB or any store
 * directly, reads no raw RFP files, parses no documents, prices nothing, resolves
 * no SKU or configuration, and calls no AI or catalog. Imports only Next.js server
 * primitives, requireAuth, the read-only inspection service, and the creation
 * service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldIntakeQuestionnaireList } from "@/lib/projects/project-rfp-hld-intake-questionnaire-inspection";
import { createRfpHldIntakeQuestionnaireDraft } from "@/lib/projects/project-rfp-hld-intake-questionnaire-generation";

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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await createRfpHldIntakeQuestionnaireDraft({
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
    if (result.status === "blocked") {
      return NextResponse.json(
        {
          code: "hld_intake_questionnaire_blocked",
          error: "HLD intake questionnaire creation is blocked.",
          blockerCode: result.code,
          messages: result.messages,
        },
        { status: 409 }
      );
    }
    if (result.status === "drafting_unavailable") {
      return NextResponse.json(
        {
          code: "hld_intake_questionnaire_drafting_unavailable",
          error: "HLD intake questionnaire drafting is not available.",
        },
        { status: 503 }
      );
    }
    if (result.status === "drafting_failed") {
      return NextResponse.json(
        {
          code: "hld_intake_questionnaire_drafting_failed",
          error: "HLD intake questionnaire drafting failed.",
        },
        { status: 502 }
      );
    }
    if (result.status === "invalid_candidate_output") {
      return NextResponse.json(
        {
          code: "hld_intake_questionnaire_invalid_candidate",
          error: "HLD intake questionnaire candidate output is invalid.",
          errors: result.errors,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_intake_questionnaire_invalid_payload",
          error: "HLD intake questionnaire payload is invalid.",
          errors: result.errors,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { artifact: result.artifact, payloadSummary: result.payloadSummary },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_intake_questionnaire_creation_failed",
        error: "Unable to create HLD intake questionnaire.",
      },
      { status: 500 }
    );
  }
}
