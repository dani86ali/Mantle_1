/**
 * POST /api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/review -
 * record an approve/reject decision for the EXACT `priced_boq` artifact named in
 * the URL (the Pricing Review Approval step after the priced BoQ draft is created
 * needs_review). This route never prices, exports, expands configuration, looks up
 * a catalog, runs the runner, or calls AI - it only records one human decision.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority, session.userId is the only decidedBy authority, and the route params
 * id/artifactId are the only project / priced_boq artifact authority. The request
 * body supplies ONLY { decision, note? }; any tenantId/projectId/artifactId/
 * pricedBoqArtifactId/decidedBy/decidedAt/pricingConfig/unitListPriceSarBySku/
 * exportPath in the body is ignored. A missing/malformed body or an invalid
 * decision yields 400 invalid_priced_boq_review_request. The shared exact-artifact
 * approval service is called with allowedArtifactTypes ["priced_boq"], so it can
 * only ever approve/reject a priced_boq artifact - never a sku_resolution,
 * configuration_expansion, or export_package artifact. The service result maps to
 * HTTP: not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode
 * (with the lean project summary), artifact_not_found -> 404
 * priced_boq_artifact_not_found, artifact_not_quick_bom -> 409
 * artifact_not_priced_boq (with the artifact summary), artifact_not_reviewable ->
 * 409 priced_boq_artifact_not_reviewable (with the artifact summary),
 * approval_failed -> 409 priced_boq_review_failed, ok -> 200 with { approval,
 * artifactStatus, stageStatus, workspace }. An unexpected service error maps to a
 * controlled 500 (priced_boq_review_failed) that never exposes the thrown error.
 * Imports only Next.js server primitives, requireAuth, and the exact-artifact
 * approval service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { reviewProjectQuickBomArtifact } from "@/lib/projects/project-quick-bom-approval";

interface ParsedReviewBody {
  decision: "approved" | "rejected";
  note?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_priced_boq_review_request",
      error: "decision is required.",
    },
    { status: 400 }
  );
}

/**
 * Validate the request body to the minimal priced-BoQ review shape, or null when
 * invalid. Reads ONLY decision and an optional string note - never any tenant/
 * project/artifact/decidedBy/decidedAt/pricing/export authority field. A non-string
 * note is ignored (matching the generic approval route) rather than rejected.
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
    const result = await reviewProjectQuickBomArtifact({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: params.artifactId,
      decision: parsed.decision,
      decidedBy: session.userId,
      allowedArtifactTypes: ["priced_boq"],
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
          error: "Project is not a Quick BoM project.",
          project: result.project,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_found") {
      return NextResponse.json(
        {
          code: "priced_boq_artifact_not_found",
          error: "Priced BoQ artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_quick_bom") {
      return NextResponse.json(
        {
          code: "artifact_not_priced_boq",
          error: "Artifact is not a priced_boq artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_reviewable") {
      return NextResponse.json(
        {
          code: "priced_boq_artifact_not_reviewable",
          error: "Priced BoQ artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "approval_failed") {
      return NextResponse.json(
        {
          code: "priced_boq_review_failed",
          error: "Priced BoQ review could not be recorded.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        approval: result.approval,
        artifactStatus: result.artifactStatus,
        stageStatus: result.stageStatus,
        workspace: result.workspace,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "priced_boq_review_failed",
        error: "Unable to review priced BoQ.",
      },
      { status: 500 }
    );
  }
}
