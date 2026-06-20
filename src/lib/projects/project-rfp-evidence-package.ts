/**
 * RFP final evidence-package draft service (Stage 1A foundation).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Assembles the persisted RFP extraction evidence of ONE approved
 * input_package artifact version into ONE reviewable evidence_package
 * draft - the artifact a human must approve before requirements generation
 * may treat it as evidence authority. This service is deterministic
 * Project-state assembly only: no AI or model call, no OCR, no requirement
 * interpretation or compliance classification, no file or storage reads,
 * no extraction delta computation, no waiver persistence, no approvals,
 * no routes or UI, and no SKU, catalog, pricing, or configuration logic.
 * The two RFP extraction evidence kind literals are defined locally so
 * this module never pulls the extraction or persistence write modules
 * into its graph. Gates in order, tenant scoped on every store call:
 * project existence, rfp mode, exact input_package artifact existence,
 * input_package type within the intake_package_review stage, approved
 * status, nonempty sourceFileIds, at least one extraction evidence row
 * whose stored content names this exact package id, and full source-file
 * coverage (every package source file has at least one matching row - the
 * deterministic block-every-file MVP gate; engineer waivers are a later
 * prompt). On success exactly one needs_review evidence_package version
 * is created at intake_package_review; its payload copies sanitized
 * extraction content through explicit per-kind whitelists (identifier and
 * count fields, the chunk text body, fresh table row matrices, and the
 * four whitelisted finite numeric document metrics) - never a storage
 * path, never a tenantId, never a package payload field, never a thrown
 * error, never raw file bytes, and never an arbitrary evidence content
 * key. Returned summaries are lean and serializable (ISO dates, copied
 * arrays, identifiers and counts; the full payload is never surfaced).
 * Inputs, loaded rows, and artifacts are never mutated; store failures
 * bubble to the caller unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import { listProjectEvidenceItems } from "@/lib/db/project-evidence-store";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";

/** Payload discriminator stamped on every evidence_package draft payload. */
export const RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND = "rfp_evidence_package";

/** The artifact type / stage this service creates. */
const EVIDENCE_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "evidence_package";
const EVIDENCE_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/** The only artifact type / stage accepted as the package input. */
const INPUT_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] = "input_package";
const INPUT_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/**
 * The extraction_delta provenance source this draft may add after the input
 * package. The discriminator, payload kind, and resolved review vocabulary
 * are declared locally on purpose: importing the extraction-delta modules
 * would pull their AI/persistence graph into this deterministic draft
 * service. A delta is an eligible source only when its payload is a valid
 * rfp_extraction_delta for THIS input package whose every candidate is
 * resolved (accepted, rejected, or waived - never pending_review).
 */
const EXTRACTION_DELTA_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "extraction_delta";
const EXTRACTION_DELTA_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";
const RFP_EXTRACTION_DELTA_PAYLOAD_KIND = "rfp_extraction_delta";
const RFP_RESOLVED_CANDIDATE_STATUSES = [
  "accepted",
  "rejected",
  "waived",
] as const;

/**
 * The two persisted RFP extraction evidence kinds this package assembles.
 * Defined locally on purpose: importing them would pull the
 * extraction/persistence write modules into this draft service.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/** Kind of one assembled evidence entry. */
export type RfpEvidencePackageEvidenceKind =
  | typeof RFP_TEXT_CHUNK_EVIDENCE_KIND
  | typeof RFP_TABLE_EVIDENCE_KIND;

/** Input for {@link createRfpEvidencePackageDraft}. */
export interface CreateRfpEvidencePackageDraftInput {
  tenantId: string;
  projectId: string;
  /** The exact APPROVED input_package version to assemble evidence from. */
  inputPackageArtifactId: string;
  createdBy: string;
}

/** The four whitelisted finite numeric metrics of one extracted document. */
export interface RfpEvidencePackageDocumentMetrics {
  textCharCount: number;
  nonWhitespaceTextCharCount: number;
  tableCount: number;
  tableRowCount: number;
}

/** Whitelisted sanitized copy of one persisted text-chunk evidence row. */
export interface RfpEvidencePackageTextEvidence {
  evidenceId: string;
  evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  /** Present only when the stored content field is a string. */
  sourceFileName?: string;
  /** Present only when the stored content field is a string. */
  sourceFileRole?: string;
  chunkIndex: number;
  chunkCount: number;
  charCount: number;
  /** The stored chunk text body; "" when the stored field is not a string. */
  text: string;
  /** Present only when every stored metric is a finite number. */
  documentMetrics?: RfpEvidencePackageDocumentMetrics;
}

