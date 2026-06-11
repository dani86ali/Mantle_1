/**
 * RFP extraction-evidence persistence service.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shape: src/types/project.ts (ProjectEvidenceItem, section 4).
 *
 * Persists deterministic ProjectEvidenceItem rows for ONE approved
 * input_package by running the prompt-178 extraction service and writing
 * evidence ONLY after its deterministic quality gate passed: every non-ok
 * run status is propagated unchanged and a failed gate returns
 * quality_gate_failed - in both cases zero evidence is created. Document
 * text becomes rfp_document_text_chunk rows via a pure deterministic
 * splitter (paragraph boundaries preferred, then line, word, and hard
 * splits; no overlap; at most maxTextChunkChars per chunk) and every
 * extracted table becomes one rfp_document_table row; run document order is
 * preserved, each document's text chunks before its tables. Evidence
 * content carries only extraction output plus the input_package artifact id
 * and source file id/name/role - never a storagePath and never a tenantId.
 * No OCR, no AI, no requirement interpretation or compliance
 * classification, no SKU/catalog/pricing/configuration logic, no artifact
 * versions, no approvals, no routes or UI, no schema changes. Returned
 * summaries are lean and serializable (ISO dates, identifiers and counts,
 * no content bodies); inputs and run results are never mutated, and a store
 * failure bubbles to the caller unhidden.
 */
import {
  runRfpInputPackageExtraction,
  type RfpExtractionFileQualitySummary,
  type RfpExtractionQualityReport,
  type RfpExtractionRunArtifactSummary,
  type RunRfpInputPackageExtractionResult,
} from "@/lib/projects/project-rfp-extraction-run";
import { createProjectEvidenceItem } from "@/lib/db/project-evidence-store";
import type { ProjectEvidenceItem } from "@/types/project";

/** Evidence kind for one persisted document text chunk. */
export const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
/** Evidence kind for one persisted extracted table. */
export const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";
/** Default upper bound on persisted text-chunk length, in characters. */
export const DEFAULT_MAX_TEXT_CHUNK_CHARS = 3000;

/** The two evidence kinds this service persists. */
export type RfpExtractionEvidenceKind =
  | typeof RFP_TEXT_CHUNK_EVIDENCE_KIND
  | typeof RFP_TABLE_EVIDENCE_KIND;

/** Input for {@link persistRfpExtractionEvidence}. */
export interface PersistRfpExtractionEvidenceInput {
  tenantId: string;
  projectId: string;
  /** The exact APPROVED input_package version to extract and persist from. */
  inputPackageArtifactId: string;
  /** Extraction-run override for tests; defaults to the prompt-178 service. */
  runExtraction?: typeof runRfpInputPackageExtraction;
  /** Max characters per text chunk; positive integer, default 3000. */
  maxTextChunkChars?: number;
}

/** Identifier/count projection of one stored content body; no text or rows. */
export type RfpEvidenceContentSummary =
  | {
      evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
      chunkIndex: number;
      chunkCount: number;
      charCount: number;
    }
  | {
      evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
      tableId: string;
      rowCount: number;
      columnCount: number;
    };

/** Serializable summary of one stored evidence row; ISO dates, no content body. */
export interface RfpPersistedEvidenceSummary {
  id: string;
  projectId: string;
  sourceFileId: string;
  kind: RfpExtractionEvidenceKind;
  extractedAt: string;
  retainUntil: string;
  contentSummary: RfpEvidenceContentSummary;
}

/** Discriminated result of {@link persistRfpExtractionEvidence}. */
export type PersistRfpExtractionEvidenceResult =
  | Exclude<RunRfpInputPackageExtractionResult, { status: "ok" }>
  | {
      status: "quality_gate_failed";
      artifact: RfpExtractionRunArtifactSummary;
      files: RfpExtractionFileQualitySummary[];
      quality: RfpExtractionQualityReport;
    }
  | {
      status: "ok";
      artifact: RfpExtractionRunArtifactSummary;
      quality: RfpExtractionQualityReport;
      evidence: RfpPersistedEvidenceSummary[];
      evidenceCount: number;
      textChunkCount: number;
      tableEvidenceCount: number;
    };

/** Fixed-width fallback for one token longer than maxChars. */
function hardSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += maxChars) {
    chunks.push(text.slice(start, start + maxChars));
  }
  return chunks;
}

/**
 * Greedily repack split parts (rejoined with their separator) into in-order
 * chunks of at most maxChars; a part that alone exceeds maxChars is handed
 * to splitOversized and its pieces become standalone chunks.
 */
