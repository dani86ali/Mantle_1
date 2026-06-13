/**
 * RFP evidence-package inspection read model (Stage 1A).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts. The inspected payload shape is the
 * draft payload of src/lib/projects/project-rfp-evidence-package.ts, imported
 * type-only so this read module never pulls the draft-writing service into its
 * runtime graph.
 *
 * Read-only reviewer inspection over the evidence_package artifact versions
 * the Stage 1A draft service records: a Project-gated list of lean artifact
 * summaries plus a single-artifact sanitized evidence-package detail. Both
 * services load the Project by exact tenant/project id, return not_found when
 * it is missing and wrong_mode (with a lean no-tenantId project summary) when
 * it is not an rfp Project, and read artifacts only after that gate passes.
 * The list reads exactly the evidence_package artifact type, tenant/project
 * scoped, keeps only rows of that type, and projects each to identifiers, ISO
 * dates, copied source-id arrays, and an identifier/count payload summary read
 * through an explicit field whitelist; the evidence array is never read, so a
 * list summary never exposes evidence text bodies, table rows, a tenantId, a
 * storage path, or an arbitrary payload key, and malformed payload fields
 * degrade to safe fallbacks ("", 0, []) rather than throwing. The detail loads
 * the EXACT artifact version named by the caller and, because the
 * evidence_package is the final RFP evidence content a human reviews and
 * approves, whitelist-copies the full sanitized evidence: counts, the chunk
 * text bodies, and fresh table row matrices. Even there it drops storage
 * paths, a tenantId, provider metadata, arbitrary content keys, and any
 * SKU/catalog/pricing/configuration/export field, and never aliases into the
 * stored payload. This module reads only Project and ProjectArtifact rows and
 * writes nothing: no artifact versions, no approvals, no evidence-store reads,
 * no file or storage reads, no OCR, no AI, no extraction-delta computation,
 * and no requirement, compliance, SKU, catalog, pricing, or configuration
 * logic. Loaded rows are never mutated; store failures bubble unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import type {
  RfpEvidencePackageDocumentMetrics,
  RfpEvidencePackageEvidence,
  RfpEvidencePackagePayload,
  RfpEvidencePackageTableEvidence,
  RfpEvidencePackageTextEvidence,
} from "@/lib/projects/project-rfp-evidence-package";

/**
 * The payload discriminator every evidence_package draft payload carries.
 * Pinned locally against the canonical payload type so a drift in the draft
 * module fails typecheck here without a runtime value import.
 */
const RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND: RfpEvidencePackagePayload["payloadKind"] =
  "rfp_evidence_package";

/** The only artifact type / stage this inspection surface exposes. */
const EVIDENCE_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "evidence_package";
const EVIDENCE_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/**
 * The two evidence kinds a stored evidence entry may carry, pinned locally
 * against the canonical entry types (type-only) so a drift in the draft module
 * fails typecheck here too.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND: RfpEvidencePackageTextEvidence["evidenceKind"] =
  "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND: RfpEvidencePackageTableEvidence["evidenceKind"] =
  "rfp_document_table";

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpEvidencePackageInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied arrays, no payload. */
export interface RfpEvidencePackageInspectionArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Identifier/count projection of one stored payload, read through the field
 * whitelist only; malformed fields degrade to "" / 0 / []. Evidence text
 * bodies and table rows never appear in a list summary.
 */
export interface RfpEvidencePackageInspectionPayloadSummary {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  inputPackageArtifactId: string;
  evidenceCount: number;
  textChunkCount: number;
  tableEvidenceCount: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
}

/** One list entry: the artifact summary plus its lean payload summary. */
export interface RfpEvidencePackageInspectionListItem
  extends RfpEvidencePackageInspectionArtifactSummary {
  payloadSummary: RfpEvidencePackageInspectionPayloadSummary;
}

/** Input for {@link loadRfpEvidencePackageList}. */
export interface LoadRfpEvidencePackageListInput {
  tenantId: string;
  projectId: string;
}

/** Discriminated result of {@link loadRfpEvidencePackageList}. */
export type LoadRfpEvidencePackageListResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpEvidencePackageInspectionProjectSummary;
    }
  | {
      status: "ok";
      project: RfpEvidencePackageInspectionProjectSummary;
      artifacts: RfpEvidencePackageInspectionListItem[];
      artifactCount: number;
    };

/**
 * Sanitized whitelist copy of one stored evidence_package payload. The
 * evidence entries carry the chunk text bodies and fresh table row matrices
 * because this is the final evidence content under human review.
 */
export interface RfpEvidencePackageInspectionPackage {
  payloadKind: RfpEvidencePackagePayload["payloadKind"];
  createdBy: string;
  createdAt: string;
  inputPackageArtifactId: string;
  evidenceCount: number;
  textChunkCount: number;
  tableEvidenceCount: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  evidence: RfpEvidencePackageEvidence[];
}

