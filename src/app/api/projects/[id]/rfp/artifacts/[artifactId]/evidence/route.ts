/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/evidence.
 *
 * Runs RFP extraction-evidence persistence for the EXACT approved
 * input_package artifact named in the URL, with duplicate protection. This
 * route never parses documents itself, never reads file bytes, builds no
 * downstream artifacts, creates no approvals, prices nothing, looks up no
 * catalog, and calls no AI - it only invokes the deterministic evidence-run
 * service and maps its result to HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route params id/artifactId are the only project/artifact
 * authority. The request body is ignored entirely - it is never read, so no
 * body-supplied tenant/project/artifact/status/evidence field can reach the
 * service. The service result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean
 * project summary), input_package_not_found -> 404
 * input_package_artifact_not_found, artifact_not_input_package -> 409 (with
 * the artifact summary), input_package_not_approved -> 409 (with the
 * artifact summary), input_package_has_no_source_files -> 409 (with the
 * artifact summary), source_file_not_found -> 409
 * input_package_source_file_not_found (with the missing file id),
 * quality_gate_failed -> 422 rfp_extraction_quality_gate_failed (with
 * artifact/files/quality summaries), evidence_already_exists -> 409
 * rfp_evidence_already_exists (with counts and lean evidence summaries), ok
 * -> 201 with { artifact, quality, evidenceCount, textChunkCount,
 * tableEvidenceCount, evidence }. Responses never include a storagePath, a
 * tenantId, raw text, or table rows - the service only returns lean
 * summaries. An unexpected service error maps to a controlled 500
 * (rfp_evidence_persistence_failed) that never exposes the thrown error.
 * Imports only Next.js server primitives, requireAuth, and the evidence-run
 * service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { runRfpExtractionEvidencePersistence } from "@/lib/projects/project-rfp-evidence-run";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await runRfpExtractionEvidencePersistence({
      tenantId: session.tenantId,
      projectId: params.id,
      inputPackageArtifactId: params.artifactId,
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
    if (result.status === "source_file_not_found") {
      return NextResponse.json(
        {
          code: "input_package_source_file_not_found",
          error: "Input package references a missing source file.",
          missingFileId: result.missingFileId,
        },
        { status: 409 }
      );
    }
    if (result.status === "quality_gate_failed") {
      return NextResponse.json(
        {
          code: "rfp_extraction_quality_gate_failed",
          error: "RFP extraction quality gate failed.",
          artifact: result.artifact,
          files: result.files,
          quality: result.quality,
        },
        { status: 422 }
      );
    }
    if (result.status === "evidence_already_exists") {
      return NextResponse.json(
        {
          code: "rfp_evidence_already_exists",
          error:
            "RFP extraction evidence already exists for this input package.",
          evidenceCount: result.evidenceCount,
          textChunkCount: result.textChunkCount,
          tableEvidenceCount: result.tableEvidenceCount,
          evidence: result.evidence,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        quality: result.quality,
        evidenceCount: result.evidenceCount,
        textChunkCount: result.textChunkCount,
        tableEvidenceCount: result.tableEvidenceCount,
        evidence: result.evidence,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_evidence_persistence_failed",
        error: "Unable to persist RFP extraction evidence.",
      },
      { status: 500 }
    );
  }
}
