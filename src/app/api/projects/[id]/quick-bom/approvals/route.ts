/**
 * POST /api/projects/[id]/quick-bom/approvals - record an approve/reject
 * decision for an EXACT Quick BoM artifact version.
 *
 * POST only. Authenticated via requireAuth; the review service is tenant-scoped
 * on session.tenantId and the decider is session.userId (decidedBy is never read
 * from the request body). Parses { artifactId, decision, note? }; invalid JSON
 * or an invalid body maps to 400. Maps the service's discriminated result to
 * HTTP and never exposes a thrown error. Imports only Next.js server primitives,
 * requireAuth, and the review service (no DB/AI/catalog/engine/coordinator).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { reviewProjectQuickBomArtifact } from "@/lib/projects/project-quick-bom-approval";

interface ParsedApprovalBody {
  artifactId: string;
  decision: "approved" | "rejected";
  note?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_project_quick_bom_approval_request",
      error: "artifactId and decision are required.",
    },
    { status: 400 }
  );
}

/** Validate the request body to the minimal approval shape, or null when invalid. */
function parseApprovalBody(body: unknown): ParsedApprovalBody | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const { artifactId, decision, note } = record;
  if (typeof artifactId !== "string" || artifactId.trim() === "") return null;
  if (decision !== "approved" && decision !== "rejected") return null;
  return {
    artifactId,
    decision,
    ...(typeof note === "string" ? { note } : {}),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  const parsed = parseApprovalBody(body);
  if (parsed === null) return invalidRequest();

  try {
    const result = await reviewProjectQuickBomArtifact({
      tenantId: session.tenantId,
      projectId: params.id,
      artifactId: parsed.artifactId,
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
          error: "Project is not a Quick BoM project.",
          project: result.project,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_found") {
      return NextResponse.json(
        { code: "artifact_not_found", error: "Artifact not found." },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_quick_bom") {
      return NextResponse.json(
        {
          code: "artifact_not_quick_bom",
          error: "Artifact is not approval-gated for Quick BoM.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_reviewable") {
      return NextResponse.json(
        {
          code: "artifact_not_reviewable",
          error: "Artifact is not reviewable.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "approval_failed") {
      return NextResponse.json(
        {
          code: "artifact_approval_failed",
          error: "Artifact approval could not be recorded.",
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
        code: "project_quick_bom_approval_failed",
        error: "Unable to record Quick BoM approval.",
      },
      { status: 500 }
    );
  }
}
