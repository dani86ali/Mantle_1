/**
 * /api/projects/[id]/rfp/hld-knowledge-packs.
 *
 * GET - read-only list of the Project's design_knowledge_pack artifact versions
 * for engineer inspection. Authenticated via requireAuth; session.tenantId is the
 * only tenant authority and the route param id is the only project authority. The
 * request body is never read. Result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), ok -> 200 with { project, artifactCount, artifacts }.
 *
 * POST - create ONE reviewable design_knowledge_pack draft from operator-authored
 * design knowledge. session.tenantId is the only tenant authority, session.userId
 * is the only createdBy authority, and the route param id is the only project id.
 * The request body supplies ONLY { domain, title, designPrinciples,
 * topologyGuidance, constraints, assumptions, exclusions, validationNotes }; any
 * caller-supplied tenantId/projectId/createdBy/createdAt/status/stageId/type/
 * payloadKind/source/payload/authority/pricing/SKU/catalog/config field is
 * ignored. A missing/malformed body (not a JSON object) yields 400
 * invalid_rfp_hld_knowledge_pack_request; a known service validation failure is
 * also mapped to 400 invalid_rfp_hld_knowledge_pack_request (never a 500). Result
 * maps to HTTP: not_found -> 404, wrong_mode -> 409, ok -> 201 with
 * { artifact, payloadSummary }; an unexpected service error maps to a controlled
 * 500 that never exposes the thrown error.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, prices nothing,
 * resolves no SKU or configuration, and calls no AI or catalog. Imports only
 * Next.js server primitives, requireAuth, and the HLD knowledge-pack services.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldDesignKnowledgePackList } from "@/lib/projects/project-rfp-hld-design-knowledge-pack-inspection";
import {
  createRfpHldDesignKnowledgePack,
  isRfpHldDesignKnowledgePackValidationError,
} from "@/lib/projects/project-rfp-hld-design-knowledge-pack";

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_hld_knowledge_pack_request",
      error: "A design knowledge pack request body object is required.",
    },
    { status: 400 }
  );
}

/** Coerce a value to a string, or "" when it is not a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Validate the body to a plain JSON object, or null when malformed. */
function parseCreateBody(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldDesignKnowledgePackList({
      tenantId: session.tenantId,
      projectId: params.id,
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

    return NextResponse.json(
      {
        project: result.project,
        artifactCount: result.artifactCount,
        artifacts: result.artifacts,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_knowledge_pack_inspection_failed",
        error: "Unable to inspect HLD knowledge packs.",
      },
      { status: 500 }
    );
  }
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
  const parsed = parseCreateBody(body);
  if (parsed === null) return invalidRequest();

  try {
    // Whitelist exactly the operator-authored content fields; tenant/project/
    // createdBy come from the session and route, never the body.
    const result = await createRfpHldDesignKnowledgePack({
      tenantId: session.tenantId,
      projectId: params.id,
      createdBy: session.userId,
      domain: asString(parsed.domain),
      title: asString(parsed.title),
      designPrinciples: parsed.designPrinciples,
      topologyGuidance: parsed.topologyGuidance,
      constraints: parsed.constraints,
      assumptions: parsed.assumptions,
      exclusions: parsed.exclusions,
      validationNotes: parsed.validationNotes,
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

    return NextResponse.json(
      { artifact: result.artifact, payloadSummary: result.payloadSummary },
      { status: 201 }
    );
  } catch (error) {
    // Known request-derived validation failures map to 400; everything else is a
    // controlled 500 that never exposes the thrown error.
    if (isRfpHldDesignKnowledgePackValidationError(error)) return invalidRequest();
    return NextResponse.json(
      {
        code: "rfp_hld_knowledge_pack_failed",
        error: "Unable to create RFP HLD knowledge pack.",
      },
      { status: 500 }
    );
  }
}
