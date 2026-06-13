/**
 * GET /api/projects/[id]/rfp/boq - read-only RFP BoQ workspace read model.
 * GET only. Authenticated via requireAuth; the workspace loader is tenant-scoped
 * on session.tenantId. Maps the loader's discriminated result to HTTP:
 * not_found -> 404, wrong_mode -> 409, ok -> 200. An unexpected loader error maps
 * to a controlled 500 that never exposes the thrown error. Imports only Next.js
 * server primitives, requireAuth, and the workspace loader (no DB/AI/catalog/engine).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadProjectRfpBoqWorkspace } from "@/lib/projects/project-rfp-boq-workspace";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadProjectRfpBoqWorkspace(session.tenantId, params.id);

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

    return NextResponse.json({ workspace: result.workspace }, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        code: "project_rfp_boq_workspace_failed",
        error: "Unable to load RFP BoQ workspace.",
      },
      { status: 500 }
    );
  }
}
