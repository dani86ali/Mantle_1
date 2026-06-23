/**
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/hld-knowledge-pack.
 *
 * Read-only sanitized detail of the EXACT design_knowledge_pack artifact version
 * named in the URL, for engineer inspection. The detail carries the whitelist-
 * copied, sanitized pack content (payloadKind, source, createdBy, createdAt,
 * domain, title, the curated list sections, and counts) - never a tenantId, never
 * an arbitrary payload key, never a storage path, never a raw RFP document body.
 * This route parses no documents, reads no file bytes, writes nothing, approves
 * nothing, prices nothing, resolves no SKU or configuration, looks up no catalog,
 * and calls no AI - it only invokes the read-only inspection service and maps its
 * result to HTTP.
 *
 * Authenticated via requireAuth; session.tenantId is the only tenant authority
 * and the route params id/artifactId are the only project/artifact authority. The
 * request body is never read. Result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), artifact_not_found -> 404 hld_knowledge_pack_artifact_not_found,
 * artifact_not_design_knowledge_pack -> 409 artifact_not_hld_knowledge_pack (with
 * the lean payload-free artifact summary), invalid_payload -> 409
 * hld_knowledge_pack_invalid_payload (with the same lean summary), ok -> 200 with
 * { project, artifact, pack }. An unexpected service error maps to a controlled
 * 500 that never exposes the thrown error. Imports only Next.js server
 * primitives, requireAuth, and the inspection service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDesignKnowledgePackDetail } from "@/lib/projects/project-rfp-hld-design-knowledge-pack-inspection";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldDesignKnowledgePackDetail({
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
          code: "hld_knowledge_pack_artifact_not_found",
          error: "HLD knowledge pack artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_design_knowledge_pack") {
      return NextResponse.json(
        {
          code: "artifact_not_hld_knowledge_pack",
          error: "Artifact is not an HLD knowledge pack artifact.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_knowledge_pack_invalid_payload",
          error: "HLD knowledge pack payload is invalid.",
          artifact: result.artifact,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        project: result.project,
        artifact: result.artifact,
        pack: result.pack,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_knowledge_pack_inspection_failed",
        error: "Unable to inspect HLD knowledge pack.",
      },
      { status: 500 }
    );
  }
}
