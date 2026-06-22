/**
 * RFP requirements-baseline draft service (Milestone 2).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Creates ONE reviewable requirements_baseline artifact version from
 * already-drafted candidate requirements, each citing persisted RFP
 * extraction evidence rows by id. This service drafts nothing itself: no AI
 * or model call, no requirement interpretation or compliance
 * classification, no OCR, no file or storage reads, no pricing, and no
 * SKU, catalog, or configuration logic - it validates explicit candidate
 * input against persisted Project state and records a review draft. Every
 * cited evidence row must be a tenant/project-scoped row of one of the two
 * RFP extraction kinds (the kind literals are defined locally so this
 * service never pulls the extraction or persistence write modules into its
 * module graph), and its content must name, as a nonblank string
 * inputPackageArtifactId, the approved input_package artifact version
 * (type input_package at stage intake_package_review, status approved) it
 * was extracted from. A missing row, an unrelated kind, a missing package
 * reference, a dangling package id, a non-input_package artifact, or a
 * non-approved package each aborts with a lean diagnostic result listing
 * every offender for that gate - and creates nothing. On success exactly
 * one requirements_baseline version is created at stage
 * requirements_baseline_review with status needs_review; its payload
 * carries deterministic in-order requirement ids (RFP-REQ-001, ...) and
 * per-requirement evidence references holding locator metadata only -
 * never raw evidence text, never table rows, never a tenantId, never a
 * storage path. Candidate text/title/notes/evidence ids and createdBy are
 * trimmed; per-candidate evidence ids are deduplicated preserving order.
 * Returned summaries are lean and serializable (ISO dates, copied arrays,
 * identifiers and counts). Inputs, loaded rows, and artifacts are never
 * mutated; unexpected store failures bubble to the caller unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectEvidenceItemById } from "@/lib/db/project-evidence-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";

/** Payload discriminator stamped on every requirements_baseline draft payload. */
export const RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND =
  "rfp_requirements_baseline";

/** The artifact type / stage this service creates. */
const REQUIREMENTS_BASELINE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "requirements_baseline";
const REQUIREMENTS_BASELINE_STAGE_ID: ProjectArtifact["stageId"] =
  "requirements_baseline_review";

/** The only artifact type / stage accepted as cited-evidence provenance. */
const INPUT_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] = "input_package";
const INPUT_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/**
 * The two persisted RFP extraction evidence kinds a requirement may cite.
 * Defined locally on purpose: importing them would pull the
 * extraction/persistence write modules into this create service.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/** Kind of one citable evidence row. */
export type RfpBaselineEvidenceKind =
  | typeof RFP_TEXT_CHUNK_EVIDENCE_KIND
  | typeof RFP_TABLE_EVIDENCE_KIND;

/**
 * Reviewable requirement classification. The first eight literals are the
 * original baseline set (candidates default to "other"); the rest are the
 * Stage 5 RFP obligation categories. This array is the single source of truth -
 * every compiler-locked category flag record mirrors exactly this set.
 */
export const RFP_REQUIREMENT_CATEGORIES = [
  "technical",
  "commercial",
  "compliance",
  "delivery",
  "security",
  "support",
  "legal",
  "other",
  "boq_product",
  "installation_configuration_testing",
  "documentation",
  "training_totk",
  "schedule_duration",
  "warranty_support",
  "permits_site_access_safety",
  "legal_regulatory_local_content",
  "insurance",
  "commercial_contractual",
  "vendor_qualification_submittals",
  "security_cybersecurity",
] as const;
export type RfpRequirementCategory =
  (typeof RFP_REQUIREMENT_CATEGORIES)[number];

/** Reviewable requirement priority; candidates default to "unknown". */
export const RFP_REQUIREMENT_PRIORITIES = [
  "mandatory",
  "preferred",
  "optional",
  "informational",
  "unknown",
] as const;
export type RfpRequirementPriority =
  (typeof RFP_REQUIREMENT_PRIORITIES)[number];

/** One already-drafted candidate requirement; every field is explicit input. */
export interface RfpRequirementsBaselineCandidateInput {
  text: string;
  category?: RfpRequirementCategory;
  priority?: RfpRequirementPriority;
  /** Persisted ProjectEvidenceItem ids this requirement cites; at least one. */
  evidenceIds: string[];
  title?: string;
  notes?: string;
}

