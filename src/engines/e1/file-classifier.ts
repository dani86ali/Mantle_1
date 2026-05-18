import { z } from "zod";

// --- Types ---

export const FileClassificationSchema = z.object({
  type: z.string(),
  subtype: z.string(),
  confidence: z.number().min(0).max(1),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  format: z.string(),
  needsReview: z.boolean().optional(),
});

export type FileClassification = z.infer<typeof FileClassificationSchema>;

// --- Rules ---

type PatternRule = { pattern: RegExp; type: string; subtype: string };

const FILENAME_RULES: PatternRule[] = [
  { pattern: /SACS[-_]\d|SAES[-_][A-Z]|CAP[-_]\d|GI[-_]\d/i,                                               type: "compliance",     subtype: "cybersecurity_standard" },
  { pattern: /(?<![a-zA-Z])(BOQ|BoQ|pricing|bill.of.quantities)(?![a-zA-Z])/i,                              type: "commercial",     subtype: "boq_template"           },
  { pattern: /(?<![a-zA-Z])(NDA|confidential|non.disclosure)(?![a-zA-Z])/i,                                 type: "legal",          subtype: "nda"                    },
  { pattern: /(?<![a-zA-Z])(bid.bond|bank.guarantee|performance.bond)(?![a-zA-Z])/i,                        type: "legal",          subtype: "bid_bond"               },
  { pattern: /(?<![a-zA-Z])(commercial.registration|ZATCA|VAT)(?![a-zA-Z])|(?<![a-zA-Z])CR(?![a-zA-Z])/i, type: "administrative", subtype: "certificate"            },
  { pattern: /(?<![a-zA-Z])(evaluation|questionnaire|scoring)(?![a-zA-Z])/i,                                type: "commercial",     subtype: "evaluation_criteria"    },
  { pattern: /(?<![a-zA-Z])T&C(?![a-zA-Z])|terms.and.conditions/i,                                         type: "legal",          subtype: "terms"                  },
  { pattern: /(?<![a-zA-Z])(scope|SOW|requirements|specification)(?![a-zA-Z])/i,                            type: "technical",      subtype: "requirements"           },
  { pattern: /(?<![a-zA-Z])(drawing|riser|layout)(?![a-zA-Z])|\.dwg|\.vsdx/i,                              type: "technical",      subtype: "engineering_drawing"    },
  { pattern: /(?<![a-zA-Z])(local.content|IKTVA|Saudization)(?![a-zA-Z])/i,                                type: "compliance",     subtype: "local_content"          },
];

const FOLDER_RULES: PatternRule[] = [
  { pattern: /\b(RFQ.Document|RFP|Documents)\b/i,          type: "technical",      subtype: "requirements" },
  { pattern: /\b(BOQ|Pricing)\b/i,                          type: "commercial",     subtype: "boq_template" },
  { pattern: /\b(Legal|NDA)\b/i,                            type: "legal",          subtype: "general"      },
  { pattern: /\b(Compliance|Security|Standards)\b/i,        type: "compliance",     subtype: "general"      },
  { pattern: /\b(Submittals|Certificates)\b/i,              type: "administrative", subtype: "certificate"  },
];

type ContentCategory = { keywords: string[]; type: string; subtype: string };

const CONTENT_CATEGORIES: ContentCategory[] = [
  {
    keywords: ["shall comply", "mandatory", "disqualified", "failure to"],
    type: "technical",
    subtype: "requirements",
  },
  {
    keywords: ["unit price", "total price", "qty", "amount", "SAR", "USD"],
    type: "commercial",
    subtype: "pricing",
  },
  {
    keywords: ["whereas", "hereby agrees", "indemnify", "liability", "jurisdiction"],
    type: "legal",
    subtype: "general",
  },
  {
    keywords: ["cybersecurity", "access control", "encryption", "vulnerability", "NCA", "ISO 27001"],
    type: "compliance",
    subtype: "general",
  },
  {
    keywords: ["authorized signatory", "chamber of commerce", "registration number"],
    type: "administrative",
    subtype: "certificate",
  },
];

const FORMAT_MAP: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  dwg: "dwg",
  msg: "msg",
  vsdx: "vsdx",
};

// --- Functions ---

export function detectFileFormat(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return FORMAT_MAP[ext] ?? "unknown";
}

export function matchFilenamePatterns(filename: string): FileClassification {
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(filename)) {
      return {
        type: rule.type,
        subtype: rule.subtype,
        confidence: 0.9,
        stage: 1,
        format: detectFileFormat(filename),
      };
    }
  }
  return { type: "unknown", subtype: "unknown", confidence: 0.0, stage: 1, format: detectFileFormat(filename) };
}

export function matchFolderPatterns(folder: string): FileClassification {
  for (const rule of FOLDER_RULES) {
    if (rule.pattern.test(folder)) {
      return { type: rule.type, subtype: rule.subtype, confidence: 0.75, stage: 2, format: "unknown" };
    }
  }
  return { type: "unknown", subtype: "unknown", confidence: 0.0, stage: 2, format: "unknown" };
}

export function scanContentKeywords(content: string): FileClassification {
  const lower = content.toLowerCase();
  let bestCount = 0;
  let bestCategory: ContentCategory | null = null;

  for (const cat of CONTENT_CATEGORIES) {
    const count = cat.keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
    if (count > bestCount) {
      bestCount = count;
      bestCategory = cat;
    }
  }

  if (bestCategory) {
    return { type: bestCategory.type, subtype: bestCategory.subtype, confidence: 0.6, stage: 3, format: "unknown" };
  }
  return { type: "unknown", subtype: "unknown", confidence: 0.3, stage: 3, format: "unknown", needsReview: true };
}

const SPREADSHEET_EXTS = new Set([".xlsx", ".xls", ".csv"]);

function hasSpreadsheetExtension(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return false;
  return SPREADSHEET_EXTS.has(filename.slice(dot).toLowerCase());
}

export function classifyFile(
  filename: string,
  folder: string,
  content?: string
): FileClassification {
  const format = detectFileFormat(filename);

  const stage1 = matchFilenamePatterns(filename);
  if (stage1.confidence > 0.8) return stage1;

  const stage2 = matchFolderPatterns(folder);
  if (stage2.confidence > 0.7) return { ...stage2, format };

  const stage3 = scanContentKeywords(content ?? "");

  // Spreadsheet normalization: BoQ workbooks frequently arrive with PO/RTR
  // filenames (e.g. Aramco_4203079088.xlsx) that match no filename or folder
  // rule. selectBoQFilePath requires subtype='boq_template', so we route
  // spreadsheets there in two cases:
  //   1. content scan hit pricing keywords (unit price/qty/amount/SAR/USD) —
  //      strong signal it's a BoQ; promote pricing → boq_template at 0.6.
  //   2. content scan returned unknown — keyword-poor BoQs (raw SKU lists,
  //      numeric-only cells) still need to reach E2; fall back at 0.4 with
  //      needsReview so the UI can override if it's actually a non-BoQ sheet.
  if (hasSpreadsheetExtension(filename)) {
    if (stage3.type === "commercial" && stage3.subtype === "pricing") {
      return {
        type: "commercial",
        subtype: "boq_template",
        confidence: 0.6,
        stage: 3,
        format,
      };
    }
    if (stage3.type === "unknown") {
      return {
        type: "commercial",
        subtype: "boq_template",
        confidence: 0.4,
        stage: 3,
        format,
        needsReview: true,
      };
    }
  }

  const result = { ...stage3, format };
  return result.confidence < 0.5 ? { ...result, needsReview: true } : result;
}