/** Input for {@link loadRfpEvidencePackageDetail}. */
export interface LoadRfpEvidencePackageDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

/** Discriminated result of {@link loadRfpEvidencePackageDetail}. */
export type LoadRfpEvidencePackageDetailResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpEvidencePackageInspectionProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_evidence_package";
      artifact: RfpEvidencePackageInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpEvidencePackageInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpEvidencePackageInspectionProjectSummary;
      artifact: RfpEvidencePackageInspectionArtifactSummary;
      package: RfpEvidencePackageInspectionPackage;
    };

/** True for a plain object record; arrays and null are not records. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A payload value as a plain record; {} when it is anything else. */
function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

/** True for a finite number field. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Read one string payload field; "" when missing or not a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Read one count payload field; 0 when missing or not a finite number. */
function asCount(value: unknown): number {
  return isFiniteNumber(value) ? value : 0;
}

/** Read one optional numeric payload field; omitted when not finite. */
function asOptionalNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

/** Read one optional string payload field; omitted when not a string. */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Fresh copy of a stored string array; [] unless every entry is a string. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  if (!value.every((entry) => typeof entry === "string")) return [];
  return value.map((entry) => String(entry));
}

/**
 * Whitelisted copy of the four stored document metrics, or undefined (the
 * entry omits the field) unless the stored value is a plain non-array record
 * whose four named metrics are all finite numbers. Extra stored keys are never
 * copied.
 */
function toDocumentMetrics(
  value: unknown
): RfpEvidencePackageDocumentMetrics | undefined {
  if (!isPlainRecord(value)) return undefined;
  const textCharCount = value.textCharCount;
  const nonWhitespaceTextCharCount = value.nonWhitespaceTextCharCount;
  const tableCount = value.tableCount;
  const tableRowCount = value.tableRowCount;
  if (
    !isFiniteNumber(textCharCount) ||
    !isFiniteNumber(nonWhitespaceTextCharCount) ||
    !isFiniteNumber(tableCount) ||
    !isFiniteNumber(tableRowCount)
  ) {
    return undefined;
  }
  return {
    textCharCount,
    nonWhitespaceTextCharCount,
    tableCount,
    tableRowCount,
  };
}

/**
 * Fresh string matrix copy of one stored rows value: a malformed cell degrades
 * to "", a malformed row to [], and a malformed matrix to [].
 */
function toTableRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => (typeof cell === "string" ? cell : ""))
      : []
  );
}

/** Lean wrong-mode/ok Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpEvidencePackageInspectionProjectSummary {
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

/** Project one loaded artifact to a serializable summary; arrays copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpEvidencePackageInspectionArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/**
 * Identifier/count projection of one stored payload for the list. Reads the
 * whitelisted fields only - the marker, createdBy, createdAt, the package id,
 * the three counts, and the two source-id arrays - so arbitrary payload keys
 * (a tenantId or storage path smuggled into a malformed payload included) can
 * never surface, the evidence array is never read, and it never throws for a
 * malformed payload.
 */
function toPayloadSummary(
  payload: unknown
): RfpEvidencePackageInspectionPayloadSummary {
  const record = toRecord(payload);
  return {
    payloadKind: asString(record.payloadKind),
    createdBy: asString(record.createdBy),
    createdAt: asString(record.createdAt),
    inputPackageArtifactId: asString(record.inputPackageArtifactId),
    evidenceCount: asCount(record.evidenceCount),
    textChunkCount: asCount(record.textChunkCount),
    tableEvidenceCount: asCount(record.tableEvidenceCount),
    sourceFileIds: toStringArray(record.sourceFileIds),
    sourceArtifactIds: toStringArray(record.sourceArtifactIds),
  };
}

/** One list entry for a loaded evidence_package artifact version. */
function toListItem(
  artifact: ProjectArtifact
): RfpEvidencePackageInspectionListItem {
  return {
    ...toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(artifact.payload),
  };
}

/**
 * Build one fresh sanitized copy of a stored evidence entry through the
 * per-kind field whitelist. The table kind exposes identifiers, counts, the
 * optional locator fields, and a fresh row matrix; every other kind (the text
 * chunk kind, a malformed kind, a missing kind) degrades through the text
 * chunk shape exposing identifiers, counts, the chunk text body, and the four
 * whitelisted document metrics. Malformed fields degrade to safe fallbacks
 * ("" / 0 / [] / omitted optionals). The stored entry is never aliased;
 * arbitrary entry keys, storage paths, provider metadata, and a tenantId never
 * surface.
 */