/** Input for {@link createRfpRequirementsBaselineDraft}. */
export interface CreateRfpRequirementsBaselineDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  candidates: RfpRequirementsBaselineCandidateInput[];
}

/** Identifier fields every evidence reference carries. */
interface RfpRequirementEvidenceReferenceBase {
  evidenceId: string;
  sourceFileId: string;
  inputPackageArtifactId: string;
}

/** Locator-only reference to one cited text-chunk row; never the text body. */
export interface RfpRequirementTextEvidenceReference
  extends RfpRequirementEvidenceReferenceBase {
  evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
  chunkIndex: number;
  chunkCount: number;
  charCount: number;
}

/** Locator-only reference to one cited table row; never the rows matrix. */
export interface RfpRequirementTableEvidenceReference
  extends RfpRequirementEvidenceReferenceBase {
  evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
  tableId: string;
  pageNumber?: number;
  sheetName?: string;
  rowCount: number;
  columnCount: number;
}

/** Locator metadata only: identifiers, counts, positions - no content body. */
export type RfpRequirementEvidenceReference =
  | RfpRequirementTextEvidenceReference
  | RfpRequirementTableEvidenceReference;

/** One reviewable requirement as stored in the draft payload. */
export interface RfpRequirementsBaselineRequirement {
  /** Deterministic in-order id: RFP-REQ-001, RFP-REQ-002, ... */
  id: string;
  text: string;
  category: RfpRequirementCategory;
  priority: RfpRequirementPriority;
  /** Present only when the trimmed candidate title is nonblank. */
  title?: string;
  /** Present only when the trimmed candidate notes are nonblank. */
  notes?: string;
  /** One reference per cited evidence row, in candidate citation order. */
  evidenceReferences: RfpRequirementEvidenceReference[];
}

/** The requirements_baseline draft artifact payload. */
export type RfpRequirementsBaselinePayload = {
  payloadKind: typeof RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND;
  createdBy: string;
  /** ISO creation timestamp. */
  createdAt: string;
  requirementCount: number;
  /** Count of UNIQUE evidence rows cited across all requirements. */
  evidenceCount: number;
  requirements: RfpRequirementsBaselineRequirement[];
};

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpRequirementsBaselineProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Lean gate-failure projection of one evidence row; never a content body. */
export interface RfpRequirementsBaselineEvidenceSummary {
  id: string;
  projectId: string;
  sourceFileId: string;
  kind: string;
  extractedAt: string;
  retainUntil: string;
}

/** Serializable artifact summary: ISO dates, copied arrays, no payload. */
export interface RfpRequirementsBaselineArtifactSummary {
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

/** Identifier/count projection of the created payload; requirement ids only. */
export interface RfpRequirementsBaselinePayloadSummary {
  payloadKind: typeof RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  requirementCount: number;
  evidenceCount: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  requirementIds: string[];
}

/** Discriminated result of {@link createRfpRequirementsBaselineDraft}. */
export type CreateRfpRequirementsBaselineDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpRequirementsBaselineProjectSummary }
  | { status: "evidence_not_found"; missingEvidenceIds: string[] }
  | {
      status: "evidence_not_rfp_extraction";
      evidence: RfpRequirementsBaselineEvidenceSummary[];
    }
  | {
      status: "evidence_missing_input_package";
      evidence: RfpRequirementsBaselineEvidenceSummary[];
    }
  | { status: "input_package_artifact_not_found"; missingArtifactIds: string[] }
  | {
      status: "artifact_not_input_package";
      artifacts: RfpRequirementsBaselineArtifactSummary[];
    }
  | {
      status: "input_package_not_approved";
      artifacts: RfpRequirementsBaselineArtifactSummary[];
    }
  | {
      status: "ok";
      artifact: RfpRequirementsBaselineArtifactSummary;
      payloadSummary: RfpRequirementsBaselinePayloadSummary;
    };

/** One candidate after trim/default/dedupe normalization; input untouched. */
interface NormalizedCandidate {
  text: string;
  category: RfpRequirementCategory;
  priority: RfpRequirementPriority;
  evidenceIds: string[];
  title?: string;
  notes?: string;
}

