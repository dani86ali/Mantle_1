/**
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline.
 *
 * Read-only sanitized detail of the EXACT requirements_baseline artifact
 * version named in the URL, for engineer inspection. The detail carries the
 * whitelist-copied baseline payload (marker, createdBy, createdAt, counts,
 * and requirements with locator-only evidence references) - never raw
 * evidence text, never table rows, never a tenantId, and never a storage
 * path. This route parses no documents, reads no file bytes, writes
 * nothing, approves nothing, prices nothing, resolves no SKU or
 * configuration, exports nothing, looks up no catalog, and calls no AI -
 * it only invokes the read-only inspection service and maps its result to
 * HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route params id/artifactId are the only
 * project/artifact authority. The request body is never read. Service
 * results map to HTTP: not_found -> 404 project_not_found, wrong_mode ->
 * 409 wrong_project_mode (with the lean project summary),
 * artifact_not_found -> 404 requirements_baseline_artifact_not_found,
 * artifact_not_requirements_baseline -> 409
 * artifact_not_requirements_baseline (with the lean payload-free artifact
 * summary), invalid_payload -> 409 requirements_baseline_invalid_payload
 * (with the same lean summary), ok -> 200 with { project, artifact,
 * baseline }. An unexpected service error maps to a controlled 500
 * (rfp_requirements_baseline_inspection_failed) that never exposes the
 * thrown error. Imports only Next.js server primitives, requireAuth, and
 * the inspection service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpRequirementsBaselineDetail } from "@/lib/projects/project-rfp-requirements-baseline-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpRequirementsBaselineDetail({
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
          code: "requirements_baseline_artifact_not_found",
          error: "Requirements baseline artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_requirements_baseline") {
      return NextResponse.json(
        {
          code: "artifact_not_requirements_baseline",
          error: "Artifact is not a requirements_baseline artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "requirements_baseline_invalid_payload",
          error: "Requirements baseline payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        artifact: result.artifact,
        baseline: result.baseline,
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
