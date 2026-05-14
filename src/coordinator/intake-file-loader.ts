import { extname } from "path";
import { readDocument } from "@/lib/io/document-reader";

export interface UploadedFile {
  path: string;
  filename?: string;
}

export interface LoadedFile {
  path: string;
  content?: string;
}

export interface EnrichResult {
  files: LoadedFile[];
  warnings: string[];
}

const EXTRACTABLE = new Set([".pdf", ".docx", ".doc"]);

export async function enrichFileContent(
  files: UploadedFile[] | undefined,
): Promise<EnrichResult> {
  const warnings: string[] = [];
  if (!files || files.length === 0) return { files: [], warnings };

  const out: LoadedFile[] = [];
  for (const f of files) {
    const ext = extname(f.path).toLowerCase();
    if (!EXTRACTABLE.has(ext)) {
      out.push({ path: f.path });
      continue;
    }
    try {
      const result = await readDocument(f.path);
      for (const w of result.warnings) warnings.push(w);
      out.push({ path: f.path, content: result.text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to extract '${f.path}': ${msg}`);
      out.push({ path: f.path, content: "" });
    }
  }
  return { files: out, warnings };
}
