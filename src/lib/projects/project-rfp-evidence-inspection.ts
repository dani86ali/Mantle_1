/**
 * RFP extraction-evidence inspection read model (Milestone 1).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Read-only engineer inspection over the evidence rows prompt 179 persisted:
 * a Project-gated list of lean summaries plus a single-item sanitized detail
 * view. Both services load the Project by exact tenant/project id, return
 * not_found when it is missing and wrong_mode (with a lean no-tenantId
 * project summary) when it is not an rfp Project, and read evidence only
 * after that gate passes. Only the two RFP extraction kinds
 * (rfp_document_text_chunk / rfp_document_table) are inspectable here: the
 * list ignores every other evidence kind and the detail reports
 * evidence_not_found rather than exposing unrelated evidence through this
 * surface. List summaries carry identifiers, ISO dates, and counts - never a
 * text body and never table rows. The detail copies persisted content
 * through an explicit field whitelist (text body and a copied string rows
 * matrix included, for engineer inspection) so arbitrary content keys - a
 * tenantId or storagePath smuggled into malformed content included - can
 * never surface. Malformed content fields degrade to safe fallbacks ("", 0,
 * omitted optionals) instead of throwing. This module reads only Project and
 * ProjectEvidenceItem rows and writes nothing: no artifact versions, no
 * approvals, no file or storage reads, no OCR, no AI, no requirement
 * interpretation or compliance classification, and no
 * SKU/catalog/pricing/configuration logic. Loaded rows and their content are
 * never mutated, and store failures bubble to the caller unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectEvidenceItemById,
  listProjectEvidenceItems,
} from "@/lib/db/project-evidence-store";
import {
  RFP_TABLE_EVIDENCE_KIND,
  RFP_TEXT_CHUNK_EVIDENCE_KIND,
  type RfpExtractionEvidenceKind,
} from "@/lib/projects/project-rfp-evidence-persistence";
import type { Project, ProjectEvidenceItem } from "@/types/project";

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpEvidenceInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Count projection of one stored documentMetrics content field. */
export interface RfpEvidenceDocumentMetrics {
  textCharCount: number;
  nonWhitespaceTextCharCount: number;
  tableCount: number;
  tableRowCount: number;
}

/** Identifier/count projection of one stored content body; no text, no rows. */
export type RfpEvidenceListContentSummary =
  | {
      evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
      inputPackageArtifactId: string;
      sourceFileName: string;
      sourceFileRole: string;
      chunkIndex: number;
      chunkCount: number;
      charCount: number;
      documentMetrics?: RfpEvidenceDocumentMetrics;
    }
  | {
      evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
      inputPackageArtifactId: string;
      sourceFileName: string;
      sourceFileRole: string;
      tableId: string;
      pageNumber?: number;
      sheetName?: string;
      rowCount: number;
      columnCount: number;
    };

/** Serializable list entry for one stored evidence row; no content body. */
export interface RfpEvidenceListItemSummary {
  id: string;
  projectId: string;
  sourceFileId: string;
  kind: RfpExtractionEvidenceKind;
  extractedAt: string;
  retainUntil: string;
  contentSummary: RfpEvidenceListContentSummary;
}

/** Echo of the filters actually applied; blank/absent ones are omitted. */
export interface RfpEvidenceListFilters {
  sourceFileId?: string;
  kind?: RfpExtractionEvidenceKind;
  inputPackageArtifactId?: string;
}

/** Input for {@link loadRfpProjectEvidenceList}. */
export interface LoadRfpProjectEvidenceListInput {
  tenantId: string;
  projectId: string;
  /** Exact source-file filter; blank values are ignored. */
  sourceFileId?: string;
  /** Exact kind filter over the two RFP extraction kinds. */
  kind?: RfpExtractionEvidenceKind;
  /** Exact content inputPackageArtifactId filter; blank values are ignored. */
  inputPackageArtifactId?: string;
  /** Project-read override for tests; defaults to the project store. */
  getProject?: typeof getProjectById;
  /** Evidence-list override for tests; defaults to the evidence store. */
  listEvidence?: typeof listProjectEvidenceItems;
}

/** Discriminated result of {@link loadRfpProjectEvidenceList}. */
export type LoadRfpProjectEvidenceListResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpEvidenceInspectionProjectSummary }
  | {
      status: "ok";
      project: RfpEvidenceInspectionProjectSummary;
      filters: RfpEvidenceListFilters;
      evidence: RfpEvidenceListItemSummary[];
      evidenceCount: number;
      textChunkCount: number;
      tableEvidenceCount: number;
    };

