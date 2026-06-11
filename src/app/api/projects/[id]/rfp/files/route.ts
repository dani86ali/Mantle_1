/**
 * POST /api/projects/[id]/rfp/files - upload one RFP package file to an RFP
 * Project as a Project-owned file record with an explicit file role.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only
 * tenant authority and the route param is the only project id. Reads a
 * multipart body with exactly one file field named "file" and one string
 * field named "fileRole"; any tenantId, projectId, mode, storagePath,
 * createdBy, or decidedBy fields in the body are ignored. Invalid multipart,
 * a missing/duplicated/non-File file field, or a missing role maps to 400
 * invalid_rfp_file_upload_request. The service result maps to HTTP:
 * not_found -> 404, wrong_mode -> 409, invalid_file -> 400, ok -> 201 with
 * { file }. An unexpected service error maps to a controlled 500 that never
 * exposes the thrown error. Imports only Next.js server primitives,
 * requireAuth, and the upload service (no DB, parsing, artifact/approval
 * stores, pricing, config expansion, export, runner, AI, catalog, engine,
 * coordinator, or adapter).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  uploadRfpProjectFile,
  type ProjectFileRole,
} from "@/lib/projects/project-rfp-upload";

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_file_upload_request",
      error:
        "A single multipart file field named 'file' and a string field named 'fileRole' are required.",
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

  const roleFields = form.getAll("fileRole");
  const roleField = roleFields.length === 1 ? roleFields[0] : null;
  if (typeof roleField !== "string") return invalidRequest();

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // The cast only names the wire type; the service runtime-validates the
    // role and answers invalid_file for unknown values.
    const result = await uploadRfpProjectFile({
      tenantId: session.tenantId,
      projectId: params.id,
      fileName: file.name,
      fileRole: roleField as ProjectFileRole,
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
          error: "Project is not an RFP project.",
          project: result.project,
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_file") {
      return NextResponse.json(
        {
          code: "invalid_rfp_file",
          error:
            "Uploaded RFP file must use a known file role and a supported .pdf, .docx, .xlsx, or .csv extension matching its declared size.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ file: result.file }, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        code: "rfp_file_upload_failed",
        error: "Unable to upload RFP project file.",
      },
      { status: 500 }
    );
  }
}
