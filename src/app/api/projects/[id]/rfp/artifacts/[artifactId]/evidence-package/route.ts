/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/evidence-package.
 *
 * Creates ONE reviewable evidence_package draft from the EXACT approved
 * input_package artifact named in the URL. This route is only the transport
 * adapter for the deterministic draft service: it never reads file bytes,
 * parses documents, extracts, creates approvals, reviews deltas, generates
 * requirements/compliance/HLD/proposal, prices, exports, resolves SKUs,
 * expands configuration, looks up a catalog, runs the runner, or calls AI.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority, session.userId is the only createdBy authority, and route params
 * id/artifactId are the only project/package authority. The request body is
 * ignored entirely, so no body-supplied tenant/project/artifact/status/source/
 * payload/evidence/delta/pricing/SKU/config/export field can reach the
 * service. Service results map to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode, input_package_not_found -> 404
 * input_package_artifact_not_found, artifact_not_input_package -> 409,
 * input_package_not_approved -> 409, input_package_has_no_source_files -> 409,
 * extraction_evidence_not_found -> 409, source_file_evidence_missing -> 422,
 * ok -> 201 with { artifact, payloadSummary }. An unexpected service error
 * maps to a controlled 500 that never exposes the thrown error.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createRfpEvidencePackageDraft } from "@/lib/projects/project-rfp-evidence-package";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await createRfpEvidencePackageDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      inputPackageArtifactId: params.artifactId,
      createdBy: session.userId,
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
    if (result.status === "input_package_not_found") {
      return NextResponse.json(
        {
          code: "input_package_artifact_not_found",
          error: "Input package artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_input_package") {
      return NextResponse.json(
        {
          code: "artifact_not_input_package",
          error: "Artifact is not an approved input_package artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "input_package_not_approved") {
      return NextResponse.json(
        {
          code: "input_package_not_approved",
          error: "Input package artifact is not approved.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "input_package_has_no_source_files") {
      return NextResponse.json(
        {
          code: "input_package_has_no_source_files",
          error: "Input package has no source files.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "extraction_evidence_not_found") {
      return NextResponse.json(
        {
          code: "rfp_extraction_evidence_not_found",
          error: "No persisted RFP extraction evidence was found for this input package.",
          inputPackageArtifactId: result.inputPackageArtifactId,
        },
        { status: 409 }
      );
    }
    if (result.status === "source_file_evidence_missing") {
      return NextResponse.json(
        {
          code: "rfp_evidence_package_source_file_evidence_missing",
          error: "One or more package source files have no extraction evidence.",
          missingSourceFileIds: result.missingSourceFileIds,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_evidence_package_failed",
        error: "Unable to create RFP evidence package draft.",
      },
      { status: 500 }
    );
  }
}
