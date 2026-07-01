/**
 * /api/projects/[id]/rfp/hld-intake/questionnaire-assisted.
 *
 * POST - create ONE reviewable hld_intake draft from a validated source
 * hld_intake_questionnaire artifact plus SE-reviewed question decisions and
 * engineer answers. session.tenantId is the only tenant authority, session.userId
 * is the only createdBy authority, and the route param id is the only project id.
 * The request body supplies ONLY { sourceQuestionnaireArtifactId, reviewedQuestions,
 * answers }; any caller-supplied sourceMode/tenantId/projectId/createdBy/createdAt/
 * status/artifact-id/authority/pricing/SKU/catalog/config field is ignored. The
 * service (never the caller) stamps sourceMode "questionnaire_assisted".
 *
 * A missing/malformed body (not a JSON object carrying a nonblank
 * sourceQuestionnaireArtifactId, a reviewedQuestions array, and an answers array),
 * or a known semantic validation failure raised by the service, maps to 400
 * invalid_rfp_hld_intake_request (never a 500). Result maps to HTTP: not_found ->
 * 404, source_not_found -> 404, wrong_mode -> 409, source_not_usable -> 409,
 * invalid_source_payload -> 409, ok -> 201 with { artifact, payloadSummary }; an
 * unexpected service error maps to a controlled 500.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files, parses no documents, prices nothing, resolves no SKU or
 * configuration, and calls no AI or catalog. Imports only Next.js server
 * primitives, requireAuth, and the HLD intake service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  createRfpHldIntakeFromQuestionnaireDraft,
  isRfpHldIntakeValidationError,
  type RfpHldIntakeQuestionAnswerInput,
  type RfpHldIntakeReviewedQuestionInput,
} from "@/lib/projects/project-rfp-hld-intake";

interface ParsedCreateBody {
  sourceQuestionnaireArtifactId: string;
  reviewedQuestions: RfpHldIntakeReviewedQuestionInput[];
  answers: RfpHldIntakeQuestionAnswerInput[];
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_hld_intake_request",
      error:
        "sourceQuestionnaireArtifactId, reviewedQuestions, and answers are required.",
    },
    { status: 400 }
  );
}

/**
 * Validate the request body to the minimal create shape, or null when invalid.
 * Reads ONLY sourceQuestionnaireArtifactId (a nonblank string), reviewedQuestions
 * (an array), and answers (an array); the service owns review/answer semantics. A
 * caller-supplied sourceMode/tenant/project/createdBy/status/authority field is
 * NEVER read - the service is the sole authority for the recorded sourceMode.
 */
function parseCreateBody(body: unknown): ParsedCreateBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const { sourceQuestionnaireArtifactId, reviewedQuestions, answers } =
    body as Record<string, unknown>;
  if (
    typeof sourceQuestionnaireArtifactId !== "string" ||
    sourceQuestionnaireArtifactId.trim() === ""
  ) {
    return null;
  }
  if (!Array.isArray(reviewedQuestions)) return null;
  if (!Array.isArray(answers)) return null;
  return {
    sourceQuestionnaireArtifactId,
    reviewedQuestions: reviewedQuestions as RfpHldIntakeReviewedQuestionInput[],
    answers: answers as RfpHldIntakeQuestionAnswerInput[],
  };
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
  const parsed = parseCreateBody(body);
  if (parsed === null) return invalidRequest();

  try {
    const result = await createRfpHldIntakeFromQuestionnaireDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      createdBy: session.userId,
      sourceQuestionnaireArtifactId: parsed.sourceQuestionnaireArtifactId,
      reviewedQuestions: parsed.reviewedQuestions,
      answers: parsed.answers,
    });

    if (result.status === "not_found") {
      return NextResponse.json(
        { code: "project_not_found", error: "Project not found." },
        { status: 404 }
      );
    }
    if (result.status === "source_not_found") {
      return NextResponse.json(
        {
          code: "source_questionnaire_not_found",
          error: "Source HLD intake questionnaire not found.",
        },
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
    if (result.status === "source_not_usable") {
      return NextResponse.json(
        {
          code: "source_questionnaire_not_usable",
          error: "Source HLD intake questionnaire is not usable input.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_source_payload") {
      return NextResponse.json(
        {
          code: "source_questionnaire_invalid",
          error: "Source HLD intake questionnaire payload is invalid.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { artifact: result.artifact, payloadSummary: result.payloadSummary },
      { status: 201 }
    );
  } catch (error) {
    // Known request-derived validation failures (malformed review/answer semantics
    // the service rejects before any store call) map to 400; everything else is a
    // controlled 500 that never exposes the thrown error.
    if (isRfpHldIntakeValidationError(error)) return invalidRequest();
    return NextResponse.json(
      {
        code: "rfp_hld_intake_failed",
        error: "Unable to create RFP HLD intake draft.",
      },
      { status: 500 }
    );
  }
}
