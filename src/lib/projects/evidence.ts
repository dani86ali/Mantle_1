/**
 * Pure Project evidence-item materialization + retention helpers.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shape: src/types/project.ts (ProjectEvidenceItem, section 4).
 *
 * This module is PURE: it returns insert-ready plain objects shaped for the
 * Drizzle `project_evidence_items` table and computes evidence retention dates.
 * It does NOT import Drizzle, query the database, write rows, read file
 * contents, parse or validate BoQ formats, or import parsers. It does not
 * mutate its inputs; `content` is copied so a later caller mutation cannot
 * alter a returned row.
 *
 * Retention: extracted evidence must be retained for at least one year, so
 * `retainUntil = extractedAt + 1 year`. Automatic deletion is deferred. (section 4)
 */
import { calculateRetainUntil } from "@/lib/projects/files";

/**
 * One-year evidence retention: returns a NEW Date one calendar year after
 * `extractedAt`. Does not mutate the input. Reuses the shared file-retention
 * behavior so uploaded files and extracted evidence stay in lockstep. (section 4)
 */
export function calculateEvidenceRetainUntil(extractedAt: Date): Date {
  return calculateRetainUntil(extractedAt);
}

/** Input for {@link materializeProjectEvidenceItem}. */
export interface MaterializeProjectEvidenceItemInput {
  projectId: string;
  tenantId: string;
  sourceFileId: string;
  kind: string;
  content: Record<string, unknown>;
  /** Defaults to `new Date()` when omitted. */
  extractedAt?: Date;
}

/**
 * Insert-ready row shaped for the Drizzle `project_evidence_items` table. The
 * `id` is omitted; tenant id is carried explicitly (the table duplicates it per
 * row). Not a DB call.
 */
export interface MaterializedProjectEvidenceItem {
  projectId: string;
  tenantId: string;
  sourceFileId: string;
  kind: string;
  content: Record<string, unknown>;
  extractedAt: Date;
  retainUntil: Date;
}

/**
 * Build an insert-ready evidence-item row. Defaults `extractedAt` to now and
 * derives `retainUntil` from it. The `content` object is shallow-copied so a
 * later mutation of the caller's input does not alter the returned row.
 */
export function materializeProjectEvidenceItem(
  input: MaterializeProjectEvidenceItemInput
): MaterializedProjectEvidenceItem {
  const { projectId, tenantId, sourceFileId, kind } = input;
  const extractedAt = input.extractedAt ?? new Date();
  const retainUntil = calculateEvidenceRetainUntil(extractedAt);
  return {
    projectId,
    tenantId,
    sourceFileId,
    kind,
    content: { ...input.content },
    extractedAt,
    retainUntil,
  };
}
