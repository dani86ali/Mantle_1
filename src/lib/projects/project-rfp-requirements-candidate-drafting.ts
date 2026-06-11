/**
 * RFP requirement-candidate drafting contract (Milestone 2, provider-neutral).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Prepares persisted RFP extraction evidence for an INJECTED candidate-drafting
 * executor and validates whatever comes back into explicit candidate
 * requirements shaped exactly like the requirements_baseline draft service
 * input (src/lib/projects/project-rfp-requirements-baseline.ts, a type-only
 * import). This module is the neutral contract between persisted Project
 * evidence and a future drafting executor: it imports no AI, LLM, provider,
 * agent, coordinator, engine, adapter, parser, pricing, SKU, catalog,
 * configuration, or export module, performs no drafting itself, and persists
 * NOTHING - no artifact, approval, file, evidence row, or stage is created or
 * updated here. Returned candidates carry no runtime authority: a
 * requirements_baseline artifact must still be created by the existing
 * explicit-candidate draft service and human-approved separately before any
 * downstream stage may rely on it.
 *
 * Gates mirror the baseline draft service, tenant scoped on every store call:
 * the project must exist in rfp mode; every requested evidence id (trimmed,
 * deduplicated preserving first-seen order) must load; every loaded row must
 * be one of the two RFP extraction kinds (literals defined locally so the
 * extraction and persistence write modules stay out of this module graph);
 * every row must name, as a nonblank string content.inputPackageArtifactId,
 * an existing approved input_package artifact version at
 * intake_package_review. Each failing gate returns a lean diagnostic listing
 * every offender for that gate and never invokes the executor.
 *
 * The executor receives only whitelisted copies: a lean project summary
 * (never a tenantId), one entry per requested evidence row in requested order
 * carrying locator metadata plus the text body or a copied rows matrix (never
 * a storage path, never arbitrary content keys), the trimmed requestedBy, and
 * the unique source-file / package ids. An executor throw maps to
 * drafting_failed with a fixed error code; the thrown detail is never
 * exposed. Executor output is never trusted: it must be an object with a
 * nonempty candidates array; each candidate must be an object with nonblank
 * trimmed text citing at least one nonblank loaded evidence id (trimmed,
 * deduplicated preserving order; ids outside the loaded set are invalid);
 * category/priority, when present, must be one of the baseline literal sets
 * (no defaults are applied here - the baseline service owns them);
 * title/notes are copied only when nonblank strings after trim; every other
 * executor-supplied field (id, status, artifact, source, tenant, project,
 * createdBy, payload, pricing, SKU, configuration, export, ...) is dropped by
 * whitelist copy. The ok result is lean and serializable - sanitized
 * candidates plus identifier/count fields only, never a raw evidence body,
 * never table rows, never the executor's raw output. Inputs, loaded rows, and
 * artifacts are never mutated; returned arrays are fresh copies; unexpected
 * store failures bubble to the caller unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectEvidenceItemById } from "@/lib/db/project-evidence-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";
import type {
  RfpRequirementCategory,
  RfpRequirementPriority,
  RfpRequirementsBaselineArtifactSummary,
  RfpRequirementsBaselineCandidateInput,
  RfpRequirementsBaselineEvidenceSummary,
  RfpRequirementsBaselineProjectSummary,
} from "@/lib/projects/project-rfp-requirements-baseline";

/** The only artifact type / stage accepted as cited-evidence provenance. */
const INPUT_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] = "input_package";
const INPUT_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/**
 * The two persisted RFP extraction evidence kinds draftable here. Defined
 * locally on purpose (exactly like the baseline draft service): importing
 * them would pull the extraction/persistence write modules into this
 * contract's module graph.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/** Kind of one draftable evidence row. */
export type RfpCandidateDraftingEvidenceKind =
  | typeof RFP_TEXT_CHUNK_EVIDENCE_KIND
  | typeof RFP_TABLE_EVIDENCE_KIND;

/**
 * The baseline candidate literal sets, keyed records so the compiler forces
 * them to stay in lockstep with the type-only imported baseline types: a
 * literal added or removed there breaks this module until mirrored here. No
 * runtime baseline import is allowed, so the values are restated.
 */
