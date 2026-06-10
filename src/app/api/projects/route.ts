/**
 * GET /api/projects - tenant-scoped canonical Project listing.
 *
 * This route backs Dashboard and Projects. It reads only the Project spine via
 * listProjectSummaries; it does not query legacy estimates, bom_drafts, intakes,
 * pricing fixtures, catalog data, Quick BoM processing services, export writers, or
 * AI/runtime decision modules.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { listProjectSummaries } from "@/lib/db/project-store";

export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const projects = await listProjectSummaries(session.tenantId);
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
