import { readFile, stat } from "fs/promises";
import { extname } from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export interface DocumentReadResult {
  text: string;
  format: string;
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

export async function readPdf(filePath: string): Promise<string> {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("readPdf: filePath must be a non-empty string");
  }
  if (await isEmpty(filePath)) {
    console.warn(`readPdf: file is empty (${filePath})`);
    return "";
  }
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err) {
    console.warn(`readPdf: unreadable file (${filePath}): ${(err as Error).message}`);
    return "";
  }
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text ?? "";
  } catch (err) {
    console.warn(`readPdf: parse failed (${filePath}): ${(err as Error).message}`);
    return "";
  }
}

export async function readDocx(filePath: string): Promise<string> {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("readDocx: filePath must be a non-empty string");
  }
  if (await isEmpty(filePath)) {
    console.warn(`readDocx: file is empty (${filePath})`);
    return "";
  }
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err) {
    console.warn(`readDocx: unreadable file (${filePath}): ${(err as Error).message}`);
    return "";
  }
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  } catch (err) {
    console.warn(`readDocx: parse failed (${filePath}): ${(err as Error).message}`);
    return "";
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
    return { text: await readPdf(filePath), format: "pdf" };
  }
  if (ext === ".docx") {
    return { text: await readDocx(filePath), format: "docx" };
  }
  // .doc — mammoth only supports .docx; treat as legacy.
  try {
    const text = await readDocx(filePath);
    if (text.length > 0) return { text, format: "doc" };
    throw new Error("empty result");
  } catch {
    throw new Error("Legacy .doc format — convert to .docx");
  }
}
