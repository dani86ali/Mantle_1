/**
 * GET /api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/download -
 * stream the workbook of one already-approved `export_package` artifact. This is
 * download/serve ONLY: it never builds, regenerates, re-prices, or approves anything.
 *
 * GET only. Authenticated via requireAuth; session.tenantId is the only tenant authority
 * and the route params id/artifactId are the only project / export_package artifact
 * authority. The request body and query string are NEVER read - this route accepts no
 * caller-supplied authority (no tenantId, projectId, artifactId, filePath, outputPath,
 * filename, status, or approval). The service result maps to HTTP: not_found -> 404
 * project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), export_package_not_found -> 404 export_package_artifact_not_found,
 * artifact_not_export_package -> 409, export_package_not_approved -> 409
 * export_package_artifact_not_approved, export_package_file_missing -> 409,
 * export_package_file_invalid -> 409, export_package_file_unavailable -> 404, ok -> 200
 * with the workbook bytes (attachment, no-store, content length). An unexpected service
 * error maps to a controlled 500 (quick_bom_export_download_failed) that never exposes
 * the thrown error. Imports only Next.js server primitives, requireAuth, and the Quick
 * BoM export download service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { loadProjectQuickBomExportDownload } from "@/lib/projects/project-quick-bom-export-download";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await loadProjectQuickBomExportDownload({
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
          error: "Project is not a Quick BoM project.",
          project: result.project,
        },
        { status: 409 }
      );
    }
    if (result.status === "export_package_not_found") {
      return NextResponse.json(
        {
          code: "export_package_artifact_not_found",
          error: "Export package artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_export_package") {
      return NextResponse.json(
        {
          code: "artifact_not_export_package",
          error: "Artifact is not an export_package artifact.",
        },
        { status: 409 }
      );
    }
    if (result.status === "export_package_not_approved") {
      return NextResponse.json(
        {
          code: "export_package_artifact_not_approved",
          error: "Export package artifact must be approved before download.",
        },
        { status: 409 }
      );
    }
    if (result.status === "export_package_file_missing") {
      return NextResponse.json(
        {
          code: "export_package_file_missing",
          error: "Export package workbook file path is missing.",
        },
        { status: 409 }
      );
    }
    if (result.status === "export_package_file_invalid") {
      return NextResponse.json(
        {
          code: "export_package_file_invalid",
          error: "Export package workbook file is invalid.",
        },
        { status: 409 }
      );
    }
    if (result.status === "export_package_file_unavailable") {
      return NextResponse.json(
        {
          code: "export_package_file_unavailable",
          error: "Export package workbook file is unavailable.",
        },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(result.contentLength),
      },
    });
  } catch {
    return NextResponse.json(
      {
        code: "quick_bom_export_download_failed",
        error: "Unable to download Quick BoM export package.",
      },
      { status: 500 }
    );
  }
}
