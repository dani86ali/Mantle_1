/**
 * RFP final evidence-package approval service (Stage 1A).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Records one approve/reject decision against the EXACT evidence_package
 * artifact version named by the caller (section 16) - the gate that turns
 * a reviewable evidence package into the human-approved final RFP
 * evidence authority for downstream requirements generation.
 * extraction_delta artifacts stay candidate/review metadata only: this
 * service never applies, edits, or reinterprets a delta proposal, never
 * generates or edits evidence, never creates an artifact version, and
 * never reads file contents, storage paths, or persisted evidence rows.
 * It loads the Project and the exact artifact, then gates on rfp mode,
 * the evidence_package type within the intake_package_review stage, and
 * reviewability via the pure approval helper. A rejection may then
 * persist immediately - an engineer can reject a malformed reviewable
 * package without this service proving its payload valid. An approval
 * must first prove the payload and provenance: a valid
 * rfp_evidence_package payload whose identifier arrays mirror the
 * artifact row, whose evidence entries are well-formed RFP extraction
 * copies consistent with the package, and whose stored counts match the
 * actual entries; every source artifact loaded tenant/project scoped,
 * the payload input package id resolving to an APPROVED input_package at
 * intake_package_review and every other source resolving to an
 * extraction_delta at intake_package_review (no pricing, SKU,
 * configuration, BoQ, requirements, compliance, HLD, proposal, export,
 * or other artifact type is evidence-package provenance); and every
 * extraction_delta source carrying a valid rfp_extraction_delta
 * candidate list with no candidate still pending_review. Accepted,
 * rejected, and waived candidates are resolved review metadata; unknown
 * review statuses make the delta payload invalid, and a candidate's
 * proposal is never applied or re-read here. A package
 * whose only source is its approved input package is valid:
 * deterministic-only and "no delta candidates found" packages need no
 * extraction_delta source. After the gates pass it persists exactly one
 * approval via createProjectApproval (its only mutation; it never
 * creates a new artifact version). The payload discriminator, candidate
 * status, and evidence kind literals are restated locally on purpose so
 * neither the evidence-package draft service nor the extraction-delta
 * services enter this module's graph. Approval is per exact artifact id
 * only: never by type, latest version, stage, or a user-supplied
 * version. Results are lean and serializable (ISO dates, copied arrays,
 * identifiers, versions, and counts) - never a full payload, an evidence
 * body, a candidate body, a proposed evidence value, or a tenantId.
 * Inputs and loaded rows are never mutated; unexpected store failures
 * bubble unhidden, and only a null createProjectApproval result maps to
 * approval_failed.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

/** The only artifact type this RFP review path may approve or reject. */
const EVIDENCE_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "evidence_package";
/** The shared intake stage of the package and both accepted source types. */
const INTAKE_PACKAGE_REVIEW_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";
/** The only type the payload input package source id may resolve to. */
const INPUT_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] = "input_package";
/** The only type any other source artifact id may resolve to. */
const EXTRACTION_DELTA_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "extraction_delta";

/**
 * Payload discriminators, evidence kinds, and the blocking candidate
 * review status, restated locally on purpose: importing them would pull
 * the evidence-package draft or extraction-delta service modules into
 * this approval service's graph.
 */
const RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND = "rfp_evidence_package";
const RFP_EXTRACTION_DELTA_PAYLOAD_KIND = "rfp_extraction_delta";
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";
/** The only candidate review status that blocks evidence-package approval. */
const PENDING_REVIEW_CANDIDATE_STATUS = "pending_review";
/** The only decided statuses that satisfy the delta resolution gate. */
const RESOLVED_CANDIDATE_STATUSES = ["accepted", "rejected", "waived"] as const;

/** Input for {@link reviewRfpEvidencePackageArtifact}. */
export interface ReviewRfpEvidencePackageArtifactInput {
  tenantId: string;
  projectId: string;
  /** The exact artifact version under review; identity is this id only. */
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  /** Defaults to now downstream (via the materializer) when omitted. */
  decidedAt?: Date;
  note?: string;
}