function packParts(
  parts: readonly string[],
  separator: string,
  maxChars: number,
  splitOversized: (part: string) => string[]
): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    if (part.length > maxChars) {
      if (current !== "") chunks.push(current);
      current = "";
      for (const piece of splitOversized(part)) chunks.push(piece);
      continue;
    }
    const candidate = current === "" ? part : `${current}${separator}${part}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current !== "") chunks.push(current);
      current = part;
    }
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

/**
 * Deterministically split document text into non-overlapping chunks of at
 * most maxChars: paragraph boundaries (blank lines) are preferred; an
 * oversized paragraph falls back to line splits, an oversized line to word
 * splits, and an oversized word to fixed-width slices. Joined content is
 * preserved except the separator dropped at each chunk boundary.
 */
export function chunkRfpDocumentText(text: string, maxChars: number): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error("maxChars must be a positive integer.");
  }
  const byWord = (part: string): string[] =>
    packParts(part.split(" "), " ", maxChars, (word) => hardSplit(word, maxChars));
  const byLine = (part: string): string[] =>
    packParts(part.split("\n"), "\n", maxChars, byWord);
  return packParts(text.split("\n\n"), "\n\n", maxChars, byLine);
}

/** Map one stored row plus its known content projection to the lean summary. */
function toEvidenceSummary(
  stored: ProjectEvidenceItem,
  contentSummary: RfpEvidenceContentSummary
): RfpPersistedEvidenceSummary {
  return {
    id: stored.id,
    projectId: stored.projectId,
    sourceFileId: stored.sourceFileId,
    kind: contentSummary.evidenceKind,
    extractedAt: stored.extractedAt.toISOString(),
    retainUntil: stored.retainUntil.toISOString(),
    contentSummary,
  };
}

/**
 * Run the prompt-178 extraction over ONE approved input_package and persist
 * its output as ProjectEvidenceItem rows, only when the deterministic
 * quality gate passed. Validates a nonblank inputPackageArtifactId (kept
 * local so an injected runExtraction cannot bypass it) and a positive
 * integer maxTextChunkChars before any run or store call. Non-ok run
 * statuses return unchanged; a failed quality gate returns
 * quality_gate_failed with the run's artifact, file, and quality summaries
 * - neither path creates evidence. On a passed gate, documents persist in
 * run order, each document's text chunks (1-based chunkIndex; none when the
 * trimmed text is empty) before its tables, every row tenant scoped through
 * createProjectEvidenceItem. Content copies metrics and table rows so
 * stored content never aliases the run result; a create failure bubbles
 * immediately and is never swallowed into a partial-success result.
 */
export async function persistRfpExtractionEvidence(
  input: PersistRfpExtractionEvidenceInput
): Promise<PersistRfpExtractionEvidenceResult> {
  if (
    !input.inputPackageArtifactId ||
    input.inputPackageArtifactId.trim() === ""
  ) {
    throw new Error("inputPackageArtifactId is required.");
  }
  const maxTextChunkChars =
    input.maxTextChunkChars ?? DEFAULT_MAX_TEXT_CHUNK_CHARS;
  if (!Number.isInteger(maxTextChunkChars) || maxTextChunkChars < 1) {
    throw new Error("maxTextChunkChars must be a positive integer.");
  }

  const { tenantId, projectId, inputPackageArtifactId } = input;
  const runExtraction = input.runExtraction ?? runRfpInputPackageExtraction;
  const run = await runExtraction({ tenantId, projectId, inputPackageArtifactId });
  if (run.status !== "ok") return run;
  if (run.quality.status !== "passed") {
    return {
      status: "quality_gate_failed",
      artifact: run.artifact,
      files: run.files,
      quality: run.quality,
    };
  }

  const evidence: RfpPersistedEvidenceSummary[] = [];
  let textChunkCount = 0;
  let tableEvidenceCount = 0;
  for (const document of run.documents) {
    const chunks =
      document.text.trim() === ""
        ? []
        : chunkRfpDocumentText(document.text, maxTextChunkChars);
    for (let index = 0; index < chunks.length; index += 1) {
      const stored = await createProjectEvidenceItem({
        tenantId,
        projectId,
        sourceFileId: document.sourceFileId,
        kind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
        content: {
          evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
          inputPackageArtifactId,
          sourceFileId: document.sourceFileId,
          sourceFileName: document.sourceFileName,
          sourceFileRole: document.sourceFileRole,
          chunkIndex: index + 1,
          chunkCount: chunks.length,
          text: chunks[index],
          charCount: chunks[index].length,
          documentMetrics: { ...document.metrics },
        },
      });
      textChunkCount += 1;
      evidence.push(
        toEvidenceSummary(stored, {
          evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
          chunkIndex: index + 1,
          chunkCount: chunks.length,
          charCount: chunks[index].length,
        })
      );
    }
    for (const table of document.tables) {
      const stored = await createProjectEvidenceItem({
        tenantId,
        projectId,
        sourceFileId: table.sourceFileId,
        kind: RFP_TABLE_EVIDENCE_KIND,
        content: {
          evidenceKind: RFP_TABLE_EVIDENCE_KIND,
          inputPackageArtifactId,
          sourceFileId: table.sourceFileId,
          sourceFileName: table.sourceFileName,
          sourceFileRole: table.sourceFileRole,
          tableId: table.tableId,
          ...(table.pageNumber !== undefined
            ? { pageNumber: table.pageNumber }
            : {}),
          ...(table.sheetName !== undefined
            ? { sheetName: table.sheetName }
            : {}),
          rowCount: table.rowCount,
          columnCount: table.columnCount,
          rows: table.rows.map((row) => row.slice()),
        },
      });
      tableEvidenceCount += 1;
      evidence.push(
        toEvidenceSummary(stored, {
          evidenceKind: RFP_TABLE_EVIDENCE_KIND,
          tableId: table.tableId,
          rowCount: table.rowCount,
          columnCount: table.columnCount,
        })
      );
    }
  }

  return {
    status: "ok",
    artifact: run.artifact,
    quality: run.quality,
    evidence,
    evidenceCount: evidence.length,
    textChunkCount,
    tableEvidenceCount,
  };
}
