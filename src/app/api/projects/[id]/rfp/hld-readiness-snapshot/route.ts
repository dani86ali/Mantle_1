/**
 * /api/projects/[id]/rfp/hld-readiness-snapshot.
 *
 * GET - read-only list of hld_readiness_snapshot artifact versions.
 * Authenticated via requireAuth; session.tenantId is the only tenant authority
 * and the route param id is the only project authority. The request body is
 * never read. Result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary),
 * ok -> 200 with { project, artifactCount, artifacts }.
 *
 * POST - create ONE reviewable hld_readiness_snapshot draft. session.tenantId
 * is the only tenant authority, session.userId is the only createdBy authority,
 * and the route param id is the only project authority. No body is required; any
 * body supplied (tenantId/projectId/createdBy/status/source ids/payload) is
 * ignored entirely -- request.json is never called. Result maps to HTTP:
 * not_found -> 404 project_not_found, wrong_mode -> 409 wrong_project_mode,
 * blocked -> 409 hld_readiness_snapshot_blocked (with readiness),
 * ok -> 201 with { artifact, payloadSummary, readiness }.
 *
 * This route is a transport adapter only: it never touches the DB or any store,
 * reads no raw RFP files or storage paths, parses no documents, prices nothing,
 * resolves no SKU or configuration, and calls no AI or catalog. Imports only
 * Next.js server primitives, requireAuth, and the HLD readiness snapshot services.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadRfpHldReadinessSnapshotList } from "@/lib/projects/project-rfp-hld-readiness-snapshot-inspection";
import { createRfpHldReadinessSnapshotDraft } from "@/lib/projects/project-rfp-hld-readiness-snapshot";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadRfpHldReadinessSnapshotList({
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
        code: "rfp_hld_readiness_snapshot_inspection_failed",
        error: "Unable to inspect HLD readiness snapshots.",
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
    const result = await createRfpHldReadinessSnapshotDraft({
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
          code: "hld_readiness_snapshot_blocked",
          error: "HLD readiness snapshot prerequisites are not met.",
          readiness: result.readiness,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
        readiness: result.readiness,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_hld_readiness_snapshot_failed",
        error: "Unable to create RFP HLD readiness snapshot draft.",
      },
      { status: 500 }
    );
  }
}
