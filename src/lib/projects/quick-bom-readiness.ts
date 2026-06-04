/**
 * Pure, read-only Quick BoM workflow-readiness helper.
 * Source of truth: MVP_CANONICAL_PROJECT_STATE.md (sections 8, 11, 11A, 14, 16, 19).
 *
 * Answers, from existing Project artifacts: "what is the next Quick BoM step,
 * and which artifact/approval is blocking it?" It NEVER creates, approves,
 * prices, exports, loads files, calls a catalog, or runs AI - it only inspects
 * artifact type/version/status for one project and reports readiness.
 *
 * Spine + gates (section 11 / 11A.3, section 16; prompts 43/44): each step needs
 * its predecessor approved before it may run, except normalized_boq, which needs
 * only to be present and not stale (it is NOT approval-gated here). See `SPINE`.
 *
 * NO runtime imports - only canonical project types - so it cannot reach a DB,
 * artifact service, pricing, catalog, Mantle, engine, coordinator, or AI.
 */
import type {
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
} from "@/types/project";

/** The ordered Quick BoM spine step ids (each maps 1:1 to an artifact type). */
export type QuickBomReadinessStepId =
  | "normalized_boq"
  | "sku_resolution"
  | "configuration_expansion"
  | "priced_boq"
  | "export_package";

/** The gate an upstream step must reach before its downstream step may run. */
export type QuickBomGateRequirement = "present_non_stale" | "approved";

/** Coarse readiness state of one spine step (see the status mapping below). */
export type QuickBomReadinessStatus =
  | "blocked"
  | "not_started"
  | "needs_review"
  | "available"
  | "stale"
  | "approved";

/** One spine step's readiness, derived from artifact type/version/status only. */
export interface QuickBomReadinessStep {
  stepId: QuickBomReadinessStepId;
  artifactType: ProjectArtifactType;
  status: QuickBomReadinessStatus;
  requiredStatusForNextStep: QuickBomGateRequirement;
  latestArtifactId?: string;
  latestArtifactVersion?: number;
  latestArtifactStatus?: ProjectArtifactStatus;
  isPresent: boolean;
  isApproved: boolean;
  isStale: boolean;
  blocksNextStep: boolean;
  message: string;
}

/** Read-only input: a project id plus the artifacts to inspect. */
export interface GetQuickBomReadinessReportInput {
  projectId: string;
  artifacts: readonly ProjectArtifact[];
}

/** The full Quick BoM readiness contract for one project. */
export interface QuickBomReadinessReport {
  projectId: string;
  steps: QuickBomReadinessStep[];
  nextStepId: QuickBomReadinessStepId | null;
  blockingStepId: QuickBomReadinessStepId | null;
  canCreateSkuResolution: boolean;
  canCreateConfigurationExpansion: boolean;
  canCreatePricedBoq: boolean;
  canCreateExportPackage: boolean;
  isCustomerDeliverableReady: boolean;
  messages: string[];
}

/** Static spine metadata; array order is the workflow order (predecessor = prior). */
interface SpineStep {
  stepId: QuickBomReadinessStepId;
  label: string;
  requirement: QuickBomGateRequirement;
}

const SPINE: readonly SpineStep[] = [
  { stepId: "normalized_boq", label: "Normalized BoQ", requirement: "present_non_stale" },
  { stepId: "sku_resolution", label: "SKU resolution", requirement: "approved" },
  { stepId: "configuration_expansion", label: "Configuration expansion", requirement: "approved" },
  { stepId: "priced_boq", label: "Priced BoQ", requirement: "approved" },
  { stepId: "export_package", label: "Export package", requirement: "approved" },
];

