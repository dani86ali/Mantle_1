/**
 * /api/projects/[id]/rfp/hld-intake.
 *
 * GET - read-only list of the Project's hld_intake artifact versions for
 * engineer inspection. Authenticated via requireAuth; session.tenantId is the
 * only tenant authority and the route param id is the only project authority.
 * The request body is never read. Result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean
 * project summary), ok -> 200 with { project, artifactCount, artifacts }.
 *
 * POST - create ONE reviewable hld_intake draft from engineer-authored intake
 * answers. session.tenantId is the only tenant authority, session.userId is the
 * only createdBy authority, and the route param id is the only project id. The
 * request body supplies ONLY { answers }; any caller-supplied tenantId/
 * projectId/createdBy/createdAt/status/artifact-id/authority/pricing/SKU/config
 * field is ignored. A missing/malformed body (not a JSON object carrying an
 * answers array) yields 400 invalid_rfp_hld_intake_request; a known semantic
 * answer validation failure raised by the service is also mapped to 400
 * invalid_rfp_hld_intake_request (never a 500). Result maps to HTTP: not_found ->
 * 404, wrong_mode -> 409, ok -> 201 with { artifact, payloadSummary }; an
 * unexpected service error maps to a controlled 500.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, prices nothing,
 * resolves no SKU or configuration, and calls no AI or catalog. Imports only
 * Next.js server primitives, requireAuth, and the HLD intake services.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldIntakeList } from "@/lib/projects/project-rfp-hld-intake-inspection";
import {
  createRfpHldIntakeDraft,
  isRfpHldIntakeValidationError,
  type RfpHldIntakeAnswerInput,
} from "@/lib/projects/project-rfp-hld-intake";

interface ParsedCreateBody {
  answers: RfpHldIntakeAnswerInput[];
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_hld_intake_request",
      error: "answers array is required.",
    },
    { status: 400 }
  );
}

/**
 * Validate the request body to the minimal create shape, or null when invalid.
 * Reads ONLY answers (an array); the service validates answer semantics. No
 * tenant/project/createdBy/status/authority field is ever read from the body.
 */
function parseCreateBody(body: unknown): ParsedCreateBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const { answers } = body as Record<string, unknown>;
  if (!Array.isArray(answers)) return null;
  return { answers: answers as RfpHldIntakeAnswerInput[] };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldIntakeList({
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
        code: "rfp_hld_intake_inspection_failed",
        error: "Unable to inspect HLD intake.",
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
  const parsed = parseCreateBody(body);
  if (parsed === null) return invalidRequest();

  try {
    const result = await createRfpHldIntakeDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      createdBy: session.userId,
      answers: parsed.answers,
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
      { artifact: result.artifact, payloadSummary: result.payloadSummary },
      { status: 201 }
    );
  } catch (error) {
    // Known request-derived validation failures (malformed answer semantics the
    // service rejects before any store call) map to 400; everything else is a
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