/** Whitelisted sanitized copy of one persisted table evidence row. */
export interface RfpEvidencePackageTableEvidence {
  evidenceId: string;
  evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  /** Present only when the stored content field is a string. */
  sourceFileName?: string;
  /** Present only when the stored content field is a string. */
  sourceFileRole?: string;
  tableId: string;
  /** Present only when the stored content field is a finite number. */
  pageNumber?: number;
  /** Present only when the stored content field is a string. */
  sheetName?: string;
  rowCount: number;
  columnCount: number;
  /** Fresh matrix copy; malformed cells/rows/matrix degrade to ""/[]/[]. */
  rows: string[][];
}

/** One sanitized evidence entry, in listed evidence-row order. */
export type RfpEvidencePackageEvidence =
  | RfpEvidencePackageTextEvidence
  | RfpEvidencePackageTableEvidence;

/** The evidence_package draft artifact payload. */
export type RfpEvidencePackagePayload = {
  payloadKind: typeof RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND;
  createdBy: string;
  /** ISO creation timestamp. */
  createdAt: string;
  inputPackageArtifactId: string;
  evidenceCount: number;
  textChunkCount: number;
  tableEvidenceCount: number;
  /** Copied from the approved input package, order preserved. */
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  /** Sanitized entries, in listed evidence-row order after filtering. */
  evidence: RfpEvidencePackageEvidence[];
};

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpEvidencePackageProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied arrays, no payload. */
export interface RfpEvidencePackageArtifactSummary {
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

/** Identifier/count projection of the created payload; no evidence bodies. */
export interface RfpEvidencePackagePayloadSummary {
  payloadKind: typeof RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  inputPackageArtifactId: string;
  evidenceCount: number;
  textChunkCount: number;
  tableEvidenceCount: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
}

/** Discriminated result of {@link createRfpEvidencePackageDraft}. */
export type CreateRfpEvidencePackageDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpEvidencePackageProjectSummary }
  | { status: "input_package_not_found" }
  | {
      status: "artifact_not_input_package";
      artifact: RfpEvidencePackageArtifactSummary;
    }
  | {
      status: "input_package_not_approved";
      artifact: RfpEvidencePackageArtifactSummary;
    }
  | {
      status: "input_package_has_no_source_files";
      artifact: RfpEvidencePackageArtifactSummary;
    }
  | { status: "extraction_evidence_not_found"; inputPackageArtifactId: string }
  | { status: "source_file_evidence_missing"; missingSourceFileIds: string[] }
  | {
      status: "ok";
      artifact: RfpEvidencePackageArtifactSummary;
      payloadSummary: RfpEvidencePackagePayloadSummary;
    };

/** True for the only two evidence kinds this package assembles. */
function isRfpExtractionEvidenceKind(
  kind: string
): kind is RfpEvidencePackageEvidenceKind {
  return (
    kind === RFP_TEXT_CHUNK_EVIDENCE_KIND || kind === RFP_TABLE_EVIDENCE_KIND
  );
}

/** True for a finite number content field. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Read one string content field; "" when missing or not a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Read one count content field; 0 when missing or not a finite number. */
function asCount(value: unknown): number {
  return isFiniteNumber(value) ? value : 0;
}

/** Read one optional numeric content field; omitted when not finite. */
function asOptionalNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

/** Read one optional string content field; omitted when not a string. */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Whitelisted copy of the four stored document metrics, or undefined (the
 * entry omits the field) unless the stored value is a plain non-array
 * record whose four named metrics are all finite numbers. Extra stored
 * keys are never copied.
 */
function toDocumentMetrics(
  value: unknown
): RfpEvidencePackageDocumentMetrics | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const textCharCount = record.textCharCount;
  const nonWhitespaceTextCharCount = record.nonWhitespaceTextCharCount;
  const tableCount = record.tableCount;
  const tableRowCount = record.tableRowCount;
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
 * Fresh string matrix copy of one stored rows value: a malformed cell
 * degrades to "", a malformed row to [], and a malformed matrix to [].
 */
function toTableRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => (typeof cell === "string" ? cell : ""))
      : []
  );
}

/**
 * True only for a loaded extraction_delta artifact that is an eligible
 * provenance source for THIS input package: it sits at the extraction_delta
 * type within the intake_package_review stage, its payload is a plain
 * non-array object stamped rfp_extraction_delta whose inputPackageArtifactId
 * strictly equals the requested package id, and its candidates are a plain
 * array in which every entry is a plain object whose reviewStatus is one of
 * the resolved values (accepted, rejected, or waived). A pending_review,
 * missing, or unknown status, a malformed candidate entry, a malformed
 * candidates array, the wrong payload kind, the wrong type/stage, or the
 * wrong input package makes the delta ineligible. The artifact is read
 * only; nothing is mutated.
 */
