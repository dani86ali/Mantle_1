/**
 * /api/projects/[id]/rfp/requirements-baseline.
 *
 * POST - DISABLED. The legacy direct-create path built a
 * requirements_baseline draft from raw persisted evidence ids supplied in the
 * request body. Requirements baseline creation now happens only through
 * /requirements-baseline/generate, which derives requirements from one
 * approved final evidence_package artifact. The POST handler is kept so the
 * route still answers the verb, but it is a controlled, disabled endpoint: it
 * authenticates, then returns 405 without reading the body or calling any
 * create/generation service. No candidates, evidenceIds, or any other body
 * field is parsed, so raw evidence ids can never reach a service argument.
 *
 * GET - read-only list of the Project's requirements_baseline artifact
 * versions for engineer inspection. Authenticated via requireAuth;
 * session.tenantId is the only tenant authority and the route param id is the
 * only project authority. The request body is never read. It calls only the
 * read-only inspection service and maps its result to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean
 * project summary), ok -> 200 with { project, artifactCount, artifacts } -
 * identifiers, ISO dates, counts, and whitelisted payload summaries only,
 * never requirement text, raw evidence text, table rows, a tenantId, or a
 * storage path. An unexpected service error maps to a controlled 500
 * (rfp_requirements_baseline_inspection_failed) that never exposes the thrown
 * error.
 *
 * This route is a transport adapter only: it never touches the DB or any
 * store, parses no files, reads no raw text or storage path, creates no
 * approval, prices nothing, resolves no SKU or configuration, exports
 * nothing, and calls no AI or catalog. Imports only Next.js server
 * primitives, requireAuth, and the read-only requirements-baseline inspection
 * service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpRequirementsBaselineList } from "@/lib/projects/project-rfp-requirements-baseline-inspection";

export async function POST(
  request: NextRequest,
  _context: { params: { id: string } }
) {
  void _context;
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  // Disabled: no body read, no parsing, no create/generation service call.
  return NextResponse.json(
    {
      code: "rfp_requirements_baseline_direct_create_disabled",
      error:
        "Create requirements baselines through approved final evidence package generation.",
    },
    { status: 405 }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpRequirementsBaselineList({
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
        code: "rfp_requirements_baseline_inspection_failed",
        error: "Unable to inspect requirements baseline.",
      },
      { status: 500 }
    );
  }
}
