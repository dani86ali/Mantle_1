import type { DocumentType } from "@/types/document-type";

export interface DocumentSlot {
  id: DocumentType;
  label: string;
  required: boolean;
  multi: boolean;
  accept: string[];
}

export const DOCUMENT_SLOTS: readonly DocumentSlot[] = [
  {
    id: "boq",
    label: "Bill of Quantities",
    required: true,
    multi: false,
    accept: [".xlsx", ".xls", ".csv"],
  },
  {
    id: "rfp_sow",
    label: "RFP / SoW Document",
    required: true,
    multi: false,
    accept: [".pdf", ".docx", ".doc"],
  },
  {
    id: "compliance",
    label: "Compliance Template",
    required: false,
    multi: false,
    accept: [".pdf", ".docx", ".xlsx"],
  },
  {
    id: "vendor_bom",
    label: "Vendor BoMs",
    required: false,
    multi: true,
    accept: [".xlsx", ".xls", ".pdf", ".docx"],
  },
  {
    id: "prior_design",
    label: "Prior HLD/LLD",
    required: false,
    multi: true,
    accept: [".pdf", ".docx"],
  },
  {
    id: "other",
    label: "Other / References",
    required: false,
    multi: true,
    accept: [".pdf", ".docx", ".xlsx", ".xls", ".csv", ".msg", ".dwg"],
  },
] as const;

export const REQUIRED_SLOT_IDS: readonly DocumentType[] = DOCUMENT_SLOTS
  .filter((s) => s.required)
  .map((s) => s.id);

export type SlotFileMap = Partial<Record<DocumentType, File[]>>;
