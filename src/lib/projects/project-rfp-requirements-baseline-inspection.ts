/**
 * RFP requirements-baseline inspection read model (Milestone 2).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts. The inspected payload shape is the
 * draft payload of src/lib/projects/project-rfp-requirements-baseline.ts,
 * imported type-only so this read module never pulls the draft-writing
 * service into its runtime graph.
 *
 * Read-only engineer inspection over the requirements_baseline artifact
 * versions the Milestone 2 draft service records: a Project-gated list of
 * lean artifact summaries plus a single-artifact sanitized baseline detail.
 * Both services load the Project by exact tenant/project id, return
 * not_found when it is missing and wrong_mode (with a lean no-tenantId
 * project summary) when it is not an rfp Project, and read artifacts only
 * after that gate passes. The list reads exactly the requirements_baseline
 * artifact type, tenant/project scoped, and keeps only rows of that type;
 * every entry carries identifiers, ISO dates, copied source-id arrays, and
 * an identifier/count payload summary read through an explicit field
 * whitelist - malformed payload fields degrade to safe fallbacks ("", 0,
 * []) and the list never throws for a malformed payload. The detail loads
 * the EXACT artifact version named by the caller and whitelist-copies the
 * approved baseline payload shape: marker, createdBy, createdAt, counts,
 * and requirements with locator-only evidence references (identifiers,
 * counts, positions - never raw evidence text, never table rows, never a
 * tenantId, never a storage path, never an arbitrary payload key, and
 * never an alias into the stored payload). This module reads only Project
 * and ProjectArtifact rows and writes nothing: no artifact versions, no
 * approvals, no evidence reads, no file or storage reads, no OCR, no AI,
 * no requirement interpretation or compliance classification, and no
 * SKU/catalog/pricing/configuration logic. Loaded rows are never mutated;
 * store failures bubble to the caller unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import type {
  RfpRequirementEvidenceReference,
  RfpRequirementTableEvidenceReference,
  RfpRequirementTextEvidenceReference,
  RfpRequirementsBaselinePayload,
} from "@/lib/projects/project-rfp-requirements-baseline";

/**
 * The payload discriminator every requirements_baseline draft payload
 * carries. Pinned locally against the canonical payload type so a drift in
 * the draft module fails typecheck here without a runtime value import.
 */
const RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND: RfpRequirementsBaselinePayload["payloadKind"] =
  "rfp_requirements_baseline";

/** The only artifact type / stage this inspection surface exposes. */
const REQUIREMENTS_BASELINE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "requirements_baseline";
const REQUIREMENTS_BASELINE_STAGE_ID: ProjectArtifact["stageId"] =
  "requirements_baseline_review";

/**
 * The two locator evidence kinds a stored evidence reference may carry,
 * pinned locally against the canonical reference types (type-only) so a
 * drift in the draft module fails typecheck here too.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND: RfpRequirementTextEvidenceReference["evidenceKind"] =
  "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND: RfpRequirementTableEvidenceReference["evidenceKind"] =
  "rfp_document_table";

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpRequirementsBaselineInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied arrays, no payload. */
export interface RfpRequirementsBaselineInspectionArtifactSummary {
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
 * whitelist only; malformed fields degrade to "" / 0 / []. Requirement ids
 * come from the stored requirements entries; a malformed entry degrades to
 * "". Requirement text never appears in a list summary.
 */
export interface RfpRequirementsBaselineInspectionPayloadSummary {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  requirementCount: number;
  evidenceCount: number;
  requirementIds: string[];
}

/** One list entry: the artifact summary plus its lean payload summary. */
export interface RfpRequirementsBaselineInspectionListItem
  extends RfpRequirementsBaselineInspectionArtifactSummary {
  payloadSummary: RfpRequirementsBaselineInspectionPayloadSummary;
}

/** Input for {@link loadRfpRequirementsBaselineList}. */
export interface LoadRfpRequirementsBaselineListInput {
  tenantId: string;
  projectId: string;
}

/** Discriminated result of {@link loadRfpRequirementsBaselineList}. */
export type LoadRfpRequirementsBaselineListResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpRequirementsBaselineInspectionProjectSummary;
    }
  | {
      status: "ok";
      project: RfpRequirementsBaselineInspectionProjectSummary;
      artifacts: RfpRequirementsBaselineInspectionListItem[];
      artifactCount: number;
    };