/** Whitelist-copied detail projection of one stored content body. */
export type RfpEvidenceDetailContent =
  | {
      evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
      inputPackageArtifactId: string;
      sourceFileId: string;
      sourceFileName: string;
      sourceFileRole: string;
      chunkIndex: number;
      chunkCount: number;
      text: string;
      charCount: number;
      documentMetrics?: RfpEvidenceDocumentMetrics;
    }
  | {
      evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
      inputPackageArtifactId: string;
      sourceFileId: string;
      sourceFileName: string;
      sourceFileRole: string;
      tableId: string;
      pageNumber?: number;
      sheetName?: string;
      rowCount: number;
      columnCount: number;
      rows: string[][];
    };

/** Sanitized single-item detail; content is whitelist-copied, never aliased. */
export interface RfpEvidenceDetail {
  id: string;
  projectId: string;
  sourceFileId: string;
  kind: RfpExtractionEvidenceKind;
  extractedAt: string;
  retainUntil: string;
  content: RfpEvidenceDetailContent;
}

/** Input for {@link loadRfpProjectEvidenceDetail}. */
export interface LoadRfpProjectEvidenceDetailInput {
  tenantId: string;
  projectId: string;
  evidenceItemId: string;
  /** Project-read override for tests; defaults to the project store. */
  getProject?: typeof getProjectById;
  /** Evidence-read override for tests; defaults to the evidence store. */
  getEvidenceItem?: typeof getProjectEvidenceItemById;
}

/** Discriminated result of {@link loadRfpProjectEvidenceDetail}. */
export type LoadRfpProjectEvidenceDetailResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpEvidenceInspectionProjectSummary }
  | { status: "evidence_not_found" }
  | {
      status: "ok";
      project: RfpEvidenceInspectionProjectSummary;
      evidence: RfpEvidenceDetail;
    };

/** True for the only two evidence kinds this inspection surface exposes. */
function isRfpExtractionEvidenceKind(
  kind: string
): kind is RfpExtractionEvidenceKind {
  return (
    kind === RFP_TEXT_CHUNK_EVIDENCE_KIND || kind === RFP_TABLE_EVIDENCE_KIND
  );
}

/** Lean wrong-mode/ok Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpEvidenceInspectionProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Read one string content field; "" when missing or not a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Read one count content field; 0 when missing or not a finite number. */
function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Read one optional numeric content field; omitted when not finite. */
function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Read one optional string content field; omitted when not a string. */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Count projection of stored documentMetrics; omitted when not an object. */
function toDocumentMetrics(
  value: unknown
): RfpEvidenceDocumentMetrics | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const metrics = value as Record<string, unknown>;
  return {
    textCharCount: asCount(metrics.textCharCount),
    nonWhitespaceTextCharCount: asCount(metrics.nonWhitespaceTextCharCount),
    tableCount: asCount(metrics.tableCount),
    tableRowCount: asCount(metrics.tableRowCount),
  };
}

/** Copy stored rows into a fresh string matrix; malformed parts degrade. */
function toRowsMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []
  );
}

/** Shared identifier fields every sanitized content projection carries. */
function toContentIdentifiers(content: Record<string, unknown>): {
  inputPackageArtifactId: string;
  sourceFileName: string;
  sourceFileRole: string;
} {
  return {
    inputPackageArtifactId: asString(content.inputPackageArtifactId),
    sourceFileName: asString(content.sourceFileName),
    sourceFileRole: asString(content.sourceFileRole),
  };
}

