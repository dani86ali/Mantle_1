/**
 * Pure, read-only RFP HLD readiness helper (Stage 4 gate only).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Answers whether the later HLD design-delta stage is still blocked. It does
 * not create HLD artifacts, draft designs, read files, inspect payloads, call AI,
 * price, export, resolve SKUs, or make configuration decisions. It only checks
 * latest artifact type/version/status for the required approved upstream RFP
 * authorities: evidence_package, requirements_baseline, compliance_matrix, and
 * configuration_expansion when the RFP has a BoQ lane.
 */
import type {
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
} from "@/types/project";

export type RfpHldReadinessPrerequisiteId =
  | "evidence_package"
  | "requirements_baseline"
  | "compliance_matrix"
  | "configuration_expansion";

export type RfpHldReadinessStatus = "ready" | "blocked";

export interface RfpHldReadinessPrerequisite {
  stepId: RfpHldReadinessPrerequisiteId;
  artifactType: ProjectArtifactType;
  label: string;
  required: boolean;
  requiredStatus: "approved";
  latestArtifactId?: string;
  latestArtifactVersion?: number;
  latestArtifactStatus?: ProjectArtifactStatus;
  isPresent: boolean;
  isApproved: boolean;
  isSatisfied: boolean;
  message: string;
}

export interface GetRfpHldReadinessReportInput {
  projectId: string;
  files: readonly ProjectFile[];
  artifacts: readonly ProjectArtifact[];
}

export interface RfpHldReadinessReport {
  projectId: string;
  status: RfpHldReadinessStatus;
  canCreateHldDesignDelta: boolean;
  hasBoqLane: boolean;
  requiresConfigurationExpansion: boolean;
  blockingStepId: RfpHldReadinessPrerequisiteId | null;
  prerequisites: RfpHldReadinessPrerequisite[];
  messages: string[];
}

interface PrerequisiteDefinition {
  stepId: RfpHldReadinessPrerequisiteId;
  artifactType: ProjectArtifactType;
  label: string;
}

const ALWAYS_REQUIRED: readonly PrerequisiteDefinition[] = [
  {
    stepId: "evidence_package",
    artifactType: "evidence_package",
    label: "Final evidence package",
  },
  {
    stepId: "requirements_baseline",
    artifactType: "requirements_baseline",
    label: "Requirements baseline",
  },
  {
    stepId: "compliance_matrix",
    artifactType: "compliance_matrix",
    label: "Compliance matrix",
  },
];

const CONFIGURATION_REQUIRED: PrerequisiteDefinition = {
  stepId: "configuration_expansion",
  artifactType: "configuration_expansion",
  label: "Configuration expansion",
};

const BOQ_LANE_ARTIFACT_TYPES: readonly ProjectArtifactType[] = [
  "normalized_boq",
  "sku_resolution",
  "configuration_expansion",
  "priced_boq",
  "export_package",
];

function latestArtifact(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  type: ProjectArtifactType
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.projectId !== projectId || artifact.type !== type) continue;
    if (latest === undefined || artifact.version > latest.version) {
      latest = artifact;
    }
  }
  return latest;
}

function hasBoqLane(
  projectId: string,
  files: readonly ProjectFile[],
  artifacts: readonly ProjectArtifact[]
): boolean {
  if (
    files.some((file) => file.projectId === projectId && file.fileRole === "boq")
  ) {
    return true;
  }
  return artifacts.some(
    (artifact) =>
      artifact.projectId === projectId &&
      BOQ_LANE_ARTIFACT_TYPES.includes(artifact.type)
  );
}

function toPrerequisite(
  definition: PrerequisiteDefinition,
  required: boolean,
  latest: ProjectArtifact | undefined
): RfpHldReadinessPrerequisite {
  const isPresent =
    latest !== undefined &&
    latest.status !== "missing" &&
    latest.status !== "not_applicable";
  const isApproved = latest?.status === "approved";
  const isSatisfied = !required || isApproved;
  const message = !required
    ? `${definition.label} is not required for this RFP package.`
    : isApproved
      ? `${definition.label} is approved.`
      : `${definition.label} must be approved before HLD can start.`;
  return {
    stepId: definition.stepId,
    artifactType: definition.artifactType,
    label: definition.label,
    required,
    requiredStatus: "approved",
    ...(latest !== undefined
      ? {
          latestArtifactId: latest.id,
          latestArtifactVersion: latest.version,
          latestArtifactStatus: latest.status,
        }
      : {}),
    isPresent,
    isApproved,
    isSatisfied,
    message,
  };
}

export function getRfpHldReadinessReport(
  input: GetRfpHldReadinessReportInput
): RfpHldReadinessReport {
  const { projectId, files, artifacts } = input;
  const requiresConfigurationExpansion = hasBoqLane(projectId, files, artifacts);
  const definitions = [...ALWAYS_REQUIRED, CONFIGURATION_REQUIRED];

  const prerequisites = definitions.map((definition) => {
    const required =
      definition.stepId !== "configuration_expansion" ||
      requiresConfigurationExpansion;
    return toPrerequisite(
      definition,
      required,
      latestArtifact(artifacts, projectId, definition.artifactType)
    );
  });

  const blocking = prerequisites.find(
    (prerequisite) => prerequisite.required && !prerequisite.isSatisfied
  );
  const canCreateHldDesignDelta = blocking === undefined;
  const headline = canCreateHldDesignDelta
    ? "HLD is ready to start: all required upstream RFP artifacts are approved."
    : `HLD is blocked: ${blocking.message}`;

  return {
    projectId,
    status: canCreateHldDesignDelta ? "ready" : "blocked",
    canCreateHldDesignDelta,
    hasBoqLane: requiresConfigurationExpansion,
    requiresConfigurationExpansion,
    blockingStepId: blocking?.stepId ?? null,
    prerequisites,
    messages: [headline, ...prerequisites.map((entry) => entry.message)],
  };
}
