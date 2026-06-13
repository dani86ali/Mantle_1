/**
 * POST /api/projects/[id]/rfp/files/[fileId]/boq/normalize - normalize an
 * already-recorded RFP BoQ file into a normalized_boq artifact.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route params id/fileId are the only project/file authority.
 * The request body is ignored entirely - this action operates on a file already
 * recorded by the upload step. The service result maps to HTTP: not_found -> 404,
 * wrong_mode -> 409 (with the lean project summary), file_not_found -> 404,
 * file_not_boq -> 409, invalid_format -> 400 (echoing the locked format message),
 * ok -> 201 with { artifact, payloadSummary }. An unexpected service error maps to
 * a controlled 500 that never exposes the thrown error. Imports only Next.js
 * server primitives, requireAuth, and the RFP normalization wrapper service (no
 * DB, raw BoQ loader/parser, artifact/approval/evidence store, pricing, config
 * expansion, export, runner, AI, catalog, engine, coordinator, or adapter).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { normalizeProjectRfpBoqFile } from "@/lib/projects/project-rfp-boq-normalization";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await normalizeProjectRfpBoqFile({
      tenantId: session.tenantId,
      projectId: params.id,
      fileId: params.fileId,
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
    if (result.status === "file_not_found") {
      return NextResponse.json(
        {
          code: "project_boq_file_not_found",
          error: "Project BoQ file not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "file_not_boq") {
      return NextResponse.json(
        {
          code: "project_file_not_boq",
          error: "Project file is not recorded as a BoQ/BoM file.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_format") {
      return NextResponse.json(
        { code: "invalid_boq_format", error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { artifact: result.artifact, payloadSummary: result.payloadSummary },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_boq_normalization_failed",
        error: "Unable to normalize RFP BoQ file.",
      },
      { status: 500 }
    );
  }
}
