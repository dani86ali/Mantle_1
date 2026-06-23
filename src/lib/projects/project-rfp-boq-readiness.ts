/**
 * Pure, read-only RFP BoQ lane readiness helper.
 * Source of truth: MVP_CANONICAL_PROJECT_STATE.md (sections 5, 7, 11, 12).
 *
 * Answers, for an RFP project: "which uploaded files are BoQ files, and where
 * does this RFP package sit in the existing Quick BoM artifact chain?" It
 * NEVER creates, approves, prices, exports, parses files, inspects storage,
 * runs normalization, resolves SKUs, expands configuration, or calls AI - it
 * only inspects ProjectFile roles and delegates artifact-chain readiness to the
 * pure Quick BoM readiness helper.
 *
 * BoQ files are ProjectFile rows with fileRole === "boq". Role/filename
 * validation already belongs to project-rfp-upload; this helper trusts the
 * role and never opens storagePath. Multiple BoQ files are reported as-is; no
 * single file is silently auto-selected.
 *
 * NO runtime imports beyond canonical project types and the pure Quick BoM
 * readiness helper - so it cannot reach a DB, filesystem, parser, artifact
 * service, pricing, catalog, engine, coordinator, or AI.
 */
import type { ProjectArtifact, ProjectFile } from "@/types/project";
import {
  getQuickBomReadinessReport,
  type QuickBomReadinessReport,
} from "@/lib/projects/quick-bom-readiness";

/**
 * Lean, serializable summary of one BoQ file. Deliberately omits storagePath
 * and tenantId-bearing fields - this is a UI/report shape, not a storage handle.
 */
export interface RfpBoqFileSummary {
  id: string;
  projectId: string;
  fileRole: "boq";
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt: string;
  retainUntil: string;
  roleCorrectedBy?: string;
}

/** Coarse RFP BoQ lane state. */
export type RfpBoqReadinessStatus =
  | "no_boq_file"
  | "ready_to_normalize"
  | "quick_bom_in_progress"
  | "customer_deliverable_ready";

/**
 * Stable payload kind marking the explicit, human-approved "no BoQ /
 * service-only" RFP exception. An approved configuration_expansion carrying
 * this kind (on the configuration_expansion_review stage) is the ONLY thing
 * that clears the configuration gate when no BoQ file was uploaded.
 */
const RFP_NO_BOQ_EXCEPTION_PAYLOAD_KIND = "rfp_no_boq_service_only_exception";

/** Payload kind of an unreviewed configuration_expansion draft marker. */
const CONFIGURATION_EXPANSION_DRAFT_PAYLOAD_KIND = "configuration_expansion_draft";

/** Coarse state of the read-only BoQ/configuration gate. */
export type RfpConfigurationGateStatus =
  | "requires_boq_upload_or_exception"
  | "no_boq_exception_pending_review"
  | "no_boq_exception_approved"
  | "requires_boq_normalization"
  | "requires_sku_resolution"
  | "requires_configuration_expansion"
  | "configuration_expansion_approved";

/**
 * Read-only summary of whether configuration authority is cleared for this RFP
 * package - either by an approved normal configuration_expansion (BoQ present)
 * or by an approved no-BoQ service-only exception (no BoQ). Pure report shape.
 */
export interface RfpConfigurationGate {
  required: boolean;
  satisfied: boolean;
  waived: boolean;
  status: RfpConfigurationGateStatus;
  message: string;
  approvedConfigurationExpansionArtifactId?: string;
  noBoqExceptionArtifactId?: string;
  noBoqExceptionReason?: string;
}

/** Read-only input: a project id plus its files and artifacts to inspect. */
export interface GetRfpBoqReadinessReportInput {
  projectId: string;
  files: readonly ProjectFile[];
  artifacts: readonly ProjectArtifact[];
}

/** The full RFP BoQ lane readiness contract for one project. */
export interface RfpBoqReadinessReport {
  projectId: string;
  boqFileCount: number;
  boqFiles: RfpBoqFileSummary[];
  hasBoqFiles: boolean;
  normalizationCandidateFileIds: string[];
  quickBomReadiness: QuickBomReadinessReport;
  canNormalizeBoq: boolean;
  canCreateSkuResolution: boolean;
  canCreateConfigurationExpansion: boolean;
  canCreatePricedBoq: boolean;
  canCreateExportPackage: boolean;
  isCustomerDeliverableReady: boolean;
  configurationGate: RfpConfigurationGate;
  status: RfpBoqReadinessStatus;
  messages: string[];
}

