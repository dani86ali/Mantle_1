/**
 * POST /api/projects/[id]/archive   - soft-archive a Project (QBM-LOG-006).
 * DELETE /api/projects/[id]/archive  - restore an archived Project.
 *
 * Both are tenant-scoped via requireAuth and operate only on the canonical
 * `projects` table through the archive/restore store helpers. Archive is
 * non-destructive: DELETE here restores, it never hard-deletes.
 *
 * Restore duplicate guard: restoring an archived Quick BoM Project whose name
 * already belongs to an active Quick BoM Project returns 409 and does NOT restore,
 * so the active surface never shows two same-named Quick BoM Projects. The check is
 * skipped for already-active targets so restore stays idempotent.
 *
 * Route hygiene: NextResponse objects are single-use, so every reply is built by a
 * fresh helper call - there are no module-level response constants.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  archiveProject,
  restoreProject,
  getProjectById,
  quickBomProjectNameExists,
} from "@/lib/db/project-store";

function notFound(): NextResponse {
  return NextResponse.json(
    { code: "project_not_found", error: "Project not found." },
    { status: 404 }
  );
}

function archiveFailed(): NextResponse {
  return NextResponse.json(
    { code: "project_archive_failed", error: "Unable to archive this Project." },
    { status: 500 }
  );
}

function restoreFailed(): NextResponse {
  return NextResponse.json(
    { code: "project_restore_failed", error: "Unable to restore this Project." },
    { status: 500 }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const archived = await archiveProject(session.tenantId, params.id);
    if (!archived) return notFound();
    return NextResponse.json({ archived: true }, { status: 200 });
  } catch {
    return archiveFailed();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    // Load including archived so a missing target is a 404 and an archived Quick
    // BoM target can be name-checked against active projects before restore.
    const target = await getProjectById(session.tenantId, params.id, {
      includeArchived: true,
    });
    if (target === null) return notFound();

    // Only an archived Quick BoM restore can introduce a duplicate active name;
    // already-active targets skip the check so restore stays idempotent.
    if (
      target.archivedAt !== undefined &&
      target.mode === "quick_bom" &&
      (await quickBomProjectNameExists(session.tenantId, target.name))
    ) {
      return NextResponse.json(
        {
          code: "duplicate_project_name",
          error: `Duplicate Project Name. ${target.name} already exists in your active projects.`,
        },
        { status: 409 }
      );
    }

    const restored = await restoreProject(session.tenantId, params.id);
    if (!restored) return notFound();
    return NextResponse.json({ restored: true }, { status: 200 });
  } catch {
    return restoreFailed();
  }
}