/** Lean list projection of one stored content body; no text, no rows. */
function toListContentSummary(
  content: Record<string, unknown>,
  kind: RfpExtractionEvidenceKind
): RfpEvidenceListContentSummary {
  if (kind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(content.pageNumber);
    const sheetName = asOptionalString(content.sheetName);
    return {
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      ...toContentIdentifiers(content),
      tableId: asString(content.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(content.rowCount),
      columnCount: asCount(content.columnCount),
    };
  }
  const documentMetrics = toDocumentMetrics(content.documentMetrics);
  return {
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    ...toContentIdentifiers(content),
    chunkIndex: asCount(content.chunkIndex),
    chunkCount: asCount(content.chunkCount),
    charCount: asCount(content.charCount),
    ...(documentMetrics !== undefined ? { documentMetrics } : {}),
  };
}

/** Project one stored row to its lean list entry; ISO dates, no body. */
function toListItemSummary(
  item: ProjectEvidenceItem,
  kind: RfpExtractionEvidenceKind
): RfpEvidenceListItemSummary {
  return {
    id: item.id,
    projectId: item.projectId,
    sourceFileId: item.sourceFileId,
    kind,
    extractedAt: item.extractedAt.toISOString(),
    retainUntil: item.retainUntil.toISOString(),
    contentSummary: toListContentSummary(item.content, kind),
  };
}

/** Whitelist-copy one stored content body for the detail view. */
function toDetailContent(
  content: Record<string, unknown>,
  kind: RfpExtractionEvidenceKind
): RfpEvidenceDetailContent {
  if (kind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(content.pageNumber);
    const sheetName = asOptionalString(content.sheetName);
    return {
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      ...toContentIdentifiers(content),
      sourceFileId: asString(content.sourceFileId),
      tableId: asString(content.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(content.rowCount),
      columnCount: asCount(content.columnCount),
      rows: toRowsMatrix(content.rows),
    };
  }
  const documentMetrics = toDocumentMetrics(content.documentMetrics);
  return {
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    ...toContentIdentifiers(content),
    sourceFileId: asString(content.sourceFileId),
    chunkIndex: asCount(content.chunkIndex),
    chunkCount: asCount(content.chunkCount),
    text: asString(content.text),
    charCount: asCount(content.charCount),
    ...(documentMetrics !== undefined ? { documentMetrics } : {}),
  };
}

/**
 * List one rfp Project's persisted RFP extraction evidence as lean
 * serializable summaries. Validates a nonblank projectId before any store
 * call (deterministic programmer error), gates on project existence and rfp
 * mode, then lists evidence tenant/project scoped and keeps only the two RFP
 * extraction kinds. Optional exact-match filters narrow further: blank
 * sourceFileId / inputPackageArtifactId values are ignored, and the
 * inputPackageArtifactId filter matches the stored content field. The ok
 * result echoes only the filters actually applied and carries per-kind
 * counts; summaries never include a content body, a tenantId, or a
 * storagePath. Store rows are never mutated; store failures bubble.
 */
export async function loadRfpProjectEvidenceList(
  input: LoadRfpProjectEvidenceListInput
): Promise<LoadRfpProjectEvidenceListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const getProject = input.getProject ?? getProjectById;
  const project = await getProject(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const sourceFileId =
    input.sourceFileId !== undefined && input.sourceFileId.trim() !== ""
      ? input.sourceFileId
      : undefined;
  const kind = input.kind;
  const inputPackageArtifactId =
    input.inputPackageArtifactId !== undefined &&
    input.inputPackageArtifactId.trim() !== ""
      ? input.inputPackageArtifactId
      : undefined;

  const listEvidence = input.listEvidence ?? listProjectEvidenceItems;
  const items = await listEvidence(tenantId, projectId);

  const evidence: RfpEvidenceListItemSummary[] = [];
  let textChunkCount = 0;
  let tableEvidenceCount = 0;
  for (const item of items) {
    const itemKind = item.kind;
    if (!isRfpExtractionEvidenceKind(itemKind)) continue;
    if (sourceFileId !== undefined && item.sourceFileId !== sourceFileId) {
      continue;
    }
    if (kind !== undefined && itemKind !== kind) continue;
    if (
      inputPackageArtifactId !== undefined &&
      item.content.inputPackageArtifactId !== inputPackageArtifactId
    ) {
      continue;
    }
    if (itemKind === RFP_TEXT_CHUNK_EVIDENCE_KIND) textChunkCount += 1;
    else tableEvidenceCount += 1;
    evidence.push(toListItemSummary(item, itemKind));
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    filters: {
      ...(sourceFileId !== undefined ? { sourceFileId } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(inputPackageArtifactId !== undefined
        ? { inputPackageArtifactId }
        : {}),
    },
    evidence,
    evidenceCount: evidence.length,
    textChunkCount,
    tableEvidenceCount,
  };
}

/**
 * Load one persisted RFP extraction evidence row as a sanitized detail.
 * Validates nonblank projectId and evidenceItemId before any store call
 * (deterministic programmer errors), gates on project existence and rfp
 * mode, then loads the row by exact tenant/project/evidence id. A missing
 * row - and a row of any kind other than the two RFP extraction kinds -
 * returns evidence_not_found, so unrelated evidence never leaks through
 * this RFP surface. The ok detail copies content through the per-kind field
 * whitelist (text body / copied string rows matrix included); arbitrary
 * content keys never surface and the stored row is never mutated. Store
 * failures bubble.
 */
export async function loadRfpProjectEvidenceDetail(
  input: LoadRfpProjectEvidenceDetailInput
): Promise<LoadRfpProjectEvidenceDetailResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (!input.evidenceItemId || input.evidenceItemId.trim() === "") {
    throw new Error("evidenceItemId is required.");
  }

  const { tenantId, projectId, evidenceItemId } = input;
  const getProject = input.getProject ?? getProjectById;
  const project = await getProject(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const getEvidenceItem = input.getEvidenceItem ?? getProjectEvidenceItemById;
  const item = await getEvidenceItem(tenantId, projectId, evidenceItemId);
  if (item === null) return { status: "evidence_not_found" };
  const kind = item.kind;
  if (!isRfpExtractionEvidenceKind(kind)) {
    return { status: "evidence_not_found" };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    evidence: {
      id: item.id,
      projectId: item.projectId,
      sourceFileId: item.sourceFileId,
      kind,
      extractedAt: item.extractedAt.toISOString(),
      retainUntil: item.retainUntil.toISOString(),
      content: toDetailContent(item.content, kind),
    },
  };
}
