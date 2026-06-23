/**
 * POST /api/projects/[id]/rfp/boq/no-boq-exception - record an explicit no-BoQ /
 * service-only exception for an RFP project.
 *
 * POST only. Authenticated via requireAuth; the service is tenant-scoped on
 * session.tenantId and the requester is session.userId. The body carries only a
 * reason; any authority fields supplied by the caller are ignored. Maps the
 * service's discriminated result to HTTP and never exposes a thrown error.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createRfpNoBoqServiceOnlyException } from "@/lib/projects/project-rfp-no-boq-exception";

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_no_boq_exception_request",
      error: "reason is required.",
    },
    { status: 400 }
  );
}

/** Read a nonblank reason from the request body, or null when invalid. */
function parseReason(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const reason = (body as Record<string, unknown>).reason;
  if (typeof reason !== "string" || reason.trim() === "") return null;
  return reason;
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
  const reason = parseReason(body);
  if (reason === null) return invalidRequest();

  try {
    const result = await createRfpNoBoqServiceOnlyException({
      tenantId: session.tenantId,
      projectId: params.id,
      reason,
      requestedBy: session.userId,
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
    if (result.status === "boq_files_present") {
      return NextResponse.json(
        {
          code: "rfp_boq_files_present",
          error: "This RFP project has BoQ files, so the exception does not apply.",
        },
        { status: 409 }
      );
    }
    if (result.status === "exception_already_exists") {
      return NextResponse.json(
        {
          code: "rfp_no_boq_exception_already_exists",
          error: "A no-BoQ exception already stands for this RFP project.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
        workspace: result.workspace,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_no_boq_exception_failed",
        error: "Unable to record the no-BoQ exception.",
      },
      { status: 500 }
    );
  }
}