/** Lean serializable project projection returned on wrong_mode; no tenantId. */
export interface RfpEvidencePackageReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpEvidencePackageReviewArtifactSummary {
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

/** Locator of one extraction_delta source version; never a candidate body. */
export interface RfpEvidencePackageDeltaSourceRef {
  sourceArtifactId: string;
  sourceArtifactVersion: number;
}

/** The still-pending candidate ids of one extraction_delta source version. */
export interface RfpEvidencePackagePendingDeltaSource {
  sourceArtifactId: string;
  sourceArtifactVersion: number;
  /** Ids only - candidate bodies and proposals are never returned. */
  pendingCandidateIds: string[];
}

/** Lean identifier/count projection of the approved package payload. */
export interface RfpEvidencePackageApprovalPayloadSummary {
  payloadKind: typeof RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND;
  inputPackageArtifactId: string;
  evidenceCount: number;
  textChunkCount: number;
  tableEvidenceCount: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  /** The extraction_delta source ids; empty for deterministic-only packages. */
  extractionDeltaSourceArtifactIds: string[];
}

/** Discriminated result of {@link reviewRfpEvidencePackageArtifact}. */
export type ReviewRfpEvidencePackageArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpEvidencePackageReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_evidence_package";
      artifact: RfpEvidencePackageReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpEvidencePackageReviewArtifactSummary;
    }
  | {
      status: "invalid_evidence_package_payload";
      artifact: RfpEvidencePackageReviewArtifactSummary;
    }
  | { status: "source_artifact_not_found"; missingSourceArtifactIds: string[] }
  | {
      status: "source_artifact_invalid";
      artifacts: RfpEvidencePackageReviewArtifactSummary[];
    }
  | {
      status: "extraction_delta_payload_invalid";
      sources: RfpEvidencePackageDeltaSourceRef[];
    }
  | {
      status: "extraction_delta_candidates_pending";
      sources: RfpEvidencePackagePendingDeltaSource[];
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      /** Pre-approval summary of the exact reviewed artifact version. */
      artifact: RfpEvidencePackageReviewArtifactSummary;
      /** Present only for approved decisions (the validated lean summary). */
      payloadSummary?: RfpEvidencePackageApprovalPayloadSummary;
    };

/** Identifier/count fields proven valid for one approvable package payload. */
interface ParsedEvidencePackagePayload {
  inputPackageArtifactId: string;
  evidenceCount: number;
  textChunkCount: number;
  tableEvidenceCount: number;
  /** Fresh copies - never aliases of the loaded payload arrays. */
  sourceFileIds: string[];
  sourceArtifactIds: string[];
}

/** The id/status pair of one extraction_delta candidate; never the body. */
interface ExtractionDeltaCandidateStatus {
  id: string;
  reviewStatus: string;
}

/** True for a plain non-array object value. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True for a nonblank string value. */
function isNonblankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** True only for the closed extraction-delta candidate review vocabulary. */
function isExtractionDeltaReviewStatus(value: string): boolean {
  return (
    value === PENDING_REVIEW_CANDIDATE_STATUS ||
    RESOLVED_CANDIDATE_STATUSES.includes(
      value as (typeof RESOLVED_CANDIDATE_STATUSES)[number]
    )
  );
}

/** Fresh string array copy of one payload value; null unless all strings. */
function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const copied: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    copied.push(entry);
  }
  return copied;
}