function toEvidence(entry: unknown): RfpEvidencePackageEvidence {
  const record = toRecord(entry);
  const base = {
    evidenceId: asString(record.evidenceId),
    sourceFileId: asString(record.sourceFileId),
    inputPackageArtifactId: asString(record.inputPackageArtifactId),
  };
  const sourceFileName = asOptionalString(record.sourceFileName);
  const sourceFileRole = asOptionalString(record.sourceFileRole);
  if (record.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(record.pageNumber);
    const sheetName = asOptionalString(record.sheetName);
    return {
      ...base,
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      ...(sourceFileName !== undefined ? { sourceFileName } : {}),
      ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
      tableId: asString(record.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(record.rowCount),
      columnCount: asCount(record.columnCount),
      rows: toTableRows(record.rows),
    };
  }
  const documentMetrics = toDocumentMetrics(record.documentMetrics);
  return {
    ...base,
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
    chunkIndex: asCount(record.chunkIndex),
    chunkCount: asCount(record.chunkCount),
    charCount: asCount(record.charCount),
    text: asString(record.text),
    ...(documentMetrics !== undefined ? { documentMetrics } : {}),
  };
}

/**
 * List one rfp Project's evidence_package artifact versions as lean
 * serializable summaries. Validates a nonblank projectId before any store call
 * (deterministic programmer error), gates on project existence and rfp mode,
 * then reads exactly the evidence_package artifact type, tenant and project
 * scoped, keeping only rows of that type even if the store returns more. Every
 * entry carries identifiers, ISO dates, copied source-id arrays, and the
 * whitelisted payload summary; malformed payload fields degrade to safe
 * fallbacks and the list never throws for a malformed payload. Summaries never
 * read the evidence array, so evidence text, table rows, a tenantId, a storage
 * path, or any other payload key can never surface. Loaded rows are never
 * mutated; store failures bubble unhidden.
 */
export async function loadRfpEvidencePackageList(
  input: LoadRfpEvidencePackageListInput
): Promise<LoadRfpEvidencePackageListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const rows = await listProjectArtifactsByType(
    tenantId,
    projectId,
    EVIDENCE_PACKAGE_ARTIFACT_TYPE
  );
  const artifacts = rows
    .filter((row) => row.type === EVIDENCE_PACKAGE_ARTIFACT_TYPE)
    .map((row) => toListItem(row));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
  };
}

/**
 * Load the EXACT evidence_package artifact version named by the caller as a
 * sanitized evidence-package detail. Validates nonblank projectId and
 * artifactId before any store call (deterministic programmer errors), gates on
 * project existence and rfp mode, then loads the artifact by exact
 * tenant/project/artifact id. A missing artifact reports artifact_not_found;
 * an artifact that is not evidence_package at intake_package_review reports
 * artifact_not_evidence_package with a lean payload-free summary; a payload
 * that is not a plain object, whose marker is not the evidence-package
 * discriminator, or whose evidence array is malformed (not an array, or
 * holding a non-object entry) reports invalid_payload the same lean way. The
 * ok result carries the project and artifact summaries plus the whitelist copy
 * of the evidence-package payload shape. Because this is the final RFP evidence
 * content under human review, the detail does expose the chunk text bodies and
 * fresh table row matrices, but it still drops storage paths, a tenantId,
 * provider metadata, arbitrary content keys, and any SKU/catalog/pricing/
 * configuration/export field, and never aliases into the stored payload.
 * Loaded rows are never mutated; store failures bubble unhidden.
 */
export async function loadRfpEvidencePackageDetail(
  input: LoadRfpEvidencePackageDetailInput
): Promise<LoadRfpEvidencePackageDetailResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }

  const { tenantId, projectId, artifactId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(
    tenantId,
    projectId,
    artifactId
  );
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== EVIDENCE_PACKAGE_ARTIFACT_TYPE ||
    artifact.stageId !== EVIDENCE_PACKAGE_STAGE_ID
  ) {
    return {
      status: "artifact_not_evidence_package",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = toRecord(artifact.payload);
  const evidence = payload.evidence;
  if (
    payload.payloadKind !== RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND ||
    !Array.isArray(evidence) ||
    evidence.some((entry) => !isPlainRecord(entry))
  ) {
    return {
      status: "invalid_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    package: {
      payloadKind: RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND,
      createdBy: asString(payload.createdBy),
      createdAt: asString(payload.createdAt),
      inputPackageArtifactId: asString(payload.inputPackageArtifactId),
      evidenceCount: asCount(payload.evidenceCount),
      textChunkCount: asCount(payload.textChunkCount),
      tableEvidenceCount: asCount(payload.tableEvidenceCount),
      sourceFileIds: toStringArray(payload.sourceFileIds),
      sourceArtifactIds: toStringArray(payload.sourceArtifactIds),
      evidence: evidence.map((entry) => toEvidence(entry)),
    },
  };
}
