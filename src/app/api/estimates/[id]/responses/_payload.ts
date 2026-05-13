/**
 * Multipart/JSON payload reader for /api/estimates/[id]/responses.
 * Split from route.ts to keep that file under the 200-line cap.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveResponseUpload } from "@/app/api/estimates/[id]/_e4-state";

export type Payload =
  | { kind: "text"; text: string }
  | { kind: "file"; filePath: string };

const textSchema = z.object({
  responseText: z.string().min(1).max(200_000),
});

export async function readPayload(
  request: NextRequest,
): Promise<Payload | NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart body" },
        { status: 400 },
      );
    }
    const saved = await saveResponseUpload(form);
    if ("kind" in saved) {
      if (saved.kind === "missing") {
        return NextResponse.json(
          { error: "Missing 'file' field in multipart body" },
          { status: 400 },
        );
      }
      if (saved.kind === "extension") {
        return NextResponse.json(
          { error: `Unsupported extension '${saved.ext}'. Allowed: .xlsx, .xls` },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: `File '${saved.name}' exceeds 10MB limit` },
        { status: 400 },
      );
    }
    return { kind: "file", filePath: saved.filePath };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 },
    );
  }
  const result = textSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  return { kind: "text", text: result.data.responseText };
}
