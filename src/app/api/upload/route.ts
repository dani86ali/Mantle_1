import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, extname, join } from "path";
import { v4 as uuid } from "uuid";
import { requireAuth } from "@/lib/middleware/auth";

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".xls",
  ".csv",
  ".msg",
  ".dwg",
] as const;
const MAX_FILES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface UploadedFileMeta {
  filename: string;
  path: string;
  size: number;
  format: string;
}

function safeBasename(name: string): string {
  return basename(name).replace(/[\x00-\x1f<>:"/\\|?*]/g, "_");
}

export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart body" },
      { status: 400 },
    );
  }

  const files = form.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "No files provided in 'files' field" },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files: ${files.length} (max ${MAX_FILES})` },
      { status: 400 },
    );
  }

  for (const file of files) {
    const ext = extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      return NextResponse.json(
        {
          error: `Unsupported extension '${ext}' for '${file.name}'. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File '${file.name}' is ${(file.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`,
        },
        { status: 400 },
      );
    }
  }

  const intakeId = uuid();
  const dir = join(tmpdir(), "bomatic-uploads", intakeId);
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create upload directory: ${message}` },
      { status: 500 },
    );
  }

  const results: UploadedFileMeta[] = [];
  try {
    for (const file of files) {
      const filename = safeBasename(file.name);
      const filePath = join(dir, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);
      results.push({
        filename,
        path: filePath,
        size: file.size,
        format: extname(filename).toLowerCase().slice(1),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to write file: ${message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ intakeId, files: results }, { status: 201 });
}
