/**
 * RFP compiled-evidence review model (Stage 4.5, pure deterministic).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Contract: docs/RFP_STAGE_4_5_COMPILED_EVIDENCE_REVIEW_CONTRACT.md
 *
 * Compiles the already sanitized deterministic evidence entries of one
 * evidence_package into a UI-facing review of human-reviewable findings
 * instead of one card per raw text chunk. Raw deterministic evidence stays
 * the persisted authority and is accounted for EXACTLY once: every text and
 * table input either contributes to a primary finding's audit array or lands
 * in the collapsed suppressed/audit list, and the accounting fields prove the
 * balance. Text inputs are grouped by document name + role + topic (source
 * order preserved) and extraction noise (empty/tiny/duplicate/page-only/
 * proprietary/repeated-header fragments) is suppressed out of the primary
 * findings while staying in the audit trail with raw traceability. Tables are
 * rendered as readable matrices; a caller-provided repaired table is always a
 * primary finding flagged tableRepaired + aiRefined; caller-provided missing
 * candidates are proposal-only findings flagged missingFromDeterministic +
 * aiRefined. Primary finding fields carry only human labels (document,
 * passage, page, sheet, table) - never raw UUIDs, file/package/table ids, or
 * the word "chunk"; those raw locators live only in the audit entries. The
 * AI refinement is caller-provided presentation data only; this module makes
 * no live AI call. The module is pure: no runtime imports, no side effects,
 * and no clock or randomness.
 */

/** The two persisted RFP extraction evidence kinds, declared locally. */
const TEXT_KIND = "rfp_document_text_chunk";
const TABLE_KIND = "rfp_document_table";

/** Tiny-fragment threshold: non-whitespace length at or below this is noise. */
const TINY_MAX_NON_WHITESPACE = 3;
/** A repeated body at or below this collapsed length reads as a header. */
const HEADER_MAX_LENGTH = 60;
/** Suppressed previews are truncated to this many characters for audit. */
const PREVIEW_MAX_LENGTH = 80;

/**
 * Visible delimiter joining document + role + topic into a grouping key. It is
 * a plain escaped string literal (no raw control characters in source); the
 * unlikely vertical-bar run keeps distinct documents from colliding.
 */
const GROUP_KEY_DELIMITER = "|||||";

/** Whitelisted finite numeric metrics of one extracted document. */
export interface CompiledEvidenceDocumentMetrics {
  textCharCount: number;
  nonWhitespaceTextCharCount: number;
  tableCount: number;
  tableRowCount: number;
}

/** One sanitized deterministic text-chunk input. */
export interface CompiledEvidenceTextInput {
  evidenceId: string;
  evidenceKind: typeof TEXT_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  /** Optional grouping topic; absent inputs group by document + role only. */
  topic?: string;
  chunkIndex: number;
  chunkCount: number;
  charCount: number;
  text: string;
  documentMetrics?: CompiledEvidenceDocumentMetrics;
}

/** One sanitized deterministic table input. */
export interface CompiledEvidenceTableInput {
  evidenceId: string;
  evidenceKind: typeof TABLE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  tableId: string;
  pageNumber?: number;
  sheetName?: string;
  rowCount: number;
  columnCount: number;
  rows: string[][];
}

/** One deterministic input: text chunk or table, in listed evidence order. */
export type CompiledEvidenceDeterministicInput =
  | CompiledEvidenceTextInput
  | CompiledEvidenceTableInput;

/**
 * One caller-provided repaired table (presentation refinement, not authority).
 * Matched to the deterministic table it repairs by evidenceId.
 */
export interface CompiledEvidenceRepairedTableInput {
  evidenceId: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  pageNumber?: number;
  sheetName?: string;
  rows: string[][];
}

/**
 * One caller-provided per-evidence refinement (presentation only, no live AI
 * call here). Matched to the deterministic record it refines by evidenceId; for
 * a grouped text finding a match on any contributing record refines the group.
 * A refinement only adds display data and flags - it never drops the underlying
 * deterministic record, so the accounting balance is preserved.
 */