function isResolvedExtractionDeltaForPackage(
  artifact: ProjectArtifact,
  inputPackageArtifactId: string
): boolean {
  if (
    artifact.type !== EXTRACTION_DELTA_ARTIFACT_TYPE ||
    artifact.stageId !== EXTRACTION_DELTA_STAGE_ID
  ) {
    return false;
  }
  const payload = artifact.payload;
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  if (record.payloadKind !== RFP_EXTRACTION_DELTA_PAYLOAD_KIND) return false;
  if (record.inputPackageArtifactId !== inputPackageArtifactId) return false;
  const candidates = record.candidates;
  if (!Array.isArray(candidates)) return false;
  for (const candidate of candidates) {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return false;
    }
    const reviewStatus = (candidate as Record<string, unknown>).reviewStatus;
    if (
      typeof reviewStatus !== "string" ||
      !RFP_RESOLVED_CANDIDATE_STATUSES.includes(
        reviewStatus as (typeof RFP_RESOLVED_CANDIDATE_STATUSES)[number]
      )
    ) {
      return false;
    }
  }
  return true;
}

/** Lean wrong-mode Project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpEvidencePackageProjectSummary {
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

/** Project one loaded or stored artifact to a lean summary; arrays copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpEvidencePackageArtifactSummary {
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

/** Whitelisted sanitized text-chunk entry; the stored row is never aliased. */
function toTextEvidence(
  item: ProjectEvidenceItem,
  inputPackageArtifactId: string
): RfpEvidencePackageTextEvidence {
  const content = item.content;
  const sourceFileName = asOptionalString(content.sourceFileName);
  const sourceFileRole = asOptionalString(content.sourceFileRole);
  const documentMetrics = toDocumentMetrics(content.documentMetrics);
  return {
    evidenceId: item.id,
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    sourceFileId: item.sourceFileId,
    inputPackageArtifactId,
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
    chunkIndex: asCount(content.chunkIndex),
    chunkCount: asCount(content.chunkCount),
    charCount: asCount(content.charCount),
    text: asString(content.text),
    ...(documentMetrics !== undefined ? { documentMetrics } : {}),
  };
}

/** Whitelisted sanitized table entry; the stored rows are never aliased. */
function toTableEvidence(
  item: ProjectEvidenceItem,
  inputPackageArtifactId: string
): RfpEvidencePackageTableEvidence {
  const content = item.content;
  const sourceFileName = asOptionalString(content.sourceFileName);
  const sourceFileRole = asOptionalString(content.sourceFileRole);
  const pageNumber = asOptionalNumber(content.pageNumber);
  const sheetName = asOptionalString(content.sheetName);
  return {
    evidenceId: item.id,
    evidenceKind: RFP_TABLE_EVIDENCE_KIND,
    sourceFileId: item.sourceFileId,
    inputPackageArtifactId,
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
    tableId: asString(content.tableId),
    ...(pageNumber !== undefined ? { pageNumber } : {}),
    ...(sheetName !== undefined ? { sheetName } : {}),
    rowCount: asCount(content.rowCount),
    columnCount: asCount(content.columnCount),
    rows: toTableRows(content.rows),
  };
}

/**
 * Create ONE reviewable evidence_package draft artifact version from the
 * persisted RFP extraction evidence of ONE approved input_package version.
 * Validates nonblank projectId, inputPackageArtifactId, and createdBy
 * before any store call (deterministic programmer errors); createdBy is
 * stored trimmed. Gates in order, tenant scoped on every store call:
 * project existence, rfp mode, exact artifact existence, input_package
 * type within the intake_package_review stage, approved status, nonempty
 * sourceFileIds. Evidence is listed only after every package gate passed
 * and filtered to the two RFP extraction kinds whose stored
 * content.inputPackageArtifactId strictly equals the requested package id;
 * zero matches abort with extraction_evidence_not_found, and a package
 * source file with no matching row aborts with source_file_evidence_missing
 * listing every uncovered file id in package order - neither creates
 * anything. On success exactly one needs_review evidence_package version
 * is created at intake_package_review whose sourceFileIds copy the package
 * list in order and whose sourceArtifactIds are the package id, followed by
 * the latest resolved extraction_delta source for that package when one
 * exists (its candidates all accepted, rejected, or waived); unresolved,
 * malformed, or wrong-package deltas are ignored and never block creation;
 * the payload carries the discriminator, trimmed createdBy, ISO createdAt,
 * counts, the copied id arrays, and the sanitized entries in listed
 * evidence-row order. The ok result surfaces lean artifact and payload
 * summaries only - never the full payload. Nothing is mutated; store
 * failures bubble.
 */
