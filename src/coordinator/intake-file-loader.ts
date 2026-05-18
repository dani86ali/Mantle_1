import { extname } from "path";
import { readFile } from "fs/promises";
import { readDocument } from "@/lib/io/document-reader";
import { readExcelFile } from "@/lib/io/excel-reader";

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

const DOC_EXTS = new Set([".pdf", ".docx", ".doc"]);
const EXCEL_EXTS = new Set([".xlsx", ".xls"]);
const CSV_EXTS = new Set([".csv"]);

function flattenSheets(
  sheetNames: string[],
  sheets: Record<string, string[][]>,
): string {
  const parts: string[] = [];
  for (const name of sheetNames) {
    parts.push(`--- Sheet: ${name} ---`);
    const rows = sheets[name] ?? [];
    for (const row of rows) {
      const cells = row.filter((c) => c !== "" && c != null);
      if (cells.length > 0) parts.push(cells.join("\t"));
    }
  }
  return parts.join("\n");
}

export async function enrichFileContent(
  files: UploadedFile[] | undefined,
): Promise<EnrichResult> {
  const warnings: string[] = [];
  if (!files || files.length === 0) return { files: [], warnings };

  const out: LoadedFile[] = [];
  for (const f of files) {
    const ext = extname(f.path).toLowerCase();

    if (DOC_EXTS.has(ext)) {
      try {
        const result = await readDocument(f.path);
        for (const w of result.warnings) warnings.push(w);
        out.push({ path: f.path, content: result.text });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to extract '${f.path}': ${msg}`);
        out.push({ path: f.path, content: "" });
      }
      continue;
    }

    if (EXCEL_EXTS.has(ext)) {
      try {
        const r = readExcelFile(f.path);
        out.push({ path: f.path, content: flattenSheets(r.sheetNames, r.sheets) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to extract '${f.path}': ${msg}`);
        out.push({ path: f.path, content: "" });
      }
      continue;
    }

    if (CSV_EXTS.has(ext)) {
      try {
        const text = await readFile(f.path, "utf8");
        out.push({ path: f.path, content: text });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to extract '${f.path}': ${msg}`);
        out.push({ path: f.path, content: "" });
      }
      continue;
    }

    out.push({ path: f.path });
  }
  return { files: out, warnings };
}