/** True when both arrays hold exactly the same strings in the same order. */
function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** Lean wrong-mode Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpEvidencePackageReviewProjectSummary {
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

/** Project the loaded artifact to a serializable summary; arrays are copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpEvidencePackageReviewArtifactSummary {
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
 * Prove one loaded evidence_package payload approvable, or null when it
 * is not: a plain object stamped rfp_evidence_package, a nonblank
 * inputPackageArtifactId, a nonempty string sourceFileIds array and a
 * string sourceArtifactIds array that each exactly equal the artifact
 * row's arrays, sourceArtifactIds including the input package id, a
 * nonempty evidence array whose every entry is a plain object of one of
 * the two RFP extraction kinds with a nonblank evidenceId, a nonblank
 * sourceFileId inside the payload sourceFileIds, and the payload's
 * inputPackageArtifactId, every sourceFileId covered by at least one
 * evidence entry, and stored evidenceCount / textChunkCount /
 * tableEvidenceCount strictly equal to the actual entry/kind counts.
 * Returns identifier and count fields only - never evidence bodies; the
 * returned arrays are fresh copies, never aliases of the loaded payload.
 */
function parseEvidencePackagePayload(
  artifact: ProjectArtifact
): ParsedEvidencePackagePayload | null {
  const payload: unknown = artifact.payload;
  if (!isPlainObject(payload)) return null;
  if (payload.payloadKind !== RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND) return null;
  const inputPackageArtifactId = payload.inputPackageArtifactId;
  if (!isNonblankString(inputPackageArtifactId)) return null;
  const sourceFileIds = toStringArray(payload.sourceFileIds);
  if (sourceFileIds === null || sourceFileIds.length === 0) return null;
  const sourceArtifactIds = toStringArray(payload.sourceArtifactIds);
  if (sourceArtifactIds === null) return null;
  if (!sameStringArray(artifact.sourceFileIds, sourceFileIds)) return null;
  if (!sameStringArray(artifact.sourceArtifactIds, sourceArtifactIds)) {
    return null;
  }
  if (!sourceArtifactIds.includes(inputPackageArtifactId)) return null;
  const evidence = payload.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) return null;
  const payloadFileIds = new Set<string>();
  for (const fileId of sourceFileIds) payloadFileIds.add(fileId);
  const coveredFileIds = new Set<string>();
  let textChunkCount = 0;
  let tableEvidenceCount = 0;
  for (const entry of evidence) {
    if (!isPlainObject(entry)) return null;
    if (entry.evidenceKind === RFP_TEXT_CHUNK_EVIDENCE_KIND) {
      textChunkCount += 1;
    } else if (entry.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
      tableEvidenceCount += 1;
    } else {
      return null;
    }
    if (!isNonblankString(entry.evidenceId)) return null;
    const entrySourceFileId = entry.sourceFileId;
    if (
      !isNonblankString(entrySourceFileId) ||
      !payloadFileIds.has(entrySourceFileId)
    ) {
      return null;
    }
    coveredFileIds.add(entrySourceFileId);
    if (entry.inputPackageArtifactId !== inputPackageArtifactId) return null;
  }
  for (const fileId of sourceFileIds) {
    if (!coveredFileIds.has(fileId)) return null;
  }
  // Strict equality also rejects non-numeric stored counts (e.g. "3").
  if (payload.evidenceCount !== evidence.length) return null;
  if (payload.textChunkCount !== textChunkCount) return null;
  if (payload.tableEvidenceCount !== tableEvidenceCount) return null;
  return {
    inputPackageArtifactId,
    evidenceCount: evidence.length,
    textChunkCount,
    tableEvidenceCount,
    sourceFileIds,
    sourceArtifactIds,
  };
}

/**
 * Read the candidate id/reviewStatus pairs of one extraction_delta
 * source payload, or null when it is not a valid rfp_extraction_delta
 * payload: a plain object stamped rfp_extraction_delta whose candidates
 * array holds plain objects each carrying a nonblank id and a nonblank
 * reviewStatus from the closed extraction-delta review vocabulary.
 * Candidate bodies, proposals, and references are never read or returned
 * - only the status resolution gate needs these pairs.
 */
function parseExtractionDeltaCandidates(
  payload: unknown
): ExtractionDeltaCandidateStatus[] | null {
  if (!isPlainObject(payload)) return null;
  if (payload.payloadKind !== RFP_EXTRACTION_DELTA_PAYLOAD_KIND) return null;
  if (!Array.isArray(payload.candidates)) return null;
  const candidates: ExtractionDeltaCandidateStatus[] = [];
  for (const candidate of payload.candidates) {
    if (!isPlainObject(candidate)) return null;
    const id = candidate.id;
    if (!isNonblankString(id)) return null;
    const reviewStatus = candidate.reviewStatus;
    if (!isNonblankString(reviewStatus)) return null;
    if (!isExtractionDeltaReviewStatus(reviewStatus)) return null;
    candidates.push({ id, reviewStatus });
  }
  return candidates;
}