/**
 * One requirement copied from a stored baseline payload through the field
 * whitelist. category and priority are surfaced exactly as stored (plain
 * strings): inspection reports what is persisted and never re-classifies.
 * Malformed fields degrade to ""; title/notes are omitted when not strings.
 */
export interface RfpRequirementsBaselineInspectionRequirement {
  id: string;
  text: string;
  category: string;
  priority: string;
  title?: string;
  notes?: string;
  /** Locator metadata only: identifiers, counts, positions - no body. */
  evidenceReferences: RfpRequirementEvidenceReference[];
}

/** Sanitized whitelist copy of one stored requirements_baseline payload. */
export interface RfpRequirementsBaselineInspectionBaseline {
  payloadKind: RfpRequirementsBaselinePayload["payloadKind"];
  createdBy: string;
  createdAt: string;
  requirementCount: number;
  evidenceCount: number;
  requirements: RfpRequirementsBaselineInspectionRequirement[];
}

/** Input for {@link loadRfpRequirementsBaselineDetail}. */
export interface LoadRfpRequirementsBaselineDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

/** Discriminated result of {@link loadRfpRequirementsBaselineDetail}. */
export type LoadRfpRequirementsBaselineDetailResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpRequirementsBaselineInspectionProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_requirements_baseline";
      artifact: RfpRequirementsBaselineInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpRequirementsBaselineInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpRequirementsBaselineInspectionProjectSummary;
      artifact: RfpRequirementsBaselineInspectionArtifactSummary;
      baseline: RfpRequirementsBaselineInspectionBaseline;
    };

/** True for a plain object record; arrays and null are not records. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A payload value as a plain record; {} when it is anything else. */
function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

/** Read one string payload field; "" when missing or not a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Read one count payload field; 0 when missing or not a finite number. */
function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Read one optional numeric payload field; omitted when not finite. */
function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Read one optional string payload field; omitted when not a string. */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Lean wrong-mode/ok Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpRequirementsBaselineInspectionProjectSummary {
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
): RfpRequirementsBaselineInspectionArtifactSummary {
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

/** Requirement ids from stored requirements entries; malformed parts -> "". */
function toRequirementIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) =>
    isPlainRecord(entry) ? asString(entry.id) : ""
  );
}

/**
 * Identifier/count projection of one stored payload for the list. Reads the
 * whitelisted fields only - the marker, createdBy, createdAt, the two
 * counts, and the requirement ids - so arbitrary payload keys (a tenantId
 * or storage path smuggled into a malformed payload included) can never
 * surface, and never throws for a malformed payload.
 */
function toPayloadSummary(
  payload: unknown
): RfpRequirementsBaselineInspectionPayloadSummary {
  const record = toRecord(payload);
  return {
    payloadKind: asString(record.payloadKind),
    createdBy: asString(record.createdBy),
    createdAt: asString(record.createdAt),
    requirementCount: asCount(record.requirementCount),
    evidenceCount: asCount(record.evidenceCount),
    requirementIds: toRequirementIds(record.requirements),
  };
}

/** One list entry for a loaded requirements_baseline artifact version. */
function toListItem(
  artifact: ProjectArtifact
): RfpRequirementsBaselineInspectionListItem {
  return {
    ...toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(artifact.payload),
  };
}

/**
 * Build one fresh locator-only copy of a stored evidence reference through
 * the per-kind field whitelist: identifiers, counts, and positions only.
 * Malformed locator fields degrade to safe fallbacks ("" / 0 / omitted
 * optionals); a reference whose stored kind is not the table kind is
 * surfaced through the text-chunk locator shape with degraded counts. The
 * evidence text body and table rows are never read or copied.
 */
function toEvidenceReference(entry: unknown): RfpRequirementEvidenceReference {
  const record = toRecord(entry);
  const base = {
    evidenceId: asString(record.evidenceId),
    sourceFileId: asString(record.sourceFileId),
    inputPackageArtifactId: asString(record.inputPackageArtifactId),
  };
  if (record.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(record.pageNumber);
    const sheetName = asOptionalString(record.sheetName);
    return {
      ...base,
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      tableId: asString(record.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(record.rowCount),
      columnCount: asCount(record.columnCount),
    };
  }
  return {
    ...base,
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    chunkIndex: asCount(record.chunkIndex),
    chunkCount: asCount(record.chunkCount),
    charCount: asCount(record.charCount),
  };
}

/** Whitelist-copy stored references; a non-array degrades to []. */
function toEvidenceReferences(
  value: unknown
): RfpRequirementEvidenceReference[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toEvidenceReference(entry));
}