export interface CompiledEvidenceEvidenceRefinementInput {
  evidenceId: string;
  cleanSummary?: string;
  readableContent?: string;
  lowConfidence?: boolean;
  conflict?: boolean;
}

/** Caller-provided presentation refinement (no live AI call here). */
export interface CompiledEvidenceRefinementInput {
  repairedTables?: CompiledEvidenceRepairedTableInput[];
  evidenceRefinements?: CompiledEvidenceEvidenceRefinementInput[];
}

/** One caller-provided missing candidate (a proposal, never authority). */
export interface CompiledEvidenceMissingCandidateInput {
  candidateId: string;
  title: string;
  description?: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  passageLabel?: string;
  pageLabel?: string;
  sheetLabel?: string;
  tableLabel?: string;
}

/** Input for {@link compileCompiledEvidenceReview}. */
export interface CompileCompiledEvidenceReviewInput {
  deterministicEvidence: CompiledEvidenceDeterministicInput[];
  refinement?: CompiledEvidenceRefinementInput;
  missingCandidates?: CompiledEvidenceMissingCandidateInput[];
}

/** Human source citation; never a raw UUID, file/package/table id, or chunk. */
export interface CompiledEvidenceCitation {
  documentLabel?: string;
  passageLabel?: string;
  pageLabel?: string;
  sheetLabel?: string;
  tableLabel?: string;
}

/**
 * Presentation flags carried by one finding. All booleans are always present
 * so a consumer never has to guess a default. `duplicate`/`boilerplate` mark a
 * finding the deterministic pass folded together or treated as boilerplate;
 * `lowConfidence`/`conflict` are caller-provided refinement signals;
 * `aiRefined` is set whenever any caller refinement touched the finding;
 * `tableRepaired` and `missingFromDeterministic` mark the two proposal kinds.
 */
export interface CompiledEvidenceFindingFlags {
  duplicate: boolean;
  boilerplate: boolean;
  lowConfidence: boolean;
  aiRefined: boolean;
  tableRepaired: boolean;
  missingFromDeterministic: boolean;
  conflict: boolean;
}

/** The seven flag names, used for the all-false default and the summary. */
const FLAG_NAMES = [
  "duplicate",
  "boilerplate",
  "lowConfidence",
  "aiRefined",
  "tableRepaired",
  "missingFromDeterministic",
  "conflict",
] as const;

/** A fresh flags object with every flag false. */
function defaultFlags(): CompiledEvidenceFindingFlags {
  return {
    duplicate: false,
    boilerplate: false,
    lowConfidence: false,
    aiRefined: false,
    tableRepaired: false,
    missingFromDeterministic: false,
    conflict: false,
  };
}

/** Raw machine traceability for ONE deterministic input; audit-only. */
export interface CompiledEvidenceAuditEntry {
  evidenceId: string;
  evidenceKind: string;
  sourceFileId: string;
  inputPackageArtifactId: string;
  chunkIndex?: number;
  chunkCount?: number;
  charCount?: number;
  tableId?: string;
  pageNumber?: number;
  sheetName?: string;
  rowCount?: number;
  columnCount?: number;
}

/** Whether a finding renders as grouped text or as a readable table. */
export type CompiledEvidenceFindingKind = "text" | "table";

/**
 * One primary reviewable finding. Display fields carry human labels only; the
 * audit array holds every raw deterministic input the finding represents (more
 * than one for grouped text).
 */
export interface CompiledEvidenceFinding {
  findingId: string;
  kind: CompiledEvidenceFindingKind;
  title: string;
  documentName: string;
  role?: string;
  /** Grouping category/topic, when the source records carried one. */
  topic?: string;
  /** Caller-provided one-line clean summary; never a raw machine string. */
  cleanSummary?: string;
  citations: CompiledEvidenceCitation[];
  /** Normalized readable content/body (caller readableContent overrides it). */
  body?: string;
  table?: { rows: string[][] };
  flags: CompiledEvidenceFindingFlags;
  audit: CompiledEvidenceAuditEntry[];
}

/** Why one deterministic text input was suppressed from primary findings. */
export type CompiledEvidenceSuppressionReason =
  | "empty_fragment"
  | "tiny_fragment"
  | "duplicate_body"
  | "page_only"
  | "proprietary_notice"
  | "repeated_header";