/**
 * Review (approve/reject) one EXACT evidence_package artifact version,
 * tenant scoped on every store call. Validates nonblank projectId, then
 * artifactId, then an exactly approved/rejected decision, then nonblank
 * decidedBy before any store call. Gates in order: project existence,
 * rfp mode, exact artifact existence, evidence_package type within the
 * intake_package_review stage, reviewable status. A rejected decision
 * then persists without payload or source-delta validation - rejecting
 * a reviewable package never requires proving its payload valid. An
 * approved decision must first pass the payload gate
 * (invalid_evidence_package_payload), load every unique source artifact
 * id from the artifact row (source_artifact_not_found listing only the
 * missing ids), prove the payload input package id resolves to an
 * approved input_package and every other source to an extraction_delta,
 * both at intake_package_review (source_artifact_invalid), and prove
 * every extraction_delta source payload valid
 * (extraction_delta_payload_invalid, id/version locators only) with no
 * candidate still pending_review (extraction_delta_candidates_pending,
 * id/version and pending candidate ids only). It then persists exactly
 * one approval via createProjectApproval (the only mutation) and
 * returns the approval, the post-decision artifact/stage statuses, the
 * pre-approval artifact summary, and - for approved decisions - the
 * lean validated payload/source summary. Unexpected errors bubble; only
 * a null createProjectApproval maps to approval_failed.
 */
