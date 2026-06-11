/**
 * GET /api/projects/[id]/rfp/evidence/[evidenceId].
 *
 * Read-only sanitized detail of ONE persisted RFP extraction evidence row,
 * for engineer inspection. The detail may carry the persisted text body or
 * the copied table rows matrix - both come from the whitelist-copying
 * inspection service - but never a tenantId and never a storagePath. This
 * route parses no documents, reads no file bytes, writes nothing, approves
 * nothing, prices nothing, looks up no catalog, and calls no AI - it only
 * invokes the read-only inspection service and maps its result to HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route params id/evidenceId are the only
 * project/evidence authority. The request body is never read. Service
 * results map to HTTP: not_found -> 404 project_not_found, wrong_mode ->
 * 409 wrong_project_mode (with the lean project summary),
 * evidence_not_found -> 404 rfp_evidence_not_found (also covering evidence
 * of non-RFP-extraction kinds, which this surface never exposes), ok -> 200
 * with { project, evidence }. An unexpected service error maps to a
 * controlled 500 (rfp_evidence_inspection_failed) that never exposes the
 * thrown error. Imports only Next.js server primitives, requireAuth, and
 * the inspection service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpProjectEvidenceDetail } from "@/lib/projects/project-rfp-evidence-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; evidenceId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpProjectEvidenceDetail({
      tenantId: session.tenantId,
      projectId: params.id,
      evidenceItemId: params.evidenceId,
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
    if (result.status === "evidence_not_found") {
      return NextResponse.json(
        { code: "rfp_evidence_not_found", error: "RFP evidence item not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { project: result.project, evidence: result.evidence },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_evidence_inspection_failed",
        error: "Unable to inspect RFP evidence.",
      },
      { status: 500 }
    );
  }
}