const RFP_REQUIREMENT_CATEGORY_FLAGS: Record<RfpRequirementCategory, true> = {
  technical: true,
  commercial: true,
  compliance: true,
  delivery: true,
  security: true,
  support: true,
  legal: true,
  other: true,
};
const RFP_REQUIREMENT_PRIORITY_FLAGS: Record<RfpRequirementPriority, true> = {
  mandatory: true,
  preferred: true,
  optional: true,
  informational: true,
  unknown: true,
};

/** Lean serializable Project projection; tenantId is never surfaced. */
export type RfpCandidateDraftingProjectSummary =
  RfpRequirementsBaselineProjectSummary;

/** Lean gate-failure projection of one evidence row; never a content body. */
export type RfpCandidateDraftingEvidenceSummary =
  RfpRequirementsBaselineEvidenceSummary;

/** Serializable gate-failure artifact summary; never an artifact payload. */
export type RfpCandidateDraftingArtifactSummary =
  RfpRequirementsBaselineArtifactSummary;

/**
 * One sanitized candidate: exactly the explicit candidate input shape of the
 * baseline draft service, ready to hand to it after human review. Never
 * persisted by this module.
 */
export type RfpDraftedRequirementCandidate =
  RfpRequirementsBaselineCandidateInput;

/**
 * One whitelisted text-chunk entry handed to the executor: identifiers and
 * locator metadata plus the stored text body.
 */
export interface RfpCandidateDraftingTextEvidence {
  evidenceId: string;
  evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  /** Present only when stored as a string on the evidence content. */
  sourceFileName?: string;
  /** Present only when stored as a string on the evidence content. */
  sourceFileRole?: string;
  chunkIndex: number;
  chunkCount: number;
  charCount: number;
  text: string;
}

/**
 * One whitelisted table entry handed to the executor: identifiers and locator
 * metadata plus a copied rows matrix (never an alias of the stored rows).
 */
export interface RfpCandidateDraftingTableEvidence {
  evidenceId: string;
  evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  /** Present only when stored as a string on the evidence content. */
  sourceFileName?: string;
  /** Present only when stored as a string on the evidence content. */
  sourceFileRole?: string;
  tableId: string;
  pageNumber?: number;
  sheetName?: string;
  rowCount: number;
  columnCount: number;
  rows: string[][];
}

/** One evidence entry as handed to the executor; copies, never aliases. */
export type RfpCandidateDraftingEvidence =
  | RfpCandidateDraftingTextEvidence
  | RfpCandidateDraftingTableEvidence;

/** Everything the injected executor receives; no tenantId, no storage path. */
export interface RfpCandidateDraftingExecutorInput {
  project: RfpCandidateDraftingProjectSummary;
  /** One entry per requested evidence row, in requested (deduplicated) order. */
  evidence: RfpCandidateDraftingEvidence[];
  requestedBy: string;
  /** Unique cited source-file ids in first-seen evidence order. */
  sourceFileIds: string[];
  /** Unique approved input_package artifact ids in first-seen evidence order. */
  sourceArtifactIds: string[];
}

/**
 * The injected candidate-drafting dependency. This module never imports,
 * constructs, or names a real implementation; a future route wires one in.
 * Whatever it resolves with is validated and sanitized, never trusted.
 */
export type RfpCandidateDraftingExecutor = (
  input: RfpCandidateDraftingExecutorInput
) => Promise<unknown>;

/** Input for {@link draftRfpRequirementCandidatesFromEvidence}. */
export interface DraftRfpRequirementCandidatesFromEvidenceInput {
  tenantId: string;
  projectId: string;
  /** Persisted ProjectEvidenceItem ids to draft from; at least one nonblank. */
  evidenceIds: string[];
  requestedBy: string;
  executor: RfpCandidateDraftingExecutor;
}