function isRfpRequirementCategory(
  value: string
): value is RfpRequirementCategory {
  return (RFP_REQUIREMENT_CATEGORIES as readonly string[]).includes(value);
}

function isRfpRequirementPriority(
  value: string
): value is RfpRequirementPriority {
  return (RFP_REQUIREMENT_PRIORITIES as readonly string[]).includes(value);
}

/** True for the only two evidence kinds a requirement may cite. */
function isRfpBaselineEvidenceKind(
  kind: string
): kind is RfpBaselineEvidenceKind {
  return (
    kind === RFP_TEXT_CHUNK_EVIDENCE_KIND || kind === RFP_TABLE_EVIDENCE_KIND
  );
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

/**
 * The nonblank string content.inputPackageArtifactId of one evidence row,
 * exactly as stored, or null when the field is missing, blank, or not a
 * string.
 */
function getInputPackageArtifactId(item: ProjectEvidenceItem): string | null {
  const value = item.content.inputPackageArtifactId;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Validate and normalize every candidate before ANY store call: trims text,
 * title, notes, and evidence ids; applies the category/priority defaults;
 * drops blank evidence-id entries and deduplicates the rest preserving
 * first-seen order. Throws a deterministic validation error naming the
 * offending candidate index. The caller's candidate objects are never
 * mutated.
 */
function normalizeCandidates(
  candidates: readonly RfpRequirementsBaselineCandidateInput[]
): NormalizedCandidate[] {
  if (candidates.length === 0) {
    throw new Error("At least one candidate requirement is required.");
  }
  return candidates.map((candidate, index) => {
    const text =
      typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (text === "") {
      throw new Error(`candidates[${index}].text is required.`);
    }

    const category = candidate.category ?? "other";
    if (!isRfpRequirementCategory(category)) {
      throw new Error(
        `candidates[${index}].category is invalid: ${String(category)}.`
      );
    }
    const priority = candidate.priority ?? "unknown";
    if (!isRfpRequirementPriority(priority)) {
      throw new Error(
        `candidates[${index}].priority is invalid: ${String(priority)}.`
      );
    }

    const rawEvidenceIds = Array.isArray(candidate.evidenceIds)
      ? candidate.evidenceIds
      : [];
    const evidenceIds: string[] = [];
    const seen = new Set<string>();
    for (const rawId of rawEvidenceIds) {
      const id = typeof rawId === "string" ? rawId.trim() : "";
      if (id === "" || seen.has(id)) continue;
      seen.add(id);
      evidenceIds.push(id);
    }
    if (evidenceIds.length === 0) {
      throw new Error(
        `candidates[${index}] must cite at least one nonblank evidence ID.`
      );
    }

    const title =
      typeof candidate.title === "string" ? candidate.title.trim() : "";
    const notes =
      typeof candidate.notes === "string" ? candidate.notes.trim() : "";
    return {
      text,
      category,
      priority,
      evidenceIds,
      ...(title !== "" ? { title } : {}),
      ...(notes !== "" ? { notes } : {}),
    };
  });
}

/** Lean wrong-mode Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpRequirementsBaselineProjectSummary {
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

/** Lean gate-failure projection of one evidence row; never its content. */
function toEvidenceSummary(
  item: ProjectEvidenceItem
): RfpRequirementsBaselineEvidenceSummary {
  return {
    id: item.id,
    projectId: item.projectId,
    sourceFileId: item.sourceFileId,
    kind: item.kind,
    extractedAt: item.extractedAt.toISOString(),
    retainUntil: item.retainUntil.toISOString(),
  };
}

/** Project one loaded artifact to a serializable summary; arrays copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpRequirementsBaselineArtifactSummary {
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

/** Deterministic in-order requirement id: RFP-REQ-001, RFP-REQ-002, ... */
function toRequirementId(index: number): string {
  return `RFP-REQ-${String(index + 1).padStart(3, "0")}`;
}

/**
 * Build one fresh locator-only reference to a cited evidence row. Copies
 * identifier and count fields through an explicit per-kind whitelist;
 * malformed locator fields degrade to safe fallbacks ("" / 0 / omitted
 * optionals). The content text body and table rows are never copied. The
 * kind recheck is an internal invariant: the evidence gates have already
 * guaranteed it.
 */
function toEvidenceReference(
  item: ProjectEvidenceItem
): RfpRequirementEvidenceReference {
  const kind = item.kind;
  if (!isRfpBaselineEvidenceKind(kind)) {
    throw new Error(`Evidence ${item.id} kind is not citable: ${kind}.`);
  }
  const content = item.content;
  const inputPackageArtifactId = asString(content.inputPackageArtifactId);
  if (kind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(content.pageNumber);
    const sheetName = asOptionalString(content.sheetName);
    return {
      evidenceId: item.id,
      sourceFileId: item.sourceFileId,
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      inputPackageArtifactId,
      tableId: asString(content.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(content.rowCount),
      columnCount: asCount(content.columnCount),
    };
  }
  return {
    evidenceId: item.id,
    sourceFileId: item.sourceFileId,
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    inputPackageArtifactId,
    chunkIndex: asCount(content.chunkIndex),
    chunkCount: asCount(content.chunkCount),
    charCount: asCount(content.charCount),
  };
}

/** Map lookup that cannot miss once the evidence gates have passed. */
function citedItem(
  evidenceById: ReadonlyMap<string, ProjectEvidenceItem>,
  evidenceId: string
): ProjectEvidenceItem {
  const item = evidenceById.get(evidenceId);
  if (item === undefined) {
    throw new Error(`Cited evidence ${evidenceId} was not loaded.`);
  }
  return item;
}

/**
 * Create ONE reviewable requirements_baseline draft artifact version from
 * explicit candidate requirements. Validates and normalizes every candidate
 * before any store call (deterministic programmer errors): nonblank
 * createdBy, at least one candidate, nonblank trimmed text, at least one
 * nonblank trimmed evidence id (deduplicated preserving order), and valid
 * category/priority when provided. Gates in order, tenant scoped on every
 * store call: project existence, rfp mode, every unique cited evidence id
 * exists, every cited row is one of the two RFP extraction kinds, every
 * cited row names a nonblank string content.inputPackageArtifactId, every
 * referenced package artifact exists, is type input_package at stage
 * intake_package_review, and is approved. Each failing gate returns every
 * offender for that gate as lean summaries and creates no artifact. On
 * success exactly one needs_review requirements_baseline version is created
 * at requirements_baseline_review whose sourceFileIds/sourceArtifactIds are
 * the unique cited source files / approved package ids in first-seen
 * citation order, and whose payload carries the marker, trimmed createdBy,
 * ISO createdAt, counts, and the requirements with deterministic ids and
 * locator-only evidence references. Nothing is mutated; store failures
 * bubble.
 */
export async function createRfpRequirementsBaselineDraft(
  input: CreateRfpRequirementsBaselineDraftInput
): Promise<CreateRfpRequirementsBaselineDraftResult> {
  if (!input.createdBy || input.createdBy.trim() === "") {
    throw new Error("createdBy is required.");
  }
  const createdBy = input.createdBy.trim();
  const normalized = normalizeCandidates(
    Array.isArray(input.candidates) ? input.candidates : []
  );

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  // Unique cited evidence ids in first-seen citation order (candidate order,
  // then per-candidate citation order); each id is loaded exactly once.
  const uniqueEvidenceIds: string[] = [];
  const seenEvidenceIds = new Set<string>();
  for (const candidate of normalized) {
    for (const evidenceId of candidate.evidenceIds) {
      if (seenEvidenceIds.has(evidenceId)) continue;
      seenEvidenceIds.add(evidenceId);
      uniqueEvidenceIds.push(evidenceId);
    }
  }

  const evidenceById = new Map<string, ProjectEvidenceItem>();
  const citedEvidence: ProjectEvidenceItem[] = [];
  const missingEvidenceIds: string[] = [];
  for (const evidenceId of uniqueEvidenceIds) {
    const item = await getProjectEvidenceItemById(
      tenantId,
      projectId,
      evidenceId
    );
    if (item === null) {
      missingEvidenceIds.push(evidenceId);
      continue;
    }
    evidenceById.set(evidenceId, item);
    citedEvidence.push(item);
  }
  if (missingEvidenceIds.length > 0) {
    return { status: "evidence_not_found", missingEvidenceIds };
  }

  const wrongKind = citedEvidence.filter(
    (item) => !isRfpBaselineEvidenceKind(item.kind)
  );
  if (wrongKind.length > 0) {
    return {
      status: "evidence_not_rfp_extraction",
      evidence: wrongKind.map(toEvidenceSummary),
    };
  }

  const missingPackageRef = citedEvidence.filter(
    (item) => getInputPackageArtifactId(item) === null
  );
  if (missingPackageRef.length > 0) {
    return {
      status: "evidence_missing_input_package",
      evidence: missingPackageRef.map(toEvidenceSummary),
    };
  }

  // Unique provenance package ids in first-seen cited-evidence order; each
  // referenced artifact version is loaded exactly once by exact id.
  const uniquePackageIds: string[] = [];
  const seenPackageIds = new Set<string>();
  for (const item of citedEvidence) {
    const packageId = getInputPackageArtifactId(item);
    if (packageId === null || seenPackageIds.has(packageId)) continue;
    seenPackageIds.add(packageId);
    uniquePackageIds.push(packageId);
  }

  const loadedPackages: ProjectArtifact[] = [];
  const missingArtifactIds: string[] = [];
  for (const packageId of uniquePackageIds) {
    const artifact = await getProjectArtifactById(
      tenantId,
      projectId,
      packageId
    );
    if (artifact === null) missingArtifactIds.push(packageId);
    else loadedPackages.push(artifact);
  }
  if (missingArtifactIds.length > 0) {
    return { status: "input_package_artifact_not_found", missingArtifactIds };
  }

  const notInputPackage = loadedPackages.filter(
    (artifact) =>
      artifact.type !== INPUT_PACKAGE_ARTIFACT_TYPE ||
      artifact.stageId !== INPUT_PACKAGE_STAGE_ID
  );
  if (notInputPackage.length > 0) {
    return {
      status: "artifact_not_input_package",
      artifacts: notInputPackage.map(toArtifactSummary),
    };
  }

  const notApproved = loadedPackages.filter(
    (artifact) => artifact.status !== "approved"
  );
  if (notApproved.length > 0) {
    return {
      status: "input_package_not_approved",
      artifacts: notApproved.map(toArtifactSummary),
    };
  }

  // Unique cited source files in first-seen citation order.
  const sourceFileIds: string[] = [];
  const seenFileIds = new Set<string>();
  for (const item of citedEvidence) {
    if (seenFileIds.has(item.sourceFileId)) continue;
    seenFileIds.add(item.sourceFileId);
    sourceFileIds.push(item.sourceFileId);
  }

  const requirements: RfpRequirementsBaselineRequirement[] = normalized.map(
    (candidate, index) => ({
      id: toRequirementId(index),
      text: candidate.text,
      category: candidate.category,
      priority: candidate.priority,
      ...(candidate.title !== undefined ? { title: candidate.title } : {}),
      ...(candidate.notes !== undefined ? { notes: candidate.notes } : {}),
      evidenceReferences: candidate.evidenceIds.map((evidenceId) =>
        toEvidenceReference(citedItem(evidenceById, evidenceId))
      ),
    })
  );

  const createdAt = new Date().toISOString();
  const payload: RfpRequirementsBaselinePayload = {
    payloadKind: RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND,
    createdBy,
    createdAt,
    requirementCount: requirements.length,
    evidenceCount: citedEvidence.length,
    requirements,
  };

  const stored = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: REQUIREMENTS_BASELINE_STAGE_ID,
    type: REQUIREMENTS_BASELINE_ARTIFACT_TYPE,
    status: "needs_review",
    payload,
    sourceFileIds: sourceFileIds.slice(),
    sourceArtifactIds: uniquePackageIds.slice(),
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(stored),
    payloadSummary: {
      payloadKind: RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND,
      createdBy,
      createdAt,
      requirementCount: requirements.length,
      evidenceCount: citedEvidence.length,
      sourceFileIds: sourceFileIds.slice(),
      sourceArtifactIds: uniquePackageIds.slice(),
      requirementIds: requirements.map((requirement) => requirement.id),
    },
  };
}
