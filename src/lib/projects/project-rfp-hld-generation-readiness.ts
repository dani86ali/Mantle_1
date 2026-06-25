/**
 * Read-only RFP HLD generation-readiness gate (Stage 6F).
 *
 * Answers whether the latest approved `hld_design_model` is safe and current
 * enough for future HLD diagram/document generation stages to consume. This
 * service writes nothing, creates no artifacts, runs no AI, reads no raw files,
 * and generates no diagram, document, proposal, export, HTML, XML, or SVG.
 */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectArtifacts } from "@/lib/db/project-artifact-store";
import { validateRfpHldDesignModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import {
  getRfpHldDesignModelReadinessReport,
  validateRfpHldDesignModelSourceCompatibility,
} from "@/lib/projects/project-rfp-hld-design-model-readiness";
import {
  validateRfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewRecommendation,
} from "@/lib/projects/project-rfp-hld-design-model-review";
import {
  validateRfpHldSourceBundlePayload,
  type RfpHldSourceBundlePayload,
  type RfpHldSourceBundleAuthorityReference,
  type RfpHldSourceBundleConfigurationAuthority,
  type RfpHldSourceBundleDesignKnowledgePackReference,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

const HLD_STAGE: ProjectStageId = "hld_design_delta_review";
const MODEL_TYPE: ProjectArtifactType = "hld_design_model";
const SOURCE_BUNDLE_TYPE: ProjectArtifactType = "hld_source_bundle";
const REVIEW_TYPE: ProjectArtifactType = "hld_design_model_review";

const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

export type RfpHldGenerationReadinessStatus =
  | "ready"
  | "blocked"
  | "not_found"
  | "wrong_mode";

export type RfpHldGenerationReadinessBlockerCode =
  | "no_approved_hld_design_model"
  | "approved_model_wrong_stage"
  | "approved_model_payload_invalid"
  | "approved_model_source_not_single_bundle"
  | "source_bundle_missing"
  | "source_bundle_not_approved"
  | "source_bundle_payload_invalid"
  | "model_source_bundle_mismatch"
  | "model_source_compatibility_failed"
  | "source_bundle_not_current"
  | "source_bundle_upstream_not_current"
  | "matching_review_missing"
  | "matching_review_payload_invalid"
  | "matching_review_model_mismatch"
  | "matching_review_source_bundle_mismatch"
  | "matching_review_source_ids_mismatch"
  | "matching_review_blocking_findings";

export interface RfpHldGenerationReadinessBlocker {
  code: RfpHldGenerationReadinessBlockerCode;
  message: string;
  details?: string[];
}

export interface RfpHldGenerationReadinessWarning {
  code: string;
  message: string;
}

export interface RfpHldGenerationReadinessProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldGenerationReadinessArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldGenerationReadinessModelSummary
  extends RfpHldGenerationReadinessArtifactSummary {
  sourceHldSourceBundleArtifactId?: string;
  sourceBundleVersion?: number;
  coveredDomainCount: number;
  excludedDomainCount: number;
  designSectionCount: number;
  topologyNodeCount: number;
  topologyLinkCount: number;
  diagramIntentCount: number;
}

export interface RfpHldGenerationReadinessSourceBundleSummary
  extends RfpHldGenerationReadinessArtifactSummary {
  sourceArtifactCount: number;
  coveredDomainCount: number;
  excludedDomainCount: number;
  designKnowledgePackCount: number;
  assumptionCount: number;
  warningCount: number;
  blockerCount: number;
}

export interface RfpHldGenerationReadinessReviewFindingCounts {
  blocking: number;
  warning: number;
  suggestion: number;
}

export interface RfpHldGenerationReadinessReviewSummary
  extends RfpHldGenerationReadinessArtifactSummary {
  reviewedAt?: string;
  reviewerType?: string;
  sourceHldDesignModelArtifactId?: string;
  sourceHldSourceBundleArtifactId?: string;
  recommendation?: RfpHldDesignModelReviewRecommendation;
  findingCount: number;
  findingCounts: RfpHldGenerationReadinessReviewFindingCounts;
}

export interface RfpHldGenerationReadinessTechnicalAudit {
  approvedModelArtifactId?: string;
  sourceBundleArtifactId?: string;
  reviewArtifactId?: string;
  approvedModelSourceArtifactIds?: string[];
  sourceBundleSourceArtifactIds?: string[];
  reviewSourceArtifactIds?: string[];
}

export interface RfpHldGenerationReadinessReport {
  status: RfpHldGenerationReadinessStatus;
  ready: boolean;
  project?: RfpHldGenerationReadinessProjectSummary;
  approvedModel?: RfpHldGenerationReadinessModelSummary;
  sourceBundle?: RfpHldGenerationReadinessSourceBundleSummary;
  review?: RfpHldGenerationReadinessReviewSummary;
  blockers: RfpHldGenerationReadinessBlocker[];
  warnings: RfpHldGenerationReadinessWarning[];
  nextAction: string;
  technicalAudit?: RfpHldGenerationReadinessTechnicalAudit;
}

export interface GetRfpHldGenerationReadinessInput {
  projectId: string;
  artifacts: readonly ProjectArtifact[];
}

export interface LoadRfpHldGenerationReadinessInput {
  tenantId: string;
  projectId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sameOrderedIds(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toProjectSummary(project: Project): RfpHldGenerationReadinessProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldGenerationReadinessArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

function countTopology(payload: unknown, key: "nodes" | "links"): number {
  const root = isRecord(payload) ? payload : {};
  const topology = isRecord(root.topology) ? root.topology : {};
  return asArray(topology[key]).length;
}

function toModelSummary(
  artifact: ProjectArtifact
): RfpHldGenerationReadinessModelSummary {
  const payload = isRecord(artifact.payload) ? artifact.payload : {};
  return {
    ...toArtifactSummary(artifact),
    ...(asString(payload.sourceHldSourceBundleArtifactId) !== undefined
      ? { sourceHldSourceBundleArtifactId: asString(payload.sourceHldSourceBundleArtifactId) }
      : {}),
    ...(asNumber(payload.sourceBundleVersion) !== undefined
      ? { sourceBundleVersion: asNumber(payload.sourceBundleVersion) }
      : {}),
    coveredDomainCount: asArray(payload.coveredDomains).length,
    excludedDomainCount: asArray(payload.excludedDomains).length,
    designSectionCount: asArray(payload.designSections).length,
    topologyNodeCount: countTopology(payload, "nodes"),
    topologyLinkCount: countTopology(payload, "links"),
    diagramIntentCount: asArray(payload.diagramIntents).length,
  };
}

function toSourceBundleSummary(
  artifact: ProjectArtifact
): RfpHldGenerationReadinessSourceBundleSummary {
  const payload = isRecord(artifact.payload) ? artifact.payload : {};
  return {
    ...toArtifactSummary(artifact),
    sourceArtifactCount: asArray(payload.sourceArtifactIds).length,
    coveredDomainCount: asArray(payload.coveredDomains).length,
    excludedDomainCount: asArray(payload.excludedDomains).length,
    designKnowledgePackCount: asArray(payload.designKnowledgePackRefs).length,
    assumptionCount: asArray(payload.assumptions).length,
    warningCount: asArray(payload.warnings).length,
    blockerCount: asArray(payload.blockers).length,
  };
}

function countReviewFindings(payload: unknown): RfpHldGenerationReadinessReviewFindingCounts {
  const counts: RfpHldGenerationReadinessReviewFindingCounts = {
    blocking: 0,
    warning: 0,
    suggestion: 0,
  };
  if (!isRecord(payload) || !Array.isArray(payload.findings)) return counts;
  for (const finding of payload.findings) {
    if (!isRecord(finding)) continue;
    if (finding.severity === "blocking") counts.blocking += 1;
    else if (finding.severity === "warning") counts.warning += 1;
    else if (finding.severity === "suggestion") counts.suggestion += 1;
  }
  return counts;
}

function toReviewSummary(
  artifact: ProjectArtifact
): RfpHldGenerationReadinessReviewSummary {
  const payload = isRecord(artifact.payload) ? artifact.payload : {};
  const counts = countReviewFindings(payload);
  return {
    ...toArtifactSummary(artifact),
    ...(asString(payload.reviewedAt) !== undefined ? { reviewedAt: asString(payload.reviewedAt) } : {}),
    ...(isRecord(payload.reviewer) && asString(payload.reviewer.type) !== undefined
      ? { reviewerType: asString(payload.reviewer.type) }
      : {}),
    ...(asString(payload.sourceHldDesignModelArtifactId) !== undefined
      ? { sourceHldDesignModelArtifactId: asString(payload.sourceHldDesignModelArtifactId) }
      : {}),
    ...(asString(payload.sourceHldSourceBundleArtifactId) !== undefined
      ? { sourceHldSourceBundleArtifactId: asString(payload.sourceHldSourceBundleArtifactId) }
      : {}),
    ...(payload.recommendation === "proceed_to_engineer_review" ||
    payload.recommendation === "rebuild_recommended" ||
    payload.recommendation === "reject_required"
      ? { recommendation: payload.recommendation }
      : {}),
    findingCount: counts.blocking + counts.warning + counts.suggestion,
    findingCounts: counts,
  };
}

function addBlocker(
  blockers: RfpHldGenerationReadinessBlocker[],
  code: RfpHldGenerationReadinessBlockerCode,
  message: string,
  details?: string[]
): void {
  blockers.push({ code, message, ...(details !== undefined && details.length > 0 ? { details } : {}) });
}

function latestByType(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  type: ProjectArtifactType
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.projectId !== projectId || artifact.type !== type) continue;
    if (latest === undefined || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

function latestApprovedByType(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  type: ProjectArtifactType
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.projectId !== projectId || artifact.type !== type) continue;
    if (artifact.status !== "approved") continue;
    if (latest === undefined || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

function findArtifact(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  artifactId: string | undefined
): ProjectArtifact | undefined {
  if (artifactId === undefined) return undefined;
  return artifacts.find((artifact) => artifact.projectId === projectId && artifact.id === artifactId);
}

function hasExpectedTypeStageStatus(
  artifact: ProjectArtifact | undefined,
  ref: Pick<RfpHldSourceBundleAuthorityReference, "artifactType" | "stageId" | "version"> | RfpHldSourceBundleConfigurationAuthority | RfpHldSourceBundleDesignKnowledgePackReference
): boolean {
  return (
    artifact !== undefined &&
    artifact.type === ref.artifactType &&
    artifact.stageId === ref.stageId &&
    artifact.status === "approved" &&
    artifact.version === ref.version
  );
}

function newestForAuthority(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  ref: Pick<RfpHldSourceBundleAuthorityReference, "artifactType" | "stageId">
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (
      artifact.projectId !== projectId ||
      artifact.type !== ref.artifactType ||
      artifact.stageId !== ref.stageId
    ) {
      continue;
    }
    if (latest === undefined || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

function newestKnowledgePackForDomain(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  domain: string
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (
      artifact.projectId !== projectId ||
      artifact.type !== "design_knowledge_pack" ||
      artifact.stageId !== HLD_STAGE ||
      artifact.payload.domain !== domain
    ) {
      continue;
    }
    if (latest === undefined || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

function evaluateSourceBundleUpstreamCurrency(input: {
  projectId: string;
  artifacts: readonly ProjectArtifact[];
  sourceBundle: ProjectArtifact;
  payload: RfpHldSourceBundlePayload;
}): string[] {
  const { projectId, artifacts, sourceBundle, payload } = input;
  const staleMessages: string[] = [];

  if (!sameOrderedIds(sourceBundle.sourceArtifactIds, payload.sourceArtifactIds)) {
    staleMessages.push("The source bundle artifact source ids no longer match its payload source ids.");
  }

  const authorityRefs: Array<
    [string, RfpHldSourceBundleAuthorityReference | RfpHldSourceBundleConfigurationAuthority]
  > = [
    ["evidence package", payload.authorities.evidencePackage],
    ["requirements baseline", payload.authorities.requirementsBaseline],
    ["compliance matrix", payload.authorities.complianceMatrix],
    ["configuration authority", payload.authorities.configurationAuthority],
    ["HLD intake", payload.authorities.hldIntake],
    ["HLD readiness snapshot", payload.authorities.hldReadinessSnapshot],
  ];

  for (const [label, ref] of authorityRefs) {
    const artifact = findArtifact(artifacts, projectId, ref.artifactId);
    if (!hasExpectedTypeStageStatus(artifact, ref)) {
      staleMessages.push(`The source bundle ${label} reference is missing, not approved, or version-mismatched.`);
      continue;
    }
    const latest = newestForAuthority(artifacts, projectId, ref);
    if (latest === undefined || latest.id !== ref.artifactId || latest.status !== "approved") {
      staleMessages.push(`The source bundle ${label} reference is no longer the current approved version.`);
    }
  }

  for (const ref of payload.designKnowledgePackRefs) {
    const artifact = findArtifact(artifacts, projectId, ref.artifactId);
    if (!hasExpectedTypeStageStatus(artifact, ref) || artifact?.payload.domain !== ref.domain) {
      staleMessages.push(`The ${ref.domain} design knowledge pack reference is missing, not approved, or version-mismatched.`);
      continue;
    }
    const latest = newestKnowledgePackForDomain(artifacts, projectId, ref.domain);
    if (latest === undefined || latest.id !== ref.artifactId || latest.status !== "approved") {
      staleMessages.push(`The ${ref.domain} design knowledge pack reference is no longer current.`);
    }
  }

  return staleMessages;
}

function latestReviewCandidate(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  modelId: string
): ProjectArtifact | undefined {
  return artifacts
    .filter(
      (artifact) =>
        artifact.projectId === projectId &&
        artifact.type === REVIEW_TYPE &&
        artifact.stageId === HLD_STAGE &&
        ACTIVE_REVIEW_STATUSES.has(artifact.status) &&
        artifact.sourceArtifactIds.length > 0 &&
        artifact.sourceArtifactIds[0] === modelId
    )
    .sort((a, b) => b.version - a.version || b.createdAt.getTime() - a.createdAt.getTime())[0];
}

function nextActionFor(blockers: readonly RfpHldGenerationReadinessBlocker[]): string {
  if (blockers.length === 0) return "Approved HLD design model is ready for future HLD generation.";
  const codes = new Set(blockers.map((b) => b.code));
  if (codes.has("no_approved_hld_design_model")) {
    return "Approve a current HLD design model after deterministic review.";
  }
  if (codes.has("approved_model_wrong_stage")) {
    return "Reapprove the HLD design model on the hld_design_delta_review stage before future HLD generation.";
  }
  if (
    codes.has("source_bundle_missing") ||
    codes.has("source_bundle_not_approved") ||
    codes.has("source_bundle_not_current") ||
    codes.has("source_bundle_upstream_not_current") ||
    codes.has("source_bundle_payload_invalid")
  ) {
    return "Approve a current HLD source bundle, then redraft and reapprove the HLD design model.";
  }
  if (
    codes.has("matching_review_missing") ||
    codes.has("matching_review_payload_invalid") ||
    codes.has("matching_review_model_mismatch") ||
    codes.has("matching_review_source_bundle_mismatch") ||
    codes.has("matching_review_source_ids_mismatch")
  ) {
    return "Run a fresh deterministic HLD design-model review for the approved model.";
  }
  if (codes.has("matching_review_blocking_findings")) {
    return "Resolve blocking advisory review findings before future HLD generation.";
  }
  return "Redraft or reapprove a current valid HLD design model before future HLD generation.";
}

export function getRfpHldGenerationReadiness(
  input: GetRfpHldGenerationReadinessInput
): RfpHldGenerationReadinessReport {
  const { projectId, artifacts } = input;
  const blockers: RfpHldGenerationReadinessBlocker[] = [];
  const warnings: RfpHldGenerationReadinessWarning[] = [];

  const approvedModel = latestApprovedByType(artifacts, projectId, MODEL_TYPE);
  if (approvedModel === undefined) {
    addBlocker(
      blockers,
      "no_approved_hld_design_model",
      "No approved HLD design model is available for downstream HLD generation."
    );
    return {
      status: "blocked",
      ready: false,
      blockers,
      warnings,
      nextAction: nextActionFor(blockers),
    };
  }

  if (approvedModel.stageId !== HLD_STAGE) {
    addBlocker(
      blockers,
      "approved_model_wrong_stage",
      `The latest approved HLD design model is on stage '${approvedModel.stageId}' but must be on '${HLD_STAGE}' before HLD generation.`
    );
    return {
      status: "blocked",
      ready: false,
      approvedModel: toModelSummary(approvedModel),
      blockers,
      warnings,
      nextAction: nextActionFor(blockers),
      technicalAudit: { approvedModelArtifactId: approvedModel.id },
    };
  }

  const modelSummary = toModelSummary(approvedModel);
  const modelValidation = validateRfpHldDesignModelPayload(approvedModel.payload);
  const modelPayload = isRecord(approvedModel.payload) ? approvedModel.payload : {};
  if (!modelValidation.valid) {
    addBlocker(
      blockers,
      "approved_model_payload_invalid",
      "The approved HLD design model payload is invalid.",
      modelValidation.errors
    );
  }

  const modelSourceBundleId = approvedModel.sourceArtifactIds.length === 1
    ? approvedModel.sourceArtifactIds[0]
    : undefined;
  if (modelSourceBundleId === undefined) {
    addBlocker(
      blockers,
      "approved_model_source_not_single_bundle",
      "The approved HLD design model must reference exactly one HLD source bundle."
    );
  }

  const sourceBundle = findArtifact(artifacts, projectId, modelSourceBundleId);
  let sourceBundleSummary: RfpHldGenerationReadinessSourceBundleSummary | undefined;
  let sourceBundlePayloadValid = false;
  let sourceBundlePayload: RfpHldSourceBundlePayload | undefined;

  if (sourceBundle === undefined || sourceBundle.type !== SOURCE_BUNDLE_TYPE || sourceBundle.stageId !== HLD_STAGE) {
    addBlocker(
      blockers,
      "source_bundle_missing",
      "The approved HLD design model source bundle cannot be resolved."
    );
  } else {
    sourceBundleSummary = toSourceBundleSummary(sourceBundle);
    if (sourceBundle.status !== "approved") {
      addBlocker(
        blockers,
        "source_bundle_not_approved",
        "The HLD source bundle referenced by the approved model is not approved."
      );
    }

    const bundleValidation = validateRfpHldSourceBundlePayload(sourceBundle.payload);
    sourceBundlePayloadValid = bundleValidation.valid;
    if (!bundleValidation.valid) {
      addBlocker(
        blockers,
        "source_bundle_payload_invalid",
        "The HLD source bundle payload referenced by the approved model is invalid.",
        bundleValidation.errors
      );
    } else {
      sourceBundlePayload = sourceBundle.payload as unknown as RfpHldSourceBundlePayload;
    }
  }

  const payloadBundleId = asString(modelPayload.sourceHldSourceBundleArtifactId);
  if (
    modelSourceBundleId !== undefined &&
    payloadBundleId !== undefined &&
    payloadBundleId !== modelSourceBundleId
  ) {
    addBlocker(
      blockers,
      "model_source_bundle_mismatch",
      "The approved HLD design model payload points to a different source bundle than the artifact row."
    );
  }

  if (sourceBundle !== undefined) {
    const compatibility = validateRfpHldDesignModelSourceCompatibility({
      payload: approvedModel.payload,
      sourceBundleArtifact: sourceBundle,
    });
    if (!compatibility.valid) {
      addBlocker(
        blockers,
        "model_source_compatibility_failed",
        "The approved HLD design model no longer matches its approved source bundle.",
        compatibility.errors
      );
    }
  }

  const modelReadiness = getRfpHldDesignModelReadinessReport({ projectId, artifacts });
  if (
    modelReadiness.status !== "ready" ||
    modelReadiness.sourceBundle === undefined ||
    modelReadiness.sourceBundle.artifactId !== modelSourceBundleId
  ) {
    addBlocker(
      blockers,
      "source_bundle_not_current",
      modelReadiness.status === "ready" && modelReadiness.sourceBundle !== undefined
        ? "A newer approved HLD source bundle exists; the approved model must be redrafted from the current source bundle."
        : "The latest HLD source bundle is not approved and current.",
      modelReadiness.messages
    );
  }

  if (sourceBundle !== undefined && sourceBundlePayloadValid && sourceBundlePayload !== undefined) {
    const staleMessages = evaluateSourceBundleUpstreamCurrency({
      projectId,
      artifacts,
      sourceBundle,
      payload: sourceBundlePayload,
    });
    if (staleMessages.length > 0) {
      addBlocker(
        blockers,
        "source_bundle_upstream_not_current",
        "The approved HLD source bundle no longer reflects the current approved upstream authorities.",
        staleMessages
      );
    }
  }

  const review = latestReviewCandidate(artifacts, projectId, approvedModel.id);
  let reviewSummary: RfpHldGenerationReadinessReviewSummary | undefined;
  if (review === undefined) {
    addBlocker(
      blockers,
      "matching_review_missing",
      "No current deterministic advisory review exists for the approved HLD design model."
    );
  } else {
    reviewSummary = toReviewSummary(review);
    const reviewValidation = validateRfpHldDesignModelReviewPayload(review.payload);
    if (!reviewValidation.valid) {
      addBlocker(
        blockers,
        "matching_review_payload_invalid",
        "The latest HLD design-model review payload is invalid.",
        reviewValidation.errors
      );
    } else {
      const payload = review.payload as unknown as RfpHldDesignModelReviewPayload;
      if (payload.sourceHldDesignModelArtifactId !== approvedModel.id) {
        addBlocker(
          blockers,
          "matching_review_model_mismatch",
          "The latest HLD design-model review does not point to the approved model."
        );
      }
      if (sourceBundle !== undefined && payload.sourceHldSourceBundleArtifactId !== sourceBundle.id) {
        addBlocker(
          blockers,
          "matching_review_source_bundle_mismatch",
          "The latest HLD design-model review does not point to the current source bundle."
        );
      }
      const expectedReviewSourceIds = sourceBundle !== undefined
        ? [approvedModel.id, sourceBundle.id]
        : [approvedModel.id];
      if (
        !sameOrderedIds(review.sourceArtifactIds, expectedReviewSourceIds) ||
        !sameOrderedIds(payload.sourceArtifactIds, expectedReviewSourceIds)
      ) {
        addBlocker(
          blockers,
          "matching_review_source_ids_mismatch",
          "The latest HLD design-model review source ids do not exactly match the approved model and source bundle."
        );
      }

      const counts = countReviewFindings(payload);
      if (counts.blocking > 0) {
        addBlocker(
          blockers,
          "matching_review_blocking_findings",
          "The latest HLD design-model review has blocking findings that prevent downstream HLD generation."
        );
      }
    }
  }

  const ready = blockers.length === 0;
  return {
    status: ready ? "ready" : "blocked",
    ready,
    approvedModel: modelSummary,
    ...(sourceBundleSummary !== undefined ? { sourceBundle: sourceBundleSummary } : {}),
    ...(reviewSummary !== undefined ? { review: reviewSummary } : {}),
    blockers,
    warnings,
    nextAction: nextActionFor(blockers),
    technicalAudit: {
      approvedModelArtifactId: approvedModel.id,
      ...(sourceBundle !== undefined ? { sourceBundleArtifactId: sourceBundle.id } : {}),
      ...(review !== undefined ? { reviewArtifactId: review.id } : {}),
      approvedModelSourceArtifactIds: approvedModel.sourceArtifactIds.slice(),
      ...(sourceBundle !== undefined ? { sourceBundleSourceArtifactIds: sourceBundle.sourceArtifactIds.slice() } : {}),
      ...(review !== undefined ? { reviewSourceArtifactIds: review.sourceArtifactIds.slice() } : {}),
    },
  };
}

export async function loadRfpHldGenerationReadiness(
  input: LoadRfpHldGenerationReadinessInput
): Promise<RfpHldGenerationReadinessReport> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const project = await getProjectById(input.tenantId, input.projectId);
  if (project === null) {
    return {
      status: "not_found",
      ready: false,
      blockers: [
        {
          code: "no_approved_hld_design_model",
          message: "Project not found.",
        },
      ],
      warnings: [],
      nextAction: "Open an existing RFP project before checking HLD generation readiness.",
    };
  }

  if (project.mode !== "rfp") {
    return {
      status: "wrong_mode",
      ready: false,
      project: toProjectSummary(project),
      blockers: [
        {
          code: "no_approved_hld_design_model",
          message: "HLD generation readiness is available only for RFP projects.",
        },
      ],
      warnings: [],
      nextAction: "Open an RFP project before checking HLD generation readiness.",
    };
  }

  const artifacts = await listProjectArtifacts(input.tenantId, input.projectId);
  const report = getRfpHldGenerationReadiness({ projectId: input.projectId, artifacts });
  return { ...report, project: toProjectSummary(project) };
}