/**
 * Whitelist-copy one stored requirement entry: id, text, category,
 * priority, optional title/notes, and locator-only evidence references.
 * Arbitrary entry keys never surface; malformed fields degrade safely.
 */
function toRequirement(
  entry: unknown
): RfpRequirementsBaselineInspectionRequirement {
  const record = toRecord(entry);
  const title = asOptionalString(record.title);
  const notes = asOptionalString(record.notes);
  return {
    id: asString(record.id),
    text: asString(record.text),
    category: asString(record.category),
    priority: asString(record.priority),
    ...(title !== undefined ? { title } : {}),
    ...(notes !== undefined ? { notes } : {}),
    evidenceReferences: toEvidenceReferences(record.evidenceReferences),
  };
}

/**
 * List one rfp Project's requirements_baseline artifact versions as lean
 * serializable summaries. Validates a nonblank projectId before any store
 * call (deterministic programmer error), gates on project existence and rfp
 * mode, then reads exactly the requirements_baseline artifact type, tenant
 * and project scoped, keeping only rows of that type even if the store
 * returns more. Every entry carries identifiers, ISO dates, copied
 * source-id arrays, and the whitelisted payload summary; malformed payload
 * fields degrade to safe fallbacks and the list never throws for a
 * malformed payload. Summaries never include requirement text, evidence
 * references, raw evidence text, table rows, a tenantId, a storage path,
 * or any other payload key. Loaded rows are never mutated; store failures
 * bubble unhidden.
 */
export async function loadRfpRequirementsBaselineList(
  input: LoadRfpRequirementsBaselineListInput
): Promise<LoadRfpRequirementsBaselineListResult> {
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
    REQUIREMENTS_BASELINE_ARTIFACT_TYPE
  );
  const artifacts = rows
    .filter((row) => row.type === REQUIREMENTS_BASELINE_ARTIFACT_TYPE)
    .map((row) => toListItem(row));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
  };
}

/**
 * Load the EXACT requirements_baseline artifact version named by the caller
 * as a sanitized baseline detail. Validates nonblank projectId and
 * artifactId before any store call (deterministic programmer errors), gates
 * on project existence and rfp mode, then loads the artifact by exact
 * tenant/project/artifact id. A missing artifact reports
 * artifact_not_found; an artifact that is not requirements_baseline at
 * requirements_baseline_review reports artifact_not_requirements_baseline
 * with a lean payload-free summary; a payload whose marker is not the
 * requirements-baseline discriminator or whose requirements array is
 * malformed (not an array, or holding a non-object entry) reports
 * invalid_payload the same lean way. The ok result carries the project and
 * artifact summaries plus the whitelist copy of the approved baseline
 * payload shape - never raw evidence text, never table rows, never a
 * tenantId, never a storage path, never an arbitrary payload key, and
 * never an alias into the stored payload. Loaded rows are never mutated;
 * store failures bubble unhidden.
 */
export async function loadRfpRequirementsBaselineDetail(
  input: LoadRfpRequirementsBaselineDetailInput
): Promise<LoadRfpRequirementsBaselineDetailResult> {
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
    artifact.type !== REQUIREMENTS_BASELINE_ARTIFACT_TYPE ||
    artifact.stageId !== REQUIREMENTS_BASELINE_STAGE_ID
  ) {
    return {
      status: "artifact_not_requirements_baseline",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = toRecord(artifact.payload);
  const requirements = payload.requirements;
  if (
    payload.payloadKind !== RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND ||
    !Array.isArray(requirements) ||
    requirements.some((entry) => !isPlainRecord(entry))
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
    baseline: {
      payloadKind: RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND,
      createdBy: asString(payload.createdBy),
      createdAt: asString(payload.createdAt),
      requirementCount: asCount(payload.requirementCount),
      evidenceCount: asCount(payload.evidenceCount),
      requirements: requirements.map((entry) => toRequirement(entry)),
    },
  };
}
