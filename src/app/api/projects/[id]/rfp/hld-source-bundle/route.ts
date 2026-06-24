/**
 * /api/projects/[id]/rfp/hld-source-bundle.
 *
 * GET - read-only list of hld_source_bundle artifact versions plus a read-only
 * source-bundle readiness probe. Authenticated via requireAuth; session.tenantId
 * is the only tenant authority and the route param id is the only project
 * authority. The request body is never read. Result maps to HTTP:
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode (with
 * the lean project summary), ok -> 200 with
 * { project, artifactCount, artifacts, sourceBundleReadiness }.
 *
 * POST - compile ONE reviewable hld_source_bundle draft from the already-approved
 * Project authorities. session.tenantId is the only tenant authority,
 * session.userId is the only createdBy authority, and the route param id is the
 * only project authority. No body is required; any body supplied
 * (tenantId/projectId/createdBy/status/source ids/payload) is ignored entirely
 * and the request body is never parsed. Result maps to HTTP:
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode,
 * blocked -> 409 hld_source_bundle_blocked (with blockerCode + messages),
 * invalid_payload -> 409 hld_source_bundle_invalid_payload (with errors),
 * ok -> 201 with { artifact, payloadSummary }.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, prices nothing,
 * resolves no SKU or configuration, and calls no AI or catalog. Imports only
 * Next.js server primitives, requireAuth, and the source-bundle services.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldSourceBundleList } from "@/lib/projects/project-rfp-hld-source-bundle-inspection";
import { createRfpHldSourceBundleDraft } from "@/lib/projects/project-rfp-hld-source-bundle-assembler";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldSourceBundleList({
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
        sourceBundleReadiness: result.sourceBundleReadiness,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_source_bundle_inspection_failed",
        error: "Unable to inspect HLD source bundles.",
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

  try {
    const result = await createRfpHldSourceBundleDraft({
      tenantId: session.tenantId,
      projectId: params.id,
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
    if (result.status === "blocked") {
      return NextResponse.json(
        {
          code: "hld_source_bundle_blocked",
          error: "HLD source bundle prerequisites are not met.",
          blockerCode: result.code,
          messages: result.messages,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_payload") {
      return NextResponse.json(
        {
          code: "hld_source_bundle_invalid_payload",
          error: "Compiled HLD source bundle payload is invalid.",
          errors: result.errors,
        },
        { status: 409 }
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
        code: "rfp_hld_source_bundle_failed",
        error: "Unable to compile RFP HLD source bundle draft.",
      },
      { status: 500 }
    );
  }
}
