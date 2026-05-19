import type { DocumentType } from "@/types/document-type";

export interface DocumentTag {
  id: DocumentType;
  label: string;
  suggestedExtensions: string[];
}

export const DOCUMENT_TAGS: readonly DocumentTag[] = [
  { id: "boq", label: "BoQ", suggestedExtensions: [".xlsx", ".xls", ".csv"] },
  { id: "rfp", label: "RFP", suggestedExtensions: [".pdf", ".docx", ".doc"] },
  { id: "bom", label: "BoM", suggestedExtensions: [".xlsx", ".xls", ".pdf", ".docx", ".csv"] },
  { id: "compliance", label: "Compliance", suggestedExtensions: [".pdf", ".docx", ".xlsx"] },
  { id: "other", label: "Other", suggestedExtensions: [] },
] as const;

export const UPLOAD_ALLOWED_EXTENSIONS = [
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

export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

export interface PileFile {
  id: string;
  file: File;
  documentType: DocumentType | null;
}

export function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

export function isExtensionAllowed(filename: string): boolean {
  const ext = extOf(filename);
  return (UPLOAD_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export function tagFor(id: DocumentType): DocumentTag {
  return DOCUMENT_TAGS.find((t) => t.id === id) ?? DOCUMENT_TAGS[DOCUMENT_TAGS.length - 1];
}

export function shouldWarnTagExtMismatch(
  filename: string,
  documentType: DocumentType,
): boolean {
  const tag = tagFor(documentType);
  if (tag.suggestedExtensions.length === 0) return false;
  return !tag.suggestedExtensions.includes(extOf(filename));
}