/** Discriminated result of {@link draftRfpRequirementCandidatesFromEvidence}. */
export type DraftRfpRequirementCandidatesFromEvidenceResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpCandidateDraftingProjectSummary }
  | { status: "evidence_not_found"; missingEvidenceIds: string[] }
  | {
      status: "evidence_not_rfp_extraction";
      evidence: RfpCandidateDraftingEvidenceSummary[];
    }
  | {
      status: "evidence_missing_input_package";
      evidence: RfpCandidateDraftingEvidenceSummary[];
    }
  | { status: "input_package_artifact_not_found"; missingArtifactIds: string[] }
  | {
      status: "artifact_not_input_package";
      artifacts: RfpCandidateDraftingArtifactSummary[];
    }
  | {
      status: "input_package_not_approved";
      artifacts: RfpCandidateDraftingArtifactSummary[];
    }
  | { status: "drafting_failed"; error: "candidate_drafting_failed" }
  | { status: "invalid_candidate_output"; errors: string[] }
  | {
      status: "ok";
      project: RfpCandidateDraftingProjectSummary;
      candidates: RfpDraftedRequirementCandidate[];
      candidateCount: number;
      /** Count of unique loaded evidence rows handed to the executor. */
      evidenceCount: number;
      sourceFileIds: string[];
      sourceArtifactIds: string[];
    };

function isRfpRequirementCategory(
  value: string
): value is RfpRequirementCategory {
  return Object.prototype.hasOwnProperty.call(
    RFP_REQUIREMENT_CATEGORY_FLAGS,
    value
  );
}

function isRfpRequirementPriority(
  value: string
): value is RfpRequirementPriority {
  return Object.prototype.hasOwnProperty.call(
    RFP_REQUIREMENT_PRIORITY_FLAGS,
    value
  );
}

/** True for the only two evidence kinds this contract drafts from. */
function isRfpExtractionEvidenceKind(
  kind: string
): kind is RfpCandidateDraftingEvidenceKind {
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
 * Copy one stored rows matrix into fresh arrays; a non-array matrix or row
 * degrades to [] and a non-string cell degrades to "". Never an alias.
 */
function toRowsMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) =>
    Array.isArray(row) ? row.map((cell) => asString(cell)) : []
  );
}

/**
 * The nonblank string content.inputPackageArtifactId of one evidence row,
 * exactly as stored, or null when missing, blank, or not a string.
 */
