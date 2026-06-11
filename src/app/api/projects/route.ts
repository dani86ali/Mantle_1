/**
 * GET /api/projects - tenant-scoped canonical Project listing.
 *
 * This route backs Dashboard and Projects. It reads only the Project spine via
 * listProjectSummaries; it does not query legacy estimates, bom_drafts, intakes,
 * pricing fixtures, catalog data, Quick BoM processing services, export writers, or
 * AI/runtime decision modules.
 *
 * Archive (QBM-LOG-006): the default response is active Projects only. The Projects
 * page Archived view requests `?archived=only` to list archived Projects; Dashboard
 * never passes the param, so it stays active-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { listProjectSummaries } from "@/lib/db/project-store";

export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const archive =
    request.nextUrl.searchParams.get("archived") === "only"
      ? "archived"
      : "active";

  try {
    const projects = await listProjectSummaries(session.tenantId, { archive });
    return NextResponse.json({ projects }, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        code: "project_list_failed",
        error: "Unable to load projects.",
      },
      { status: 500 }
    );
  }
}
