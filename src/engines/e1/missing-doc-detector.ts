import { z } from "zod";

// --- Schemas & Types ---

export const MissingDocumentSchema = z.object({
  referencedDoc: z.string(),
  referencedIn: z.string(),
  page: z.number().optional(),
  line: z.string().optional(),
  pattern: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
});
export type MissingDocument = z.infer<typeof MissingDocumentSchema>;

const PatternGroupSchema = z.enum([
  "internal_cross_ref",
  "aramco_standard",
  "external_standard",
  "generic",
]);

const ExtractedRefSchema = z.object({
  ref: z.string(),
  normalized: z.string(),
  pattern: PatternGroupSchema,
});
export type ExtractedRef = z.infer<typeof ExtractedRefSchema>;

// --- Helpers ---

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function makeRef(ref: string, pattern: ExtractedRef["pattern"]): ExtractedRef {
  return ExtractedRefSchema.parse({ ref, normalized: normalizeToken(ref), pattern });
}

// --- Public Functions ---

function execAll(re: RegExp, text: string, capture: (m: RegExpExecArray) => void): void {
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) capture(m);
}

export function extractReferences(text: string, _sourceFile: string): ExtractedRef[] {
  const refs: ExtractedRef[] = [];

  // Group 1: Internal cross-references (Annex/Appendix/Attachment/Exhibit/Schedule + ID)
  execAll(
    /(?:refer\s+to|as\s+per|see|in\s+accordance\s+with)\s+((Annex|Appendix|Attachment|Exhibit|Schedule)\s+[A-Z0-9]+)/gi,
    text,
    (m) => refs.push(makeRef(m[1], "internal_cross_ref"))
  );

  // Group 2: Aramco engineering standards (6 patterns)
  const aramcoPatterns: RegExp[] = [
    /SACS-\d{3}/gi,
    /SAES-[A-Z]-\d{3}/gi,
    /SAEP-\d+/gi,
    /GI-\d+\.\d+/gi,
    /CAP-\d+/gi,
    /SAMSS-\d+/gi,
  ];
  aramcoPatterns.forEach((pattern) => {
    execAll(pattern, text, (m) => refs.push(makeRef(m[0], "aramco_standard")));
  });

  // Group 3: External standards (ISO, NIST, NCA ECC, NFPA, API)
  execAll(
    /ISO\s+\d{4,5}(?:[-:]\d{4})?|NIST\s+(?:SP\s+)?800-\d+|NCA\s+ECC|NFPA\s+\d+|API\s+\d+/gi,
    text,
    (m) => refs.push(makeRef(m[0], "external_standard"))
  );

  // Group 4: Generic reference language
  execAll(
    /(?:the\s+attached|enclosed\s+herewith|accompanying\s+document)|(?:as\s+defined\s+in|pursuant\s+to|subject\s+to\s+the\s+provisions\s+of)/gi,
    text,
    (m) => refs.push(makeRef(m[0], "generic"))
  );

  return refs;
}

export function classifySeverity(ref: ExtractedRef): MissingDocument["severity"] {
  if (ref.pattern === "aramco_standard") {
    return /^(SACS|SAES|CAP)-/i.test(ref.ref) ? "critical" : "high";
  }
  if (ref.pattern === "internal_cross_ref") {
    return /(Annex|Appendix)/i.test(ref.ref) ? "critical" : "high";
  }
  if (ref.pattern === "external_standard") return "medium";
  return "low";
}

export function detectMissingDocuments(
  classifiedFiles: { filename: string }[],
  extractedText: Map<string, string>
): MissingDocument[] {
  const normalizedFilenames = classifiedFiles.map((f) => normalizeToken(f.filename));
  const missing: MissingDocument[] = [];

  extractedText.forEach((text, sourceFile) => {
    extractReferences(text, sourceFile).forEach((ref) => {
      const found = normalizedFilenames.some((fn) => fn.includes(ref.normalized));
      if (!found) {
        missing.push(
          MissingDocumentSchema.parse({
            referencedDoc: ref.ref,
            referencedIn: sourceFile,
            pattern: ref.pattern,
            severity: classifySeverity(ref),
          })
        );
      }
    });
  });

  return missing;
}