/** Highest-version artifact of `type` for `projectId`; undefined if none. No mutation. */
function latestArtifact(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  type: ProjectArtifactType
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.projectId !== projectId || artifact.type !== type) continue;
    if (!latest || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

function stepMessage(
  step: SpineStep,
  status: QuickBomReadinessStatus,
  predecessor: SpineStep | undefined
): string {
  const need = predecessor?.requirement === "present_non_stale" ? "present and not stale" : "approved";
  const blocker = `${predecessor?.label ?? "the prior step"} is ${need}`;
  switch (status) {
    case "blocked": return `${step.label} is blocked until ${blocker}.`;
    case "not_started": return `${step.label} can be created now.`;
    case "needs_review": return `${step.label} is present and awaiting approval.`;
    case "available": return `${step.label} is present and ready for the next step.`;
    case "stale": return `${step.label} is stale and must be regenerated.`;
    case "approved": return `${step.label} is approved.`;
  }
}

/**
 * Build the read-only Quick BoM readiness report for one project. Pure: inspects
 * only `projectId`'s artifacts, takes the highest version per type, never mutates.
 */
export function getQuickBomReadinessReport(
  input: GetQuickBomReadinessReportInput
): QuickBomReadinessReport {
  const { projectId, artifacts } = input;

  const satisfied = new Map<QuickBomReadinessStepId, boolean>();
  const steps: QuickBomReadinessStep[] = SPINE.map((step, i) => {
    const latest = latestArtifact(artifacts, projectId, step.stepId);
    const isPresent = latest !== undefined && latest.status !== "missing" && latest.status !== "not_applicable";
    const isApproved = latest?.status === "approved";
    const isStale = latest?.status === "stale";
    // Gate is status-only: "approved" needs approval; else present and not stale.
    const gateMet = step.requirement === "approved" ? isApproved : isPresent && !isStale;
    satisfied.set(step.stepId, gateMet);

    // Predecessor is the prior spine step (already in `satisfied`, an ordered map).
    const predecessor = i > 0 ? SPINE[i - 1] : undefined;
    const predecessorSatisfied = predecessor
      ? satisfied.get(predecessor.stepId) === true
      : true;

    let status: QuickBomReadinessStatus;
    if (isStale) status = "stale";
    else if (isApproved) status = "approved";
    else if (!predecessorSatisfied) status = "blocked";
    else if (!isPresent) status = "not_started";
    else status = step.requirement === "approved" ? "needs_review" : "available";

    return {
      stepId: step.stepId,
      artifactType: step.stepId,
      status,
      requiredStatusForNextStep: step.requirement,
      ...(latest !== undefined
        ? {
            latestArtifactId: latest.id,
            latestArtifactVersion: latest.version,
            latestArtifactStatus: latest.status,
          }
        : {}),
      isPresent,
      isApproved,
      isStale,
      blocksNextStep: !gateMet,
      message: stepMessage(step, status, predecessor),
    };
  });

  // Linear spine: the next step to act on IS the first unmet gate (also the blocker).
  const blockingStep = steps.find((s) => s.blocksNextStep) ?? null;
  const unmet = steps.findIndex((s) => s.blocksNextStep);
  const gatesMet = unmet === -1 ? steps.length : unmet;
  const isCustomerDeliverableReady = unmet === -1; // ready only when the full spine is satisfied
  const headline = isCustomerDeliverableReady
    ? "Quick BoM customer deliverable is ready: the export package is approved."
    : blockingStep
      ? `Next step ${blockingStep.stepId}: ${blockingStep.message}`
      : "Quick BoM is in progress.";

  return {
    projectId,
    steps,
    nextStepId: blockingStep ? blockingStep.stepId : null,
    blockingStepId: blockingStep ? blockingStep.stepId : null,
    canCreateSkuResolution: gatesMet >= 1, // transitive: every gate through the predecessor holds
    canCreateConfigurationExpansion: gatesMet >= 2,
    canCreatePricedBoq: gatesMet >= 3,
    canCreateExportPackage: gatesMet >= 4,
    isCustomerDeliverableReady,
    messages: [headline],
  };
}
