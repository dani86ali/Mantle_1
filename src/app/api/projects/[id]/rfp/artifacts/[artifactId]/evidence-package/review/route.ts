/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/evidence-package/review.
 *
 * Records an approve/reject decision for the EXACT evidence_package artifact
 * named in the URL (the final evidence-package gate after the draft service
 * creates the needs_review version). This route never reads file contents,
 * parses documents, extracts, builds or mutates evidence, applies or rereads
 * extraction delta candidates, generates requirements/compliance/HLD/
 * proposal, prices, exports, resolves SKUs, expands configuration, looks up
 * a catalog, runs the runner, or calls AI - it only records one human
 * decision via the evidence-package approval service.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant
 * authority, session.userId is the only decidedBy authority, and the route
 * params id/artifactId are the only project/artifact authority. The request
 * body supplies ONLY { decision, note? }; any tenantId/projectId/artifactId/
 * artifactVersion/decidedBy/decidedAt/status/sourceFileIds/sourceArtifactIds/
 * payload/evidence/candidates/proposedEvidence/pricing/SKU/config/export
 * field in the body is ignored. A missing/malformed body or an invalid
 * decision yields 400 invalid_rfp_evidence_package_review_request. The
 * service result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary),
 * artifact_not_found -> 404 evidence_package_artifact_not_found,
 * artifact_not_evidence_package -> 409 artifact_not_evidence_package (with
 * the artifact summary), artifact_not_reviewable -> 409
 * evidence_package_artifact_not_reviewable (with the artifact summary),
 * invalid_evidence_package_payload -> 422 rfp_evidence_package_invalid_payload
 * (with the artifact summary), source_artifact_not_found -> 409
 * rfp_evidence_package_source_artifact_not_found (with the missing ids),
 * source_artifact_invalid -> 409 rfp_evidence_package_source_artifact_invalid
 * (with the offending artifact summaries), extraction_delta_payload_invalid
 * -> 409 rfp_extraction_delta_payload_invalid (with the source locators),
 * extraction_delta_candidates_pending -> 409
 * rfp_extraction_delta_candidates_pending (with the pending sources),
 * approval_failed -> 409 evidence_package_review_failed, ok -> 200 with
 * { approval, artifactStatus, stageStatus, artifact } plus payloadSummary
 * only when the service result carries one (approved decisions). An
 * unexpected service error maps to a controlled 500
 * (evidence_package_review_failed) that never exposes the thrown error.
 * Imports only Next.js server primitives, requireAuth, and the
 * evidence-package approval service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { reviewRfpEvidencePackageArtifact } from "@/lib/projects/project-rfp-evidence-package-approval";

interface ParsedReviewBody {
  decision: "approved" | "rejected";
  note?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_evidence_package_review_request",
      error: "decision is required.",
    },
    { status: 400 }
  );
}

/**
 * Validate the request body to the minimal review shape, or null when invalid.
 * Reads ONLY decision and an optional string note - never any tenant/project/
 * artifact/decidedBy/decidedAt/status/source/payload authority field. A
 * non-string note is ignored (matching the requirements-baseline review
 * route) rather than rejected.
 */
function parseReviewBody(body: unknown): ParsedReviewBody | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const { decision, note } = record;
  if (decision !== "approved" && decision !== "rejected") return null;
  return {
    decision,
    ...(typeof note === "string" ? { note } : {}),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  const parsed = parseReviewBody(body);
  if (parsed === null) return invalidRequest();

  try {
    const result = await reviewRfpEvidencePackageArtifact({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: params.artifactId,
      decision: parsed.decision,
      decidedBy: session.userId,
      ...(parsed.note !== undefined ? { note: parsed.note } : {}),
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
          error: "Artifact is not a reviewable evidence_package artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_reviewable") {
      return NextResponse.json(
        {
          code: "evidence_package_artifact_not_reviewable",
          error: "Evidence package artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_evidence_package_payload") {
      return NextResponse.json(
        {
          code: "rfp_evidence_package_invalid_payload",
          error: "Evidence package payload is not approvable.",
          artifact: result.artifact,
        },
        { status: 422 }
      );
    }
    if (result.status === "source_artifact_not_found") {
      return NextResponse.json(
        {
          code: "rfp_evidence_package_source_artifact_not_found",
          error: "One or more evidence package source artifacts were not found.",
          missingSourceArtifactIds: result.missingSourceArtifactIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "source_artifact_invalid") {
      return NextResponse.json(
        {
          code: "rfp_evidence_package_source_artifact_invalid",
          error: "One or more evidence package source artifacts are invalid.",
          artifacts: result.artifacts,
        },
        { status: 409 }
      );
    }
    if (result.status === "extraction_delta_payload_invalid") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_payload_invalid",
          error: "One or more extraction delta source payloads are invalid.",
          sources: result.sources,
        },
        { status: 409 }
      );
    }
    if (result.status === "extraction_delta_candidates_pending") {
      return NextResponse.json(
        {
          code: "rfp_extraction_delta_candidates_pending",
          error:
            "One or more extraction delta candidates are still pending review.",
          sources: result.sources,
        },
        { status: 409 }
      );
    }
    if (result.status === "approval_failed") {
      return NextResponse.json(
        {
          code: "evidence_package_review_failed",
          error: "Evidence package review could not be recorded.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        approval: result.approval,
        artifactStatus: result.artifactStatus,
        stageStatus: result.stageStatus,
        artifact: result.artifact,
        ...(result.payloadSummary !== undefined
          ? { payloadSummary: result.payloadSummary }
          : {}),
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "evidence_package_review_failed",
        error: "Unable to review evidence package.",
      },
      { status: 500 }
    );
  }
}