/** One suppressed deterministic record, retained for collapsed audit/history. */
export interface CompiledEvidenceSuppressedEntry {
  reason: CompiledEvidenceSuppressionReason;
  preview: string;
  audit: CompiledEvidenceAuditEntry;
}

/** Count of primary findings carrying each presentation flag. */
export type CompiledEvidenceFlagSummary = Record<
  keyof CompiledEvidenceFindingFlags,
  number
>;

/** Counts that prove deterministic inputs balance across primary + suppressed. */
export interface CompiledEvidenceAccounting {
  deterministicInputCount: number;
  deterministicTextInputCount: number;
  deterministicTableInputCount: number;
  primaryFindingCount: number;
  textFindingCount: number;
  tableFindingCount: number;
  repairedTableFindingCount: number;
  missingCandidateFindingCount: number;
  accountedInPrimaryCount: number;
  suppressedCount: number;
  suppressedByReason: Record<CompiledEvidenceSuppressionReason, number>;
  /** How many primary findings carry each presentation flag. */
  flagSummary: CompiledEvidenceFlagSummary;
  balanced: boolean;
}

/** The full compiled review: primary findings, suppressed audit, accounting. */
export interface CompiledEvidenceReview {
  findings: CompiledEvidenceFinding[];
  suppressed: CompiledEvidenceSuppressedEntry[];
  accounting: CompiledEvidenceAccounting;
}

/** Collapse all whitespace runs to single spaces and trim. */
function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Count non-whitespace characters. */
function nonWhitespaceLength(value: string): number {
  return value.replace(/\s+/g, "").length;
}

/** True when the string carries at least one letter or digit. */
function hasAlphanumeric(value: string): boolean {
  return /[a-z0-9]/i.test(value);
}

/** True for a bare page locator: a number, "page N", "pg N", "page N of M". */
function isPageOnly(collapsed: string): boolean {
  return (
    /^[-.\s]*\d+[-.\s]*$/.test(collapsed) ||
    /^(?:page|pg|p)\.?\s*\d+$/i.test(collapsed) ||
    /^page\s*\d+\s*of\s*\d+$/i.test(collapsed)
  );
}

/** True for a proprietary/confidential/copyright/all-rights notice. */
function isProprietaryNotice(lower: string): boolean {
  return (
    lower.includes("confidential") ||
    lower.includes("proprietary") ||
    lower.includes("all rights reserved") ||
    lower.includes("copyright") ||
    /\(c\)\s*\d/.test(lower)
  );
}

/** Short truncated preview of a suppressed body for the audit trail. */
function toPreview(value: string): string {
  const collapsed = collapse(value);
  return collapsed.length <= PREVIEW_MAX_LENGTH
    ? collapsed
    : `${collapsed.slice(0, PREVIEW_MAX_LENGTH)}...`;
}

/** Raw audit entry for one deterministic text input. */
function textAudit(input: CompiledEvidenceTextInput): CompiledEvidenceAuditEntry {
  return {
    evidenceId: input.evidenceId,
    evidenceKind: TEXT_KIND,
    sourceFileId: input.sourceFileId,
    inputPackageArtifactId: input.inputPackageArtifactId,
    chunkIndex: input.chunkIndex,
    chunkCount: input.chunkCount,
    charCount: input.charCount,
  };
}

/** Raw audit entry for one deterministic table input. */
function tableAudit(input: CompiledEvidenceTableInput): CompiledEvidenceAuditEntry {
  return {
    evidenceId: input.evidenceId,
    evidenceKind: TABLE_KIND,
    sourceFileId: input.sourceFileId,
    inputPackageArtifactId: input.inputPackageArtifactId,
    tableId: input.tableId,
    ...(input.pageNumber !== undefined ? { pageNumber: input.pageNumber } : {}),
    ...(input.sheetName !== undefined ? { sheetName: input.sheetName } : {}),
    rowCount: input.rowCount,
    columnCount: input.columnCount,
  };
}

/**
 * Classify one text body as kept (null) or a suppression reason. Bodies kept
 * are tracked in {@link seen} so a later identical body suppresses as a
 * duplicate (a short repeat as a repeated header).
 */