export async function createRfpEvidencePackageDraft(
  input: CreateRfpEvidencePackageDraftInput
): Promise<CreateRfpEvidencePackageDraftResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (
    typeof input.inputPackageArtifactId !== "string" ||
    input.inputPackageArtifactId.trim() === ""
  ) {
    throw new Error("inputPackageArtifactId is required.");
  }
  if (typeof input.createdBy !== "string" || input.createdBy.trim() === "") {
    throw new Error("createdBy is required.");
  }
  const createdBy = input.createdBy.trim();
  const { tenantId, projectId, inputPackageArtifactId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const inputPackage = await getProjectArtifactById(
    tenantId,
    projectId,
    inputPackageArtifactId
  );
  if (inputPackage === null) return { status: "input_package_not_found" };
  if (
    inputPackage.type !== INPUT_PACKAGE_ARTIFACT_TYPE ||
    inputPackage.stageId !== INPUT_PACKAGE_STAGE_ID
  ) {
    return {
      status: "artifact_not_input_package",
      artifact: toArtifactSummary(inputPackage),
    };
  }
  if (inputPackage.status !== "approved") {
    return {
      status: "input_package_not_approved",
      artifact: toArtifactSummary(inputPackage),
    };
  }
  if (inputPackage.sourceFileIds.length === 0) {
    return {
      status: "input_package_has_no_source_files",
      artifact: toArtifactSummary(inputPackage),
    };
  }

  const listed = await listProjectEvidenceItems(tenantId, projectId);
  // Strict equality on the stored content reference: a missing, blank, or
  // non-string content.inputPackageArtifactId never matches the requested
  // nonblank package id, so unrelated rows are ignored.
  const matching = listed.filter(
    (item) =>
      isRfpExtractionEvidenceKind(item.kind) &&
      item.content.inputPackageArtifactId === inputPackageArtifactId
  );
  if (matching.length === 0) {
    return { status: "extraction_evidence_not_found", inputPackageArtifactId };
  }

  // Block-every-file MVP coverage gate: every package source file needs at
  // least one matching extraction evidence row; waivers are a later prompt.
  const coveredFileIds = new Set<string>();
  for (const item of matching) coveredFileIds.add(item.sourceFileId);
  const missingSourceFileIds = inputPackage.sourceFileIds.filter(
    (fileId) => !coveredFileIds.has(fileId)
  );
  if (missingSourceFileIds.length > 0) {
    return { status: "source_file_evidence_missing", missingSourceFileIds };
  }

  const evidence: RfpEvidencePackageEvidence[] = matching.map((item) =>
    item.kind === RFP_TEXT_CHUNK_EVIDENCE_KIND
      ? toTextEvidence(item, inputPackageArtifactId)
      : toTableEvidence(item, inputPackageArtifactId)
  );
  const textChunkCount = evidence.filter(
    (entry) => entry.evidenceKind === RFP_TEXT_CHUNK_EVIDENCE_KIND
  ).length;
  const tableEvidenceCount = evidence.length - textChunkCount;

  // Provenance: after the deterministic gates pass, add the latest resolved
  // extraction_delta source for THIS input package when one exists. The
  // highest-version eligible delta wins; unresolved, malformed, or
  // wrong-package deltas are ignored and never block draft creation.
  const deltaArtifacts = await listProjectArtifactsByType(
    tenantId,
    projectId,
    EXTRACTION_DELTA_ARTIFACT_TYPE
  );
  let selectedDelta: ProjectArtifact | null = null;
  for (const delta of deltaArtifacts) {
    if (!isResolvedExtractionDeltaForPackage(delta, inputPackageArtifactId)) {
      continue;
    }
    if (selectedDelta === null || delta.version > selectedDelta.version) {
      selectedDelta = delta;
    }
  }
  const sourceArtifactIds =
    selectedDelta === null
      ? [inputPackageArtifactId]
      : [inputPackageArtifactId, selectedDelta.id];

  const createdAt = new Date().toISOString();
  const payload: RfpEvidencePackagePayload = {
    payloadKind: RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND,
    createdBy,
    createdAt,
    inputPackageArtifactId,
    evidenceCount: evidence.length,
    textChunkCount,
    tableEvidenceCount,
    sourceFileIds: inputPackage.sourceFileIds.slice(),
    sourceArtifactIds: sourceArtifactIds.slice(),
    evidence,
  };

  const stored = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: EVIDENCE_PACKAGE_STAGE_ID,
    type: EVIDENCE_PACKAGE_ARTIFACT_TYPE,
    status: "needs_review",
    payload,
    sourceFileIds: inputPackage.sourceFileIds.slice(),
    sourceArtifactIds: sourceArtifactIds.slice(),
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(stored),
    payloadSummary: {
      payloadKind: RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND,
      createdBy,
      createdAt,
      inputPackageArtifactId,
      evidenceCount: evidence.length,
      textChunkCount,
      tableEvidenceCount,
      sourceFileIds: inputPackage.sourceFileIds.slice(),
      sourceArtifactIds: sourceArtifactIds.slice(),
    },
  };
}
