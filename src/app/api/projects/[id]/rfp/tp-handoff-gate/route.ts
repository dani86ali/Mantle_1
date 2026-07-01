/**
 * GET /api/projects/[id]/rfp/tp-handoff-gate - deterministic read-only TP HANDOFF gate
 * (Stage TP-H0). Reports whether technical-proposal work may begin, which is allowed
 * ONLY once the RFP project's HLD is closed on an approved final `hld_document`
 * authority. It starts NO TP work and generates, approves, exports, or downloads
 * nothing; creates no technical_proposal artifact or approval; calls no AI/provider; and
 * makes no pricing/SKU/catalog/config decision.
 *
 * GET only. Authenticated via requireAuth; session.tenantId is the only tenant authority
 * and the route param id is the only project authority. The request body and query
 * string are NEVER read - this route accepts no caller-supplied authority. The service
 * result maps to stable JSON: not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode (with the lean project summary), blocked -> 409 tp_handoff_blocked
 * (with gateStatus, blockerCode, hldCloseBlockerCode, project, and any latestArtifact/
 * artifact), ready -> 200 with project, gateStatus, and the sanitized hldClose summary.
 * An unexpected service error maps to a controlled 500 (rfp_tp_handoff_gate_failed) that
 * never exposes the thrown error. Imports only Next.js server primitives, requireAuth,
 * and the TP handoff gate service. No draw.io XML or payload ever appears in a response,
 * and no TP/proposal/export/download URL is generated.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { getRfpTpHandoffGate } from "@/lib/projects/project-rfp-tp-handoff-gate";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await getRfpTpHandoffGate({
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
    if (result.status === "blocked") {
      return NextResponse.json(
        {
          code: "tp_handoff_blocked",
          error: "TP handoff is blocked until the HLD is closed.",
          gateStatus: result.gateStatus,
          blockerCode: result.blockerCode,
          hldCloseBlockerCode: result.hldCloseBlockerCode,
          project: result.project,
          ...("latestArtifact" in result && result.latestArtifact !== undefined
            ? { latestArtifact: result.latestArtifact }
            : {}),
          ...("artifact" in result ? { artifact: result.artifact } : {}),
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        gateStatus: result.gateStatus,
        hldClose: result.hldClose,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_tp_handoff_gate_failed",
        error: "Unable to compute the RFP TP handoff gate.",
      },
      { status: 500 }
    );
  }
}
