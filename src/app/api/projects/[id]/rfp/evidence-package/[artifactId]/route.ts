/**
 * GET /api/projects/[id]/rfp/evidence-package/[artifactId].
 *
 * Read-only sanitized detail of ONE evidence_package artifact version - the
 * final RFP evidence content a human reviews and approves. The detail carries
 * the whitelist-copied evidence the inspection service returns: counts, the
 * chunk text bodies, and fresh table row matrices - but never a storage path,
 * never a tenantId, never provider metadata, and never a
 * SKU/catalog/pricing/configuration/export field. This route parses no
 * documents, reads no file bytes, writes nothing, drafts/reviews/applies/
 * approves no delta, drafts or approves no evidence package, generates no
 * requirements/compliance/HLD/proposal, prices nothing, resolves no
 * SKU/configuration, exports nothing, looks up no catalog, and calls no AI -
 * it only invokes the read-only inspection service and maps its result to
 * HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority, the route param id is the only project authority, and the route
 * param artifactId is the only evidence_package artifact authority. The
 * request body is never read. Service results map to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean
 * project summary), artifact_not_found -> 404
 * evidence_package_artifact_not_found, artifact_not_evidence_package -> 409
 * (with the artifact summary), invalid_payload -> 409
 * evidence_package_invalid_payload (with the artifact summary), ok -> 200 with
 * { project, artifact, package }. An unexpected service error maps to a
 * controlled 500 (rfp_evidence_package_inspection_failed) that never exposes
 * the thrown error. Imports only Next.js server primitives, requireAuth, and
 * the inspection service. GET is the only exported method.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpEvidencePackageDetail } from "@/lib/projects/project-rfp-evidence-package-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpEvidencePackageDetail({
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
          code: "evidence_package_artifact_not_found",
          error: "Evidence package artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_evidence_package") {
      return NextResponse.json(
        {
          code: "artifact_not_evidence_package",
          error: "Artifact is not an evidence_package artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "evidence_package_invalid_payload",
          error: "Evidence package payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        artifact: result.artifact,
        package: result.package,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_evidence_package_inspection_failed",
        error: "Unable to inspect evidence package.",
      },
      { status: 500 }
    );
  }
}