/** Highest-version normalized_boq for `projectId`; undefined if none. No mutation. */
function latestNormalizedBoq(
  artifacts: readonly ProjectArtifact[],
  projectId: string
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.projectId !== projectId || artifact.type !== "normalized_boq") continue;
    if (!latest || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

/** Read a string payload field, or undefined when absent/non-string. */
function payloadString(
  payload: Record<string, unknown>,
  key: string
): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

/** True for an explicit no-BoQ / service-only exception configuration_expansion. */
function isNoBoqExceptionArtifact(artifact: ProjectArtifact): boolean {
  return (
    artifact.type === "configuration_expansion" &&
    artifact.stageId === "configuration_expansion_review" &&
    payloadString(artifact.payload, "payloadKind") === RFP_NO_BOQ_EXCEPTION_PAYLOAD_KIND
  );
}

/** True for a normal configuration_expansion: neither a draft marker nor an exception. */
function isNormalConfigurationExpansion(artifact: ProjectArtifact): boolean {
  if (artifact.type !== "configuration_expansion") return false;
  const kind = payloadString(artifact.payload, "payloadKind");
  return (
    kind !== CONFIGURATION_EXPANSION_DRAFT_PAYLOAD_KIND &&
    kind !== RFP_NO_BOQ_EXCEPTION_PAYLOAD_KIND
  );
}

/** Highest-version artifact for `projectId` matching `predicate`; undefined if none. */
function latestMatching(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  predicate: (artifact: ProjectArtifact) => boolean
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.projectId !== projectId || !predicate(artifact)) continue;
    if (!latest || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

/**
 * Build the read-only configuration gate. BoQ present => only an approved normal
 * configuration_expansion satisfies it (no-BoQ exceptions are ignored). No BoQ
 * => only an approved no-BoQ exception satisfies it (and waives the gate).
 */
function buildConfigurationGate(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  hasBoqFiles: boolean,
  quickBomReadiness: QuickBomReadinessReport,
  normalizedPresentNonStale: boolean
): RfpConfigurationGate {
  if (hasBoqFiles) {
    const approved = latestMatching(
      artifacts,
      projectId,
      (a) => isNormalConfigurationExpansion(a) && a.status === "approved"
    );
    if (approved) {
      return {
        required: true,
        satisfied: true,
        waived: false,
        status: "configuration_expansion_approved",
        message: "Configuration expansion is approved for this RFP BoQ package.",
        approvedConfigurationExpansionArtifactId: approved.id,
      };
    }
    const skuApproved =
      quickBomReadiness.steps.find((s) => s.stepId === "sku_resolution")?.isApproved === true;
    let status: RfpConfigurationGateStatus;
    let message: string;
    if (!normalizedPresentNonStale) {
      status = "requires_boq_normalization";
      message = "BoQ must be normalized before configuration expansion can be approved.";
    } else if (!skuApproved) {
      status = "requires_sku_resolution";
      message = "SKU resolution must be approved before configuration expansion can be approved.";
    } else {
      status = "requires_configuration_expansion";
      message = "An approved configuration expansion is required for this RFP BoQ package.";
    }
    return { required: true, satisfied: false, waived: false, status, message };
  }

  const exception = latestMatching(artifacts, projectId, isNoBoqExceptionArtifact);
  const reason = exception ? payloadString(exception.payload, "reason") : undefined;
  const reasonField = reason !== undefined ? { noBoqExceptionReason: reason } : {};
  if (exception?.status === "approved") {
    return {
      required: false,
      satisfied: true,
      waived: true,
      status: "no_boq_exception_approved",
      message: "An approved no-BoQ service-only exception waives the configuration gate.",
      noBoqExceptionArtifactId: exception.id,
      ...reasonField,
    };
  }
  if (exception && (exception.status === "generated" || exception.status === "needs_review")) {
    return {
      required: false,
      satisfied: false,
      waived: false,
      status: "no_boq_exception_pending_review",
      message: "A no-BoQ service-only exception is pending review.",
      noBoqExceptionArtifactId: exception.id,
      ...reasonField,
    };
  }
  return {
    required: false,
    satisfied: false,
    waived: false,
    status: "requires_boq_upload_or_exception",
    message: "Upload a BoQ file or record an approved no-BoQ service-only exception.",
  };
}

/** Map a BoQ ProjectFile to its lean, serializable summary (no storagePath). */
function toBoqSummary(file: ProjectFile): RfpBoqFileSummary {
  return {
    id: file.id,
    projectId: file.projectId,
    fileRole: "boq",
    fileName: file.fileName,
    ...(file.mimeType !== undefined ? { mimeType: file.mimeType } : {}),
    ...(file.sizeBytes !== undefined ? { sizeBytes: file.sizeBytes } : {}),
    uploadedAt: file.uploadedAt.toISOString(),
    retainUntil: file.retainUntil.toISOString(),
    ...(file.roleCorrectedBy !== undefined ? { roleCorrectedBy: file.roleCorrectedBy } : {}),
  };
}

/**
 * Build the read-only RFP BoQ lane readiness report for one project. Pure:
 * inspects only `projectId`'s BoQ files and artifacts, delegates artifact-chain
 * readiness to getQuickBomReadinessReport, and never mutates inputs.
 */
export function getRfpBoqReadinessReport(
  input: GetRfpBoqReadinessReportInput
): RfpBoqReadinessReport {
  const { projectId, files, artifacts } = input;

  const boqFiles = files
    .filter((file) => file.projectId === projectId && file.fileRole === "boq")
    .map(toBoqSummary);
  const hasBoqFiles = boqFiles.length > 0;
  const normalizationCandidateFileIds = boqFiles.map((file) => file.id);

  const quickBomReadiness = getQuickBomReadinessReport({ projectId, artifacts });

  // Latest normalized_boq for this project only; a missing/not_applicable/stale
  // (or absent) artifact still needs (re)normalization.
  const normalized = latestNormalizedBoq(artifacts, projectId);
  const normalizedPresentNonStale =
    normalized !== undefined &&
    normalized.status !== "missing" &&
    normalized.status !== "not_applicable" &&
    normalized.status !== "stale";

  // No BoQ file forces every action false, even if stray Quick BoM artifacts exist.
  const canNormalizeBoq = hasBoqFiles && !normalizedPresentNonStale;
  const canCreateSkuResolution = hasBoqFiles && quickBomReadiness.canCreateSkuResolution;
  const canCreateConfigurationExpansion =
    hasBoqFiles && quickBomReadiness.canCreateConfigurationExpansion;
  const canCreatePricedBoq = hasBoqFiles && quickBomReadiness.canCreatePricedBoq;
  const canCreateExportPackage = hasBoqFiles && quickBomReadiness.canCreateExportPackage;
  const isCustomerDeliverableReady =
    hasBoqFiles && quickBomReadiness.isCustomerDeliverableReady;

  const configurationGate = buildConfigurationGate(
    artifacts,
    projectId,
    hasBoqFiles,
    quickBomReadiness,
    normalizedPresentNonStale
  );

  let status: RfpBoqReadinessStatus;
  let headline: string;
  if (!hasBoqFiles) {
    status = "no_boq_file";
    headline = "No BoQ file is uploaded for this RFP package yet.";
  } else if (canNormalizeBoq) {
    status = "ready_to_normalize";
    headline = `${boqFiles.length} BoQ file(s) are ready to normalize for this RFP package.`;
  } else if (isCustomerDeliverableReady) {
    status = "customer_deliverable_ready";
    headline = "The RFP BoQ lane customer deliverable is ready.";
  } else {
    status = "quick_bom_in_progress";
    headline = "The RFP BoQ package is moving through the Quick BoM chain.";
  }

  const messages = hasBoqFiles
    ? [headline, ...quickBomReadiness.messages]
    : [headline];

  return {
    projectId,
    boqFileCount: boqFiles.length,
    boqFiles,
    hasBoqFiles,
    normalizationCandidateFileIds,
    quickBomReadiness,
    canNormalizeBoq,
    canCreateSkuResolution,
    canCreateConfigurationExpansion,
    canCreatePricedBoq,
    canCreateExportPackage,
    isCustomerDeliverableReady,
    configurationGate,
    status,
    messages,
  };
}
