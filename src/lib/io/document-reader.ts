import { readFile, stat } from "fs/promises";
import { extname } from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export interface DocumentReadResult {
  text: string;
  format: string;
  warnings: string[];
}

export interface ReaderResult {
  text: string;
  warnings: string[];
}

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc"] as const;

async function isEmpty(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.size === 0;
  } catch {
    return false;
  }
}

export async function readPdf(filePath: string): Promise<ReaderResult> {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("readPdf: filePath must be a non-empty string");
  }
  const warnings: string[] = [];
  if (await isEmpty(filePath)) {
    const msg = `readPdf: file is empty (${filePath})`;
    console.warn(msg);
    warnings.push(msg);
    return { text: "", warnings };
  }
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err) {
    const msg = `readPdf: unreadable file (${filePath}): ${(err as Error).message}`;
    console.warn(msg);
    warnings.push(msg);
    return { text: "", warnings };
  }
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return { text: result.text ?? "", warnings };
  } catch (err) {
    const msg = `readPdf: parse failed (${filePath}): ${(err as Error).message}`;
    console.warn(msg);
    warnings.push(msg);
    return { text: "", warnings };
  }
}

export async function readDocx(filePath: string): Promise<ReaderResult> {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("readDocx: filePath must be a non-empty string");
  }
  const warnings: string[] = [];
  if (await isEmpty(filePath)) {
    const msg = `readDocx: file is empty (${filePath})`;
    console.warn(msg);
    warnings.push(msg);
    return { text: "", warnings };
  }
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err) {
    const msg = `readDocx: unreadable file (${filePath}): ${(err as Error).message}`;
    console.warn(msg);
    warnings.push(msg);
    return { text: "", warnings };
  }
  try {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value ?? "", warnings };
  } catch (err) {
    const msg = `readDocx: parse failed (${filePath}): ${(err as Error).message}`;
    console.warn(msg);
    warnings.push(msg);
    return { text: "", warnings };
  }
}

export async function readDocument(filePath: string): Promise<DocumentReadResult> {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("readDocument: filePath must be a non-empty string");
  }
  const ext = extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new Error(`readDocument: unsupported extension '${ext}' — supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }

  if (ext === ".pdf") {
    const r = await readPdf(filePath);
    return { text: r.text, format: "pdf", warnings: r.warnings };
  }
  if (ext === ".docx") {
    const r = await readDocx(filePath);
    return { text: r.text, format: "docx", warnings: r.warnings };
  }
  // .doc — mammoth only supports .docx; treat as legacy.
  const r = await readDocx(filePath);
  if (r.text.length > 0) return { text: r.text, format: "doc", warnings: r.warnings };
  throw new Error("Legacy .doc format — convert to .docx");
}
