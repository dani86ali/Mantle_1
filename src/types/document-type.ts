import { z } from "zod";

export const DOCUMENT_TYPES = [
  "boq",
  "rfp_sow",
  "compliance",
  "vendor_bom",
  "prior_design",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