function classifyText(
  text: string,
  seen: Set<string>
): CompiledEvidenceSuppressionReason | null {
  const collapsed = collapse(text);
  if (collapsed === "" || !hasAlphanumeric(collapsed)) return "empty_fragment";
  if (isPageOnly(collapsed)) return "page_only";
  const lower = collapsed.toLowerCase();
  if (isProprietaryNotice(lower)) return "proprietary_notice";
  if (nonWhitespaceLength(collapsed) <= TINY_MAX_NON_WHITESPACE) {
    return "tiny_fragment";
  }
  if (seen.has(lower)) {
    return collapsed.length <= HEADER_MAX_LENGTH
      ? "repeated_header"
      : "duplicate_body";
  }
  seen.add(lower);
  return null;
}

/** One in-progress grouped text finding while inputs are scanned in order. */
interface TextGroup {
  documentName: string;
  role?: string;
  topic?: string;
  bodies: string[];
  citations: CompiledEvidenceCitation[];
  audit: CompiledEvidenceAuditEntry[];
}

/** Human document label for one input; a fallback when the name is absent. */
function documentNameOf(name: string | undefined): string {
  return name !== undefined && name.trim() !== "" ? name : "Unattributed source";
}

/**
 * Compile the deterministic evidence (plus optional caller-provided refinement
 * and missing candidates) into a UI-facing compiled review. Text inputs are
 * grouped by document name + role + topic with source order preserved, with
 * extraction noise suppressed into the collapsed audit list; tables become
 * readable findings (a repaired table flagged tableRepaired + aiRefined); and
 * missing candidates become proposal-only findings flagged
 * missingFromDeterministic + aiRefined. Every deterministic input is accounted
 * for exactly once across primary-finding audit and suppressed audit, and the
 * accounting proves the balance. Pure and deterministic: inputs are never
 * mutated and no clock, randomness, or AI call is used.
 */
