/**
 * POST /api/projects/[id]/rfp/input-package - create one reviewable
 * input_package draft artifact from the Project's already-recorded files.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only
 * tenant authority and the route param is the only project id. The request
 * body is ignored entirely - the draft is built from already-recorded
 * project_files rows, so body tenant/project/status fields never reach the
 * service. The service result maps to HTTP: not_found -> 404, wrong_mode ->
 * 409 (with the lean project summary), no_files -> 409, missing_rfp_file ->
 * 409, ok -> 201 with { artifact, payloadSummary }. An unexpected service
 * error maps to a controlled 500 that never exposes the thrown error.
 * Imports only Next.js server primitives, requireAuth, and the input-package
 * service (no DB, parser/loader, artifact/approval/evidence store, pricing,
 * config expansion, export, runner, AI, catalog, engine, coordinator, or
 * adapter).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createRfpInputPackageDraft } from "@/lib/projects/project-rfp-input-package";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await createRfpInputPackageDraft({
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
    if (result.status === "no_files") {
      return NextResponse.json(
        {
          code: "rfp_input_package_no_files",
          error: "Project has no recorded files to package for review.",
        },
        { status: 409 }
      );
    }
    if (result.status === "missing_rfp_file") {
      return NextResponse.json(
        {
          code: "rfp_input_package_missing_rfp_file",
          error:
            "Project has no file recorded with the rfp role; upload the RFP document first.",
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
        code: "rfp_input_package_failed",
        error: "Unable to create RFP input package draft.",
      },
      { status: 500 }
    );
  }
}