export async function reviewRfpEvidencePackageArtifact(
  input: ReviewRfpEvidencePackageArtifactInput
): Promise<ReviewRfpEvidencePackageArtifactResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (typeof input.artifactId !== "string" || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }
  if (input.decision !== "approved" && input.decision !== "rejected") {
    throw new Error(`decision must be "approved" or "rejected".`);
  }
  if (typeof input.decidedBy !== "string" || input.decidedBy.trim() === "") {
    throw new Error("decidedBy is required.");
  }

  const { tenantId, projectId, artifactId, decision, decidedBy } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== EVIDENCE_PACKAGE_ARTIFACT_TYPE ||
    artifact.stageId !== INTAKE_PACKAGE_REVIEW_STAGE_ID
  ) {
    return {
      status: "artifact_not_evidence_package",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

  // Approval-only gates: a rejection may reject the reviewable package
  // without proving the payload valid; becoming evidence authority may not.
  let payloadSummary: RfpEvidencePackageApprovalPayloadSummary | undefined;
  if (decision === "approved") {
    const parsed = parseEvidencePackagePayload(artifact);
    if (parsed === null) {
      return {
        status: "invalid_evidence_package_payload",
        artifact: toArtifactSummary(artifact),
      };
    }

    // Load every unique source artifact id once, in artifact-row order,
    // collecting every missing id before failing.
    const uniqueSourceArtifactIds: string[] = [];
    const seenSourceArtifactIds = new Set<string>();
    for (const sourceArtifactId of artifact.sourceArtifactIds) {
      if (seenSourceArtifactIds.has(sourceArtifactId)) continue;
      seenSourceArtifactIds.add(sourceArtifactId);
      uniqueSourceArtifactIds.push(sourceArtifactId);
    }
    const loadedSources: ProjectArtifact[] = [];
    const missingSourceArtifactIds: string[] = [];
    for (const sourceArtifactId of uniqueSourceArtifactIds) {
      const sourceArtifact = await getProjectArtifactById(
        tenantId,
        projectId,
        sourceArtifactId
      );
      if (sourceArtifact === null) {
        missingSourceArtifactIds.push(sourceArtifactId);
        continue;
      }
      loadedSources.push(sourceArtifact);
    }
    if (missingSourceArtifactIds.length > 0) {
      return { status: "source_artifact_not_found", missingSourceArtifactIds };
    }

    // Provenance gate: the payload input package id must be an APPROVED
    // input_package and every other source an extraction_delta, both at
    // intake_package_review. No other artifact type is provenance.
    const invalidSourceArtifacts: ProjectArtifact[] = [];
    const extractionDeltaSources: ProjectArtifact[] = [];
    for (const sourceArtifact of loadedSources) {
      if (sourceArtifact.id === parsed.inputPackageArtifactId) {
        if (
          sourceArtifact.type !== INPUT_PACKAGE_ARTIFACT_TYPE ||
          sourceArtifact.stageId !== INTAKE_PACKAGE_REVIEW_STAGE_ID ||
          sourceArtifact.status !== "approved"
        ) {
          invalidSourceArtifacts.push(sourceArtifact);
        }
        continue;
      }
      if (
        sourceArtifact.type !== EXTRACTION_DELTA_ARTIFACT_TYPE ||
        sourceArtifact.stageId !== INTAKE_PACKAGE_REVIEW_STAGE_ID
      ) {
        invalidSourceArtifacts.push(sourceArtifact);
        continue;
      }
      extractionDeltaSources.push(sourceArtifact);
    }
    if (invalidSourceArtifacts.length > 0) {
      return {
        status: "source_artifact_invalid",
        artifacts: invalidSourceArtifacts.map(toArtifactSummary),
      };
    }

    // Delta resolution gate: every delta source payload must be valid,
    // and no candidate may still be pending_review. Accepted, rejected,
    // and waived candidates are resolved review metadata - nothing here
    // applies or reinterprets their proposals.
    const invalidDeltaSources: RfpEvidencePackageDeltaSourceRef[] = [];
    const pendingDeltaSources: RfpEvidencePackagePendingDeltaSource[] = [];
    for (const deltaArtifact of extractionDeltaSources) {
      const candidates = parseExtractionDeltaCandidates(deltaArtifact.payload);
      if (candidates === null) {
        invalidDeltaSources.push({
          sourceArtifactId: deltaArtifact.id,
          sourceArtifactVersion: deltaArtifact.version,
        });
        continue;
      }
      const pendingCandidateIds: string[] = [];
      for (const candidate of candidates) {
        if (candidate.reviewStatus !== PENDING_REVIEW_CANDIDATE_STATUS) {
          continue;
        }
        pendingCandidateIds.push(candidate.id);
      }
      if (pendingCandidateIds.length > 0) {
        pendingDeltaSources.push({
          sourceArtifactId: deltaArtifact.id,
          sourceArtifactVersion: deltaArtifact.version,
          pendingCandidateIds,
        });
      }
    }
    if (invalidDeltaSources.length > 0) {
      return {
        status: "extraction_delta_payload_invalid",
        sources: invalidDeltaSources,
      };
    }
    if (pendingDeltaSources.length > 0) {
      return {
        status: "extraction_delta_candidates_pending",
        sources: pendingDeltaSources,
      };
    }

    payloadSummary = {
      payloadKind: RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND,
      inputPackageArtifactId: parsed.inputPackageArtifactId,
      evidenceCount: parsed.evidenceCount,
      textChunkCount: parsed.textChunkCount,
      tableEvidenceCount: parsed.tableEvidenceCount,
      sourceFileIds: parsed.sourceFileIds,
      sourceArtifactIds: parsed.sourceArtifactIds,
      extractionDeltaSourceArtifactIds: extractionDeltaSources.map(
        (deltaArtifact) => deltaArtifact.id
      ),
    };
  }

  // Captured before the approval transitions statuses: the returned
  // artifact reflects the exact version as loaded for review.
  const artifactSummary = toArtifactSummary(artifact);

  const created = await createProjectApproval({
    tenantId,
    projectId,
    artifactId: artifact.id,
    decision,
    decidedBy,
    ...(input.decidedAt !== undefined ? { decidedAt: input.decidedAt } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  });
  if (created === null) return { status: "approval_failed" };

  return {
    status: "ok",
    approval: created.approval,
    artifactStatus: created.artifactStatus,
    stageStatus: created.stageStatus,
    artifact: artifactSummary,
    ...(payloadSummary !== undefined ? { payloadSummary } : {}),
  };
}