export function compileCompiledEvidenceReview(
  input: CompileCompiledEvidenceReviewInput
): CompiledEvidenceReview {
  const textInputs = input.deterministicEvidence.filter(
    (entry): entry is CompiledEvidenceTextInput => entry.evidenceKind === TEXT_KIND
  );
  const tableInputs = input.deterministicEvidence.filter(
    (entry): entry is CompiledEvidenceTableInput =>
      entry.evidenceKind === TABLE_KIND
  );

  const suppressed: CompiledEvidenceSuppressedEntry[] = [];
  const suppressedByReason: Record<CompiledEvidenceSuppressionReason, number> = {
    empty_fragment: 0,
    tiny_fragment: 0,
    duplicate_body: 0,
    page_only: 0,
    proprietary_notice: 0,
    repeated_header: 0,
  };

  // Caller-provided per-evidence refinement, read by evidenceId only (never
  // iterated) to stay ES target agnostic. Refinement adds display data and
  // flags; it never drops a deterministic record, so the balance is preserved.
  const refinementByEvidenceId = new Map<
    string,
    CompiledEvidenceEvidenceRefinementInput
  >();
  for (const refinement of input.refinement?.evidenceRefinements ?? []) {
    refinementByEvidenceId.set(refinement.evidenceId, refinement);
  }

  // Group surviving text inputs by document + role + topic, source order kept.
  const seenBodies = new Set<string>();
  const groups: TextGroup[] = [];
  const groupByKey = new Map<string, TextGroup>();
  for (const entry of textInputs) {
    const reason = classifyText(entry.text, seenBodies);
    if (reason !== null) {
      suppressedByReason[reason] += 1;
      suppressed.push({
        reason,
        preview: toPreview(entry.text),
        audit: textAudit(entry),
      });
      continue;
    }
    const documentName = documentNameOf(entry.sourceFileName);
    const key = `${documentName}${GROUP_KEY_DELIMITER}${entry.sourceFileRole ?? ""}${GROUP_KEY_DELIMITER}${entry.topic ?? ""}`;
    let group = groupByKey.get(key);
    if (group === undefined) {
      group = {
        documentName,
        ...(entry.sourceFileRole !== undefined
          ? { role: entry.sourceFileRole }
          : {}),
        ...(entry.topic !== undefined ? { topic: entry.topic } : {}),
        bodies: [],
        citations: [],
        audit: [],
      };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.bodies.push(entry.text);
    group.citations.push({
      passageLabel: `Passage ${entry.chunkIndex + 1} of ${entry.chunkCount}`,
    });
    group.audit.push(textAudit(entry));
  }

  const findings: CompiledEvidenceFinding[] = [];
  groups.forEach((group, index) => {
    // A grouped finding is refined if ANY contributing record carries one.
    const refs = group.audit
      .map((entry) => refinementByEvidenceId.get(entry.evidenceId))
      .filter(
        (ref): ref is CompiledEvidenceEvidenceRefinementInput =>
          ref !== undefined
      );
    const cleanSummary = refs.find((ref) => ref.cleanSummary !== undefined)
      ?.cleanSummary;
    const readableContent = refs.find((ref) => ref.readableContent !== undefined)
      ?.readableContent;
    const flags = defaultFlags();
    flags.aiRefined = refs.length > 0;
    flags.lowConfidence = refs.some((ref) => ref.lowConfidence === true);
    flags.conflict = refs.some((ref) => ref.conflict === true);
    findings.push({
      findingId: `text-finding-${index + 1}`,
      kind: "text",
      title: group.topic ?? group.documentName,
      documentName: group.documentName,
      ...(group.role !== undefined ? { role: group.role } : {}),
      ...(group.topic !== undefined ? { topic: group.topic } : {}),
      ...(cleanSummary !== undefined ? { cleanSummary } : {}),
      citations: group.citations,
      body: readableContent ?? group.bodies.join("\n\n"),
      flags,
      audit: group.audit,
    });
  });
  const textFindingCount = findings.length;

  // Tables become readable findings; a matching repair refines the body. A
  // Map is read by key only (never iterated) to stay ES target agnostic.
  const repairs = input.refinement?.repairedTables ?? [];
  const repairByEvidenceId = new Map<string, CompiledEvidenceRepairedTableInput>();
  for (const repair of repairs) {
    repairByEvidenceId.set(repair.evidenceId, repair);
  }
  const matchedRepairEvidenceIds = new Set<string>();
  const tableCountByDocument = new Map<string, number>();
  let repairedTableFindingCount = 0;
  tableInputs.forEach((entry, index) => {
    const documentName = documentNameOf(entry.sourceFileName);
    const perDocument = (tableCountByDocument.get(documentName) ?? 0) + 1;
    tableCountByDocument.set(documentName, perDocument);
    const repair = repairByEvidenceId.get(entry.evidenceId);
    if (repair !== undefined) {
      matchedRepairEvidenceIds.add(entry.evidenceId);
      repairedTableFindingCount += 1;
    }
    const sheetName = repair?.sheetName ?? entry.sheetName;
    const pageNumber = repair?.pageNumber ?? entry.pageNumber;
    const ref = refinementByEvidenceId.get(entry.evidenceId);
    const flags = defaultFlags();
    flags.tableRepaired = repair !== undefined;
    flags.aiRefined = repair !== undefined || ref !== undefined;
    flags.lowConfidence = ref?.lowConfidence === true;
    flags.conflict = ref?.conflict === true;
    findings.push({
      findingId: `table-finding-${index + 1}`,
      kind: "table",
      title:
        sheetName !== undefined
          ? `Table - ${sheetName}`
          : pageNumber !== undefined
            ? `Table - Page ${pageNumber}`
            : "Table",
      documentName,
      ...(entry.sourceFileRole !== undefined
        ? { role: entry.sourceFileRole }
        : {}),
      ...(ref?.cleanSummary !== undefined
        ? { cleanSummary: ref.cleanSummary }
        : {}),
      citations: [
        {
          tableLabel: `Table ${perDocument}`,
          ...(pageNumber !== undefined ? { pageLabel: `Page ${pageNumber}` } : {}),
          ...(sheetName !== undefined ? { sheetLabel: `Sheet: ${sheetName}` } : {}),
        },
      ],
      ...(ref?.readableContent !== undefined ? { body: ref.readableContent } : {}),
      table: { rows: repair !== undefined ? repair.rows : entry.rows },
      flags,
      audit: [tableAudit(entry)],
    });
  });

  // Any repair without a matching deterministic table is still a primary
  // finding (proposal-side refinement), with no deterministic audit backing.
  const leftoverRepairs = repairs.filter(
    (repair) => !matchedRepairEvidenceIds.has(repair.evidenceId)
  );
  leftoverRepairs.forEach((repair, leftoverIndex) => {
    repairedTableFindingCount += 1;
    findings.push({
      findingId: `table-finding-${tableInputs.length + leftoverIndex + 1}`,
      kind: "table",
      title:
        repair.sheetName !== undefined
          ? `Table - ${repair.sheetName}`
          : repair.pageNumber !== undefined
            ? `Table - Page ${repair.pageNumber}`
            : "Table",
      documentName: documentNameOf(repair.sourceFileName),
      ...(repair.sourceFileRole !== undefined
        ? { role: repair.sourceFileRole }
        : {}),
      citations: [
        {
          ...(repair.pageNumber !== undefined
            ? { pageLabel: `Page ${repair.pageNumber}` }
            : {}),
          ...(repair.sheetName !== undefined
            ? { sheetLabel: `Sheet: ${repair.sheetName}` }
            : {}),
        },
      ],
      table: { rows: repair.rows },
      flags: { ...defaultFlags(), tableRepaired: true, aiRefined: true },
      audit: [],
    });
  });
  const tableFindingCount = findings.length - textFindingCount;

  // Missing candidates are proposal-only findings, no deterministic backing.
  const missingCandidates = input.missingCandidates ?? [];
  missingCandidates.forEach((candidate, index) => {
    const citation: CompiledEvidenceCitation = {
      ...(candidate.passageLabel !== undefined
        ? { passageLabel: candidate.passageLabel }
        : {}),
      ...(candidate.pageLabel !== undefined
        ? { pageLabel: candidate.pageLabel }
        : {}),
      ...(candidate.sheetLabel !== undefined
        ? { sheetLabel: candidate.sheetLabel }
        : {}),
      ...(candidate.tableLabel !== undefined
        ? { tableLabel: candidate.tableLabel }
        : {}),
    };
    findings.push({
      findingId: `missing-finding-${index + 1}`,
      kind: "text",
      title: candidate.title,
      documentName: documentNameOf(candidate.sourceFileName),
      ...(candidate.sourceFileRole !== undefined
        ? { role: candidate.sourceFileRole }
        : {}),
      citations: Object.keys(citation).length > 0 ? [citation] : [],
      ...(candidate.description !== undefined
        ? { body: candidate.description }
        : {}),
      flags: {
        ...defaultFlags(),
        aiRefined: true,
        missingFromDeterministic: true,
      },
      audit: [],
    });
  });
  const missingCandidateFindingCount = missingCandidates.length;

  const deterministicTextInputCount = textInputs.length;
  const deterministicTableInputCount = tableInputs.length;
  const deterministicInputCount =
    deterministicTextInputCount + deterministicTableInputCount;
  const accountedInPrimaryCount = findings.reduce(
    (sum, finding) => sum + finding.audit.length,
    0
  );
  const suppressedCount = suppressed.length;

  // Per-flag counts across primary findings, so the operator can see how many
  // findings the caller marked low-confidence, conflicting, AI-refined, etc.
  const flagSummary = FLAG_NAMES.reduce((summary, flag) => {
    summary[flag] = findings.filter((finding) => finding.flags[flag]).length;
    return summary;
  }, {} as CompiledEvidenceFlagSummary);

  return {
    findings,
    suppressed,
    accounting: {
      deterministicInputCount,
      deterministicTextInputCount,
      deterministicTableInputCount,
      primaryFindingCount: findings.length,
      textFindingCount,
      tableFindingCount,
      repairedTableFindingCount,
      missingCandidateFindingCount,
      accountedInPrimaryCount,
      suppressedCount,
      suppressedByReason,
      flagSummary,
      balanced:
        accountedInPrimaryCount + suppressedCount === deterministicInputCount,
    },
  };
}
