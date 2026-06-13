/**
 * GET /api/projects/[id]/rfp/extraction-delta/[artifactId].
 *
 * Read-only sanitized detail of ONE extraction_delta artifact version, for
 * engineer/AI review. The detail may carry each candidate's proposedEvidence
 * and review history - both come from the whitelist-copying inspection service
 * and are an engineer/AI proposal and review trail surfaced for review, never
 * final authority - but never raw evidence text, never persisted evidence
 * table rows, never a tenantId, and never a storage path. This route parses no
 * documents, reads no file bytes, writes nothing, drafts/reviews/applies/
 * approves no delta, approves no evidence package, generates no
 * requirements/compliance/HLD/proposal, prices nothing, resolves no
 * SKU/configuration, exports nothing, looks up no catalog, and calls no AI -
 * it only invokes the read-only inspection service and maps its result to
 * HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority, the route param id is the only project authority, and the route
 * param artifactId is the only extraction_delta artifact authority. The
 * request body is never read. Service results map to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean
 * project summary), artifact_not_found -> 404
 * extraction_delta_artifact_not_found, artifact_not_extraction_delta -> 409
 * (with the artifact summary), invalid_payload -> 409
 * extraction_delta_invalid_payload (with the artifact summary), ok -> 200 with
 * { project, artifact, delta }. An unexpected service error maps to a
 * controlled 500 (rfp_extraction_delta_inspection_failed) that never exposes
 * the thrown error. Imports only Next.js server primitives, requireAuth, and
 * the inspection service. GET is the only exported method.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpExtractionDeltaDetail } from "@/lib/projects/project-rfp-extraction-delta-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpExtractionDeltaDetail({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: params.artifactId,
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
    if (result.status === "artifact_not_found") {
      return NextResponse.json(
        {
          code: "extraction_delta_artifact_not_found",
          error: "Extraction delta artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_extraction_delta") {
      return NextResponse.json(
        {
          code: "artifact_not_extraction_delta",
          error: "Artifact is not an extraction_delta artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "extraction_delta_invalid_payload",
          error: "Extraction delta payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        artifact: result.artifact,
        delta: result.delta,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_extraction_delta_inspection_failed",
        error: "Unable to inspect extraction delta.",
      },
      { status: 500 }
    );
  }
}
