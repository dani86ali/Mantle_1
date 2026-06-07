/**
 * POST /api/projects/[id]/quick-bom/files - upload a BoQ file to a Quick BoM
 * Project as a Project-owned file record.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route param is the only project id. Reads a multipart body
 * with exactly one file field named "file"; any tenantId, projectId, mode,
 * fileRole, storagePath, createdBy, or decidedBy fields in the body are ignored.
 * Invalid multipart, a missing file, a duplicated file field, or a non-File value
 * maps to 400 invalid_quick_bom_boq_upload_request. The service result maps to
 * HTTP: not_found -> 404, wrong_mode -> 409, invalid_file -> 400, ok -> 201 with
 * { file }. An unexpected service error maps to a controlled 500 that never
 * exposes the thrown error. Imports only Next.js server primitives, requireAuth,
 * and the upload service (no DB, BoQ parsing, normalization, pricing, config
 * expansion, export, runner, AI, catalog, engine, coordinator, or adapter).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { uploadQuickBomBoqFile } from "@/lib/projects/project-quick-bom-upload";

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_quick_bom_boq_upload_request",
      error: "A single multipart file field named 'file' is required.",
    },
    { status: 400 }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalidRequest();
  }

  const fileFields = form.getAll("file");
  const file = fileFields.length === 1 ? fileFields[0] : null;
  if (!(file instanceof File)) return invalidRequest();

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadQuickBomBoqFile({
      tenantId: session.tenantId,
      projectId: params.id,
      fileName: file.name,
      ...(file.type ? { mimeType: file.type } : {}),
      sizeBytes: file.size,
      bytes,
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
    if (result.status === "invalid_file") {
      return NextResponse.json(
        {
          code: "invalid_quick_bom_boq_file",
          error:
            "Uploaded BoQ file must be a supported .xlsx or .csv matching its declared size.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ file: result.file }, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        code: "quick_bom_boq_upload_failed",
        error: "Unable to upload Quick BoM BoQ file.",
      },
      { status: 500 }
    );
  }
}
