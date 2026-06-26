/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram/review.
 *
 * Records one human approve/reject decision for the EXACT internal hld_diagram draft
 * artifact named in the URL (the HLD diagram-draft review gate). This route never
 * reads file contents, parses documents, generates downstream artifacts, prices,
 * looks up a catalog, resolves SKUs or configuration, calls AI, or produces any final
 * HLD document / diagram markup - it only records one decision.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority,
 * session.userId is the only decidedBy authority, and the route params id/artifactId
 * are the only project/artifact authority. The request body is STRICT: a plain object
 * with ONLY a client-facing { decision: "approve" | "reject", note? } - decision is
 * mapped to the service's canonical "approved" | "rejected". Any extra key (including
 * tenantId/projectId/artifactId/decidedBy/status/payload/source/authority/pricing/
 * SKU/catalog/config/provider/final-output fields), a non-string note, a non-object
 * body, or an invalid decision yields 400 invalid_rfp_hld_diagram_review_request. A
 * present note is trimmed and omitted when blank.
 *
 * Result maps to HTTP: not_found -> 404 project_not_found, wrong_mode -> 409
 * wrong_project_mode (with the lean project summary), artifact_not_found -> 404
 * hld_diagram_artifact_not_found, artifact_not_hld_diagram -> 409
 * artifact_not_hld_diagram (with the artifact summary), artifact_not_reviewable -> 409
 * hld_diagram_artifact_not_reviewable (with the artifact summary),
 * invalid_hld_diagram_payload -> 409 hld_diagram_payload_invalid (with the artifact
 * summary), stale_hld_diagram_source_chain -> 409 hld_diagram_source_chain_stale (with
 * the artifact summary and the stable staleCode, never raw messages/payload),
 * approval_failed -> 409 hld_diagram_review_failed, ok -> 200 with { approval,
 * artifactStatus, stageStatus, artifact }. An unexpected service error maps to a
 * controlled 500 that never exposes the thrown error. Imports only Next.js server
 * primitives, requireAuth, and the HLD diagram approval service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { reviewRfpHldDiagramArtifact } from "@/lib/projects/project-rfp-hld-diagram-approval";

const ALLOWED_KEYS: ReadonlySet<string> = new Set(["decision", "note"]);

interface ParsedReviewBody {
  decision: "approved" | "rejected";
  note?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_hld_diagram_review_request",
      error: "decision is required.",
    },
    { status: 400 }
  );
}

/**
 * Strictly validate the request body to the minimal client review shape, or null when
 * invalid. The body must be a plain object whose only keys are "decision" and an
 * optional "note"; any extra key (tenant/project/artifact/decidedBy/status/payload/
 * source/authority/pricing/SKU/catalog/config/provider/final-output) is rejected. The
 * client decision "approve"/"reject" is mapped to the canonical "approved"/"rejected".
 * A present note must be a string and is trimmed; a blank trimmed note is omitted.
 */
function parseReviewBody(body: unknown): ParsedReviewBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) return null;
  }

  const { decision, note } = record;
  if (decision !== "approve" && decision !== "reject") return null;

  let trimmedNote: string | undefined;
  if ("note" in record) {
    if (typeof note !== "string") return null;
    const trimmed = note.trim();
    if (trimmed !== "") trimmedNote = trimmed;
  }

  return {
    decision: decision === "approve" ? "approved" : "rejected",
    ...(trimmedNote !== undefined ? { note: trimmedNote } : {}),
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
    const result = await reviewRfpHldDiagramArtifact({
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
          code: "hld_diagram_artifact_not_found",
          error: "HLD diagram draft artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_hld_diagram") {
      return NextResponse.json(
        {
          code: "artifact_not_hld_diagram",
          error: "Artifact is not a reviewable hld_diagram artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_reviewable") {
      return NextResponse.json(
        {
          code: "hld_diagram_artifact_not_reviewable",
          error: "HLD diagram draft artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_hld_diagram_payload") {
      return NextResponse.json(
        {
          code: "hld_diagram_payload_invalid",
          error: "HLD diagram draft payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "stale_hld_diagram_source_chain") {
      return NextResponse.json(
        {
          code: "hld_diagram_source_chain_stale",
          error:
            "HLD diagram draft source chain is stale; redraft before approval.",
          artifact: result.artifact,
          staleCode: result.staleCode,
        },
        { status: 409 }
      );
    }
    if (result.status === "approval_failed") {
      return NextResponse.json(
        {
          code: "hld_diagram_review_failed",
          error: "HLD diagram draft review could not be recorded.",
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
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "hld_diagram_review_failed",
        error: "Unable to review HLD diagram draft.",
      },
      { status: 500 }
    );
  }
}
