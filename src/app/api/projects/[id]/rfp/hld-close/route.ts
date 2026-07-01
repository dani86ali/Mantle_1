/**
 * GET /api/projects/[id]/rfp/hld-close - deterministic read-only HLD close-status gate
 * (Stage 6J-A). Reports whether the RFP project's HLD is closed on an approved final
 * `hld_document` authority, for later TP handoff. It starts NO TP work and generates,
 * regenerates, approves, closes, exports, or downloads nothing; creates no artifact or
 * approval; calls no AI/provider; and makes no pricing/SKU/catalog/config decision.
 *
 * GET only. Authenticated via requireAuth; session.tenantId is the only tenant authority
 * and the route param id is the only project authority. The request body and query
 * string are NEVER read - this route accepts no caller-supplied authority. The service
 * result maps to stable JSON: not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode (with the lean project summary), blocked/not_closed -> 409
 * hld_not_closed (with blockerCode + any pending latestArtifact), blocked/
 * stale_final_authority -> 409 hld_close_final_authority_stale (with staleCode/
 * blockerCode + the lean artifact summary), closed -> 200 with project, closeStatus,
 * closeKind, closedAt, and the sanitized finalAuthority summary. An unexpected service
 * error maps to a controlled 500 (rfp_hld_close_status_failed) that never exposes the
 * thrown error. Imports only Next.js server primitives, requireAuth, and the close
 * -status service. No draw.io XML or payload ever appears in a response.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { getRfpHldCloseStatus } from "@/lib/projects/project-rfp-hld-close-status";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await getRfpHldCloseStatus({
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
    if (result.status === "blocked" && result.blocker === "not_closed") {
      return NextResponse.json(
        {
          code: "hld_not_closed",
          error: "No approved final HLD authority is available to close the HLD.",
          blockerCode: result.blockerCode,
          project: result.project,
          ...(result.latestArtifact !== undefined
            ? { latestArtifact: result.latestArtifact }
            : {}),
        },
        { status: 409 }
      );
    }
    if (result.status === "blocked" && result.blocker === "stale_final_authority") {
      return NextResponse.json(
        {
          code: "hld_close_final_authority_stale",
          error: "The approved final HLD authority is no longer valid to close the HLD.",
          staleCode: result.blockerCode,
          blockerCode: result.blockerCode,
          project: result.project,
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        closeStatus: result.closeStatus,
        closeKind: result.closeKind,
        closedAt: result.closedAt,
        finalAuthority: result.finalAuthority,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_close_status_failed",
        error: "Unable to compute the RFP HLD close status.",
      },
      { status: 500 }
    );
  }
}
