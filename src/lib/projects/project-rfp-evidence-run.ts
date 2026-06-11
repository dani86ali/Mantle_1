/**
 * RFP extraction-evidence run service (API seam for prompt-179 persistence).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Runs evidence persistence for ONE approved input_package artifact with
 * duplicate protection: before any write, the Project's existing evidence is
 * listed (tenant/project scoped) and filtered to RFP extraction evidence
 * (rfp_document_text_chunk / rfp_document_table rows) whose content names
 * this exact inputPackageArtifactId. When any such row exists the service
 * returns evidence_already_exists with lean serializable summaries of the
 * existing rows (identifiers, ISO dates, and counts only - never raw text,
 * table rows, a tenantId, or a storagePath) and the prompt-179 persistence
 * service is NOT called. Otherwise persistence runs and every one of its
 * statuses is propagated unchanged. This module performs no extraction, no
 * OCR, no AI, no requirement interpretation or compliance classification,
 * and no SKU/catalog/pricing/configuration logic; it creates no artifact
 * versions and no approvals. Existing rows are read, never mutated, and
 * unexpected list/persistence errors bubble to the caller unhidden.
 */
import {
  persistRfpExtractionEvidence,
  RFP_TABLE_EVIDENCE_KIND,
  RFP_TEXT_CHUNK_EVIDENCE_KIND,
  type PersistRfpExtractionEvidenceResult,
  type RfpEvidenceContentSummary,
  type RfpPersistedEvidenceSummary,
} from "@/lib/projects/project-rfp-evidence-persistence";
import { listProjectEvidenceItems } from "@/lib/db/project-evidence-store";
import type { ProjectEvidenceItem } from "@/types/project";

/** Input for {@link runRfpExtractionEvidencePersistence}. */
export interface RunRfpExtractionEvidencePersistenceInput {
  tenantId: string;
  projectId: string;
  /** The exact APPROVED input_package version to persist evidence from. */
  inputPackageArtifactId: string;
  /** Persistence override for tests; defaults to the prompt-179 service. */
  persistEvidence?: typeof persistRfpExtractionEvidence;
  /** Evidence-list override for tests; defaults to the evidence store. */
  listEvidenceItems?: typeof listProjectEvidenceItems;
}

/**
 * Discriminated result: every prompt-179 persistence status unchanged, plus
 * evidence_already_exists when this input package already has RFP extraction
 * evidence rows.
 */
export type RunRfpExtractionEvidencePersistenceResult =
  | PersistRfpExtractionEvidenceResult
  | {
      status: "evidence_already_exists";
      evidence: RfpPersistedEvidenceSummary[];
      evidenceCount: number;
      textChunkCount: number;
      tableEvidenceCount: number;
    };

/** Read one count content field; 0 when missing or not a finite number. */
function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Read one identifier content field; "" when missing or not a string. */
function asIdentifier(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** True when this stored row is RFP extraction evidence for this package. */
function isRfpExtractionEvidenceForPackage(
  item: ProjectEvidenceItem,
  inputPackageArtifactId: string
): boolean {
  return (
    (item.kind === RFP_TEXT_CHUNK_EVIDENCE_KIND ||
      item.kind === RFP_TABLE_EVIDENCE_KIND) &&
    item.content.inputPackageArtifactId === inputPackageArtifactId
  );
}

/**
 * Project one existing stored row to the lean duplicate summary. Content
 * bodies (text, table rows) are never copied out; a malformed content field
 * degrades to a safe fallback (0 / "") instead of throwing.
 */
function toExistingEvidenceSummary(
  item: ProjectEvidenceItem
): RfpPersistedEvidenceSummary {
  const contentSummary: RfpEvidenceContentSummary =
    item.kind === RFP_TABLE_EVIDENCE_KIND
      ? {
          evidenceKind: RFP_TABLE_EVIDENCE_KIND,
          tableId: asIdentifier(item.content.tableId),
          rowCount: asCount(item.content.rowCount),
          columnCount: asCount(item.content.columnCount),
        }
      : {
          evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
          chunkIndex: asCount(item.content.chunkIndex),
          chunkCount: asCount(item.content.chunkCount),
          charCount: asCount(item.content.charCount),
        };
  return {
    id: item.id,
    projectId: item.projectId,
    sourceFileId: item.sourceFileId,
    kind: contentSummary.evidenceKind,
    extractedAt: item.extractedAt.toISOString(),
    retainUntil: item.retainUntil.toISOString(),
    contentSummary,
  };
}

/**
 * Persist RFP extraction evidence for ONE approved input_package artifact,
 * refusing to double-write. Validates a nonblank inputPackageArtifactId
 * before any store or persistence call (deterministic programmer error).
 * Existing evidence is then listed tenant/project scoped; rows whose kind is
 * one of the two RFP extraction kinds AND whose content names this exact
 * inputPackageArtifactId are duplicates - evidence for other input packages
 * or of unrelated kinds is ignored. Any duplicate returns
 * evidence_already_exists (counts derived from the filtered rows) without
 * calling the persistence service; otherwise the prompt-179 service runs
 * with exactly { tenantId, projectId, inputPackageArtifactId } and its
 * result is returned unchanged. List/persistence failures bubble unhidden;
 * existing rows and their content are never mutated.
 */
export async function runRfpExtractionEvidencePersistence(
  input: RunRfpExtractionEvidencePersistenceInput
): Promise<RunRfpExtractionEvidencePersistenceResult> {
  if (
    !input.inputPackageArtifactId ||
    input.inputPackageArtifactId.trim() === ""
  ) {
    throw new Error("inputPackageArtifactId is required.");
  }

  const { tenantId, projectId, inputPackageArtifactId } = input;
  const listEvidence = input.listEvidenceItems ?? listProjectEvidenceItems;
  const items = await listEvidence(tenantId, projectId);
  const existing = items.filter((item) =>
    isRfpExtractionEvidenceForPackage(item, inputPackageArtifactId)
  );
  if (existing.length > 0) {
    const evidence = existing.map(toExistingEvidenceSummary);
    return {
      status: "evidence_already_exists",
      evidence,
      evidenceCount: evidence.length,
      textChunkCount: evidence.filter(
        (item) => item.kind === RFP_TEXT_CHUNK_EVIDENCE_KIND
      ).length,
      tableEvidenceCount: evidence.filter(
        (item) => item.kind === RFP_TABLE_EVIDENCE_KIND
      ).length,
    };
  }

  const persistEvidence = input.persistEvidence ?? persistRfpExtractionEvidence;
  return persistEvidence({ tenantId, projectId, inputPackageArtifactId });
}
