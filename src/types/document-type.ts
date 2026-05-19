import { z } from "zod";

export const DOCUMENT_TYPES = [
  "boq",
  "rfp",
  "bom",
  "compliance",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
