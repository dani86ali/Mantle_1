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
    status,
    messages,
  };
}
