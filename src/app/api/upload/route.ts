import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, extname, join } from "path";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { requireAuth } from "@/lib/middleware/auth";
import {
  DOCUMENT_TYPES,
  documentTypeSchema,
  type DocumentType,
} from "@/types/document-type";

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".csv",
  ".msg",
  ".dwg",
  ".zip",
  ".png",
  ".jpg",
  ".jpeg",
  ".txt",
] as const;
const MAX_FILES = 200;
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const DEFAULT_DOCUMENT_TYPE: DocumentType = "other";

export interface UploadedFileMeta {
  filename: string;
  path: string;
  size: number;
  format: string;
  documentType: DocumentType;
}

function parseTypesField(
  raw: FormDataEntryValue | null,
  fileCount: number,
): { types: DocumentType[]; warning?: string } {
  if (raw == null || typeof raw !== "string" || raw.trim() === "") {
    return {
      types: Array(fileCount).fill(DEFAULT_DOCUMENT_TYPE),
      warning: `No 'types' field provided; defaulted all ${fileCount} file(s) to '${DEFAULT_DOCUMENT_TYPE}'. Allowed: ${DOCUMENT_TYPES.join(", ")}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      types: Array(fileCount).fill(DEFAULT_DOCUMENT_TYPE),
      warning: `Invalid JSON in 'types' field; defaulted all ${fileCount} file(s) to '${DEFAULT_DOCUMENT_TYPE}'`,
    };
  }
  const result = z.array(documentTypeSchema).safeParse(parsed);
  if (!result.success) {
    return {
      types: Array(fileCount).fill(DEFAULT_DOCUMENT_TYPE),
      warning: `'types' field failed validation; defaulted all ${fileCount} file(s) to '${DEFAULT_DOCUMENT_TYPE}'`,
    };
  }
  if (result.data.length !== fileCount) {
    return {
      types: Array(fileCount).fill(DEFAULT_DOCUMENT_TYPE),
      warning: `'types' length (${result.data.length}) did not match files length (${fileCount}); defaulted all to '${DEFAULT_DOCUMENT_TYPE}'`,
    };
  }
  return { types: result.data };
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

  const { types: documentTypes, warning: typesWarning } = parseTypesField(
    form.get("types"),
    files.length,
  );

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
          error: `File '${file.name}' is ${(file.size / 1024 / 1024).toFixed(1)}MB (max 500MB)`,
        },
        { status: 413 },
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
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = safeBasename(file.name);
      const filePath = join(dir, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);
      results.push({
        filename,
        path: filePath,
        size: file.size,
        format: extname(filename).toLowerCase().slice(1),
        documentType: documentTypes[i],
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to write file: ${message}` },
      { status: 500 },
    );
  }

  const payload: { intakeId: string; files: UploadedFileMeta[]; warnings?: string[] } = {
    intakeId,
    files: results,
  };
  if (typesWarning) payload.warnings = [typesWarning];
  return NextResponse.json(payload, { status: 201 });
}