function getInputPackageArtifactId(item: ProjectEvidenceItem): string | null {
  const value = item.content.inputPackageArtifactId;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Lean Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpCandidateDraftingProjectSummary {
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
): RfpCandidateDraftingEvidenceSummary {
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
): RfpCandidateDraftingArtifactSummary {
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
 * Build one fresh whitelisted executor entry for a loaded evidence row.
 * Copies identifiers, locator metadata, and the drafting body (text or a
 * copied rows matrix) through an explicit per-kind whitelist; malformed
 * fields degrade to safe fallbacks ("" / 0 / omitted optionals). A tenantId,
 * storage path, or any other content key is never copied. The kind recheck is
 * an internal invariant: the evidence gates have already guaranteed it.
 */
function toExecutorEvidence(
  item: ProjectEvidenceItem
): RfpCandidateDraftingEvidence {
  const kind = item.kind;
  if (!isRfpExtractionEvidenceKind(kind)) {
    throw new Error(`Evidence ${item.id} kind is not draftable: ${kind}.`);
  }
  const content = item.content;
  const sourceFileName = asOptionalString(content.sourceFileName);
  const sourceFileRole = asOptionalString(content.sourceFileRole);
  if (kind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(content.pageNumber);
    const sheetName = asOptionalString(content.sheetName);
    return {
      evidenceId: item.id,
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      sourceFileId: item.sourceFileId,
      inputPackageArtifactId: asString(content.inputPackageArtifactId),
      ...(sourceFileName !== undefined ? { sourceFileName } : {}),
      ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
      tableId: asString(content.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(content.rowCount),
      columnCount: asCount(content.columnCount),
      rows: toRowsMatrix(content.rows),
    };
  }
  return {
    evidenceId: item.id,
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    sourceFileId: item.sourceFileId,
    inputPackageArtifactId: asString(content.inputPackageArtifactId),
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
    chunkIndex: asCount(content.chunkIndex),
    chunkCount: asCount(content.chunkCount),
    charCount: asCount(content.charCount),
    text: asString(content.text),
  };
}

/** Outcome of one executor-output sanitization pass. */
interface SanitizedExecutorOutput {
  candidates: RfpDraftedRequirementCandidate[];
  errors: string[];
}

/**
 * Validate and sanitize untrusted executor output into baseline candidate
 * input shapes. Collects every violation (deterministic messages naming the
 * offending candidate index) instead of stopping at the first; when any error
 * exists the candidates list is returned empty. Only whitelisted fields
 * survive: trimmed text, trimmed evidence ids (deduplicated preserving
 * first-seen order, each one a loaded evidence id), category/priority only
 * when valid baseline literals (never defaulted here), and title/notes only
 * when nonblank strings after trim. Executor-supplied authority or content
 * fields (id, status, artifact, source, tenant, project, createdBy, payload,
 * pricing, SKU, configuration, export, ...) never survive the copy.
 */
function sanitizeExecutorOutput(
  rawOutput: unknown,
  loadedEvidenceIds: ReadonlySet<string>
): SanitizedExecutorOutput {
  if (
    rawOutput === null ||
    typeof rawOutput !== "object" ||
    Array.isArray(rawOutput)
  ) {
    return {
      candidates: [],
      errors: ["Executor output must be an object with a candidates array."],
    };
  }
  const rawCandidates = (rawOutput as Record<string, unknown>).candidates;
  if (!Array.isArray(rawCandidates)) {
    return {
      candidates: [],
      errors: ["Executor output must be an object with a candidates array."],
    };
  }
  if (rawCandidates.length === 0) {
    return {
      candidates: [],
      errors: ["Executor output must include at least one candidate."],
    };
  }

  const errors: string[] = [];
  const candidates: RfpDraftedRequirementCandidate[] = [];
  rawCandidates.forEach((rawCandidate, index) => {
    if (
      rawCandidate === null ||
      typeof rawCandidate !== "object" ||
      Array.isArray(rawCandidate)
    ) {
      errors.push(`candidates[${index}] must be an object.`);
      return;
    }
    const candidate = rawCandidate as Record<string, unknown>;
    const before = errors.length;

    const text =
      typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (text === "") {
      errors.push(`candidates[${index}].text is required.`);
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
      errors.push(
        `candidates[${index}] must cite at least one nonblank evidence ID.`
      );
    }
    for (const id of evidenceIds) {
      if (!loadedEvidenceIds.has(id)) {
        errors.push(`candidates[${index}] cites unknown evidence ID: ${id}.`);
      }
    }

    let category: RfpRequirementCategory | undefined;
    const rawCategory = candidate.category;
    if (rawCategory !== undefined) {
      if (
        typeof rawCategory === "string" &&
        isRfpRequirementCategory(rawCategory)
      ) {
        category = rawCategory;
      } else {
        errors.push(
          `candidates[${index}].category is invalid: ${String(rawCategory)}.`
        );
      }
    }
    let priority: RfpRequirementPriority | undefined;
    const rawPriority = candidate.priority;
    if (rawPriority !== undefined) {
      if (
        typeof rawPriority === "string" &&
        isRfpRequirementPriority(rawPriority)
      ) {
        priority = rawPriority;
      } else {
        errors.push(
          `candidates[${index}].priority is invalid: ${String(rawPriority)}.`
        );
      }
    }

    if (errors.length > before) return;

    const title =
      typeof candidate.title === "string" ? candidate.title.trim() : "";
    const notes =
      typeof candidate.notes === "string" ? candidate.notes.trim() : "";
    candidates.push({
      text,
      evidenceIds,
      ...(category !== undefined ? { category } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(title !== "" ? { title } : {}),
      ...(notes !== "" ? { notes } : {}),
    });
  });

  return errors.length > 0 ? { candidates: [], errors } : { candidates, errors };
}

/**
 * Load the requested persisted RFP extraction evidence, gate its approved
 * input-package provenance, hand whitelisted copies to the INJECTED executor,
 * and validate/sanitize what it returns into explicit candidate requirements
 * ready for the baseline draft service. Throws deterministic programmer
 * errors before any store call: nonblank projectId, nonblank requestedBy, at
 * least one nonblank evidence id (trimmed, deduplicated preserving first-seen
 * order), and a function executor. Gates in order, tenant scoped: project
 * exists, rfp mode, every evidence id loads, every row is an RFP extraction
 * kind, every row names its input package, every package artifact exists, is
 * type input_package at stage intake_package_review, and is approved - each
 * failing gate returns every offender for that gate as lean summaries and
 * never calls the executor. An executor throw returns drafting_failed with a
 * fixed error code (the thrown detail is never exposed); invalid executor
 * output returns invalid_candidate_output listing every violation. On success
 * the result is lean and serializable: sanitized candidates plus
 * identifier/count fields only. Persists nothing, mutates nothing; store
 * failures bubble unhidden.
 */
export async function draftRfpRequirementCandidatesFromEvidence(
  input: DraftRfpRequirementCandidatesFromEvidenceInput
): Promise<DraftRfpRequirementCandidatesFromEvidenceResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (
    typeof input.requestedBy !== "string" ||
    input.requestedBy.trim() === ""
  ) {
    throw new Error("requestedBy is required.");
  }
  const requestedBy = input.requestedBy.trim();

  const rawEvidenceIds = Array.isArray(input.evidenceIds)
    ? input.evidenceIds
    : [];
  const evidenceIds: string[] = [];
  const requestedIdSet = new Set<string>();
  for (const rawId of rawEvidenceIds) {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (id === "" || requestedIdSet.has(id)) continue;
    requestedIdSet.add(id);
    evidenceIds.push(id);
  }
  if (evidenceIds.length === 0) {
    throw new Error("At least one evidence ID is required.");
  }
  if (typeof input.executor !== "function") {
    throw new Error("executor is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const loadedEvidence: ProjectEvidenceItem[] = [];
  const missingEvidenceIds: string[] = [];
  for (const evidenceId of evidenceIds) {
    const item = await getProjectEvidenceItemById(
      tenantId,
      projectId,
      evidenceId
    );
    if (item === null) missingEvidenceIds.push(evidenceId);
    else loadedEvidence.push(item);
  }
  if (missingEvidenceIds.length > 0) {
    return { status: "evidence_not_found", missingEvidenceIds };
  }

  const wrongKind = loadedEvidence.filter(
    (item) => !isRfpExtractionEvidenceKind(item.kind)
  );
  if (wrongKind.length > 0) {
    return {
      status: "evidence_not_rfp_extraction",
      evidence: wrongKind.map(toEvidenceSummary),
    };
  }

  const missingPackageRef = loadedEvidence.filter(
    (item) => getInputPackageArtifactId(item) === null
  );
  if (missingPackageRef.length > 0) {
    return {
      status: "evidence_missing_input_package",
      evidence: missingPackageRef.map(toEvidenceSummary),
    };
  }

  // Unique provenance package ids in first-seen evidence order; each
  // referenced artifact version is loaded exactly once by exact id.
  const packageIds: string[] = [];
  const seenPackageIds = new Set<string>();
  for (const item of loadedEvidence) {
    const packageId = getInputPackageArtifactId(item);
    if (packageId === null || seenPackageIds.has(packageId)) continue;
    seenPackageIds.add(packageId);
    packageIds.push(packageId);
  }

  const loadedPackages: ProjectArtifact[] = [];
  const missingArtifactIds: string[] = [];
  for (const packageId of packageIds) {
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

  // Unique cited source files in first-seen evidence order.
  const sourceFileIds: string[] = [];
  const seenFileIds = new Set<string>();
  for (const item of loadedEvidence) {
    if (seenFileIds.has(item.sourceFileId)) continue;
    seenFileIds.add(item.sourceFileId);
    sourceFileIds.push(item.sourceFileId);
  }

  // The executor gets its own copies; mutating them never reaches the loaded
  // rows, this function's locals, or the returned result.
  let rawOutput: unknown;
  try {
    rawOutput = await input.executor({
      project: toProjectSummary(project),
      evidence: loadedEvidence.map(toExecutorEvidence),
      requestedBy,
      sourceFileIds: sourceFileIds.slice(),
      sourceArtifactIds: packageIds.slice(),
    });
  } catch {
    // The thrown detail (provider error, prompt, stack) is never surfaced.
    return { status: "drafting_failed", error: "candidate_drafting_failed" };
  }

  const sanitized = sanitizeExecutorOutput(rawOutput, requestedIdSet);
  if (sanitized.errors.length > 0) {
    return { status: "invalid_candidate_output", errors: sanitized.errors };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    candidates: sanitized.candidates,
    candidateCount: sanitized.candidates.length,
    evidenceCount: loadedEvidence.length,
    sourceFileIds: sourceFileIds.slice(),
    sourceArtifactIds: packageIds.slice(),
  };
}
