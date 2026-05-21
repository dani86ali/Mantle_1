/**
 * Canonical Project stage definitions + pure materialization helpers.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Unified stage ids/statuses: src/types/project.ts (section 11, 12, 13, 15).
 *
 * This module is PURE: it defines the hardcoded stage sequence and returns
 * plain metadata / insert-ready rows. It does NOT import Drizzle, query the
 * database, version artifacts, run approvals, or propagate staleness. Those
 * belong to later repository/API work.
 *
 * Global stage `order` values are stable across modes (section 3: "Stage
 * ordering is hardcoded in TypeScript ... and materialized per Project"). A
 * stage keeps the same order number whether it is active or not_applicable for
 * a given mode; do not renumber per mode.
 */
import type {
  ProjectMode,
  ProjectStageId,
  ProjectStageStatus,
  ProjectArtifactType,
} from "@/types/project";

/** Static metadata for one canonical stage. Behavior-free. */
export interface ProjectStageDefinition {
  stageId: ProjectStageId;
  /** Stable global ordering position, unique across all stages. */
  order: number;
  label: string;
  purpose: string;
  /** Modes in which this stage is an active top-level review stage. */
  activeInModes: readonly ProjectMode[];
  /** Artifact kinds this stage produces/consumes. (section 15) */
  artifactTypes: readonly ProjectArtifactType[];
}

/**
 * The canonical stage sequence in stable global order (10, 20, ...). The Quick
 * BoM (section 11) and RFP (section 12) workflows are projections of this list
 * via `activeInModes`.
 */
export const PROJECT_STAGE_DEFINITIONS: readonly ProjectStageDefinition[] = [
  {
    stageId: "intake_package_review",
    order: 10,
    label: "Intake Package Review",
    purpose:
      "Review the uploaded RFP package and correct any misclassified file roles.",
    activeInModes: ["rfp"],
    artifactTypes: ["input_package"],
  },
  {
    stageId: "boq_format_validation",
    order: 20,
    label: "BoQ Format Validation",
    purpose:
      "Validate the uploaded BoQ/BoM against the two locked formats and normalize accepted rows.",
    activeInModes: ["quick_bom"],
    artifactTypes: ["input_package", "normalized_boq"],
  },
  {
    stageId: "sku_resolution",
    order: 30,
    label: "SKU Resolution",
    purpose:
      "Resolve BoQ SKUs against the catalog with human-approved suggestions before pricing.",
    activeInModes: ["quick_bom"],
    artifactTypes: ["sku_resolution"],
  },
  {
    stageId: "requirements_baseline_review",
    order: 40,
    label: "Requirements Baseline Review",
    purpose:
      "Review extracted RFP requirements and confirm the requirements baseline.",
    activeInModes: ["rfp"],
    artifactTypes: ["requirements_baseline"],
  },
  {
    stageId: "compliance_matrix_review",
    order: 50,
    label: "Compliance Matrix Review",
    purpose: "Review the compliance matrix derived from the requirements baseline.",
    activeInModes: ["rfp"],
    artifactTypes: ["compliance_matrix"],
  },
  {
    stageId: "hld_design_delta_review",
    order: 60,
    label: "HLD / Design Delta Review",
    purpose:
      "Review the HLD and design deltas; design must not modify the customer BoQ.",
    activeInModes: ["rfp"],
    artifactTypes: ["hld_design_delta"],
  },
  {
    stageId: "boq_pricing_review",
    order: 70,
    label: "BoQ Pricing Review",
    purpose:
      "Review deterministic SAR pricing of the normalized, SKU-resolved BoQ.",
    activeInModes: ["quick_bom", "rfp"],
    artifactTypes: ["normalized_boq", "sku_resolution", "priced_boq"],
  },
  {
    stageId: "proposal_review",
    order: 80,
    label: "Proposal Review",
    purpose:
      "Review generated proposal content after design, compliance, and pricing approvals.",
    activeInModes: ["rfp"],
    artifactTypes: ["technical_proposal"],
  },
  {
    stageId: "export_approval",
    order: 90,
    label: "Export Approval",
    purpose: "Approve the final export package before delivery.",
    activeInModes: ["quick_bom", "rfp"],
    artifactTypes: ["export_package"],
  },
];

/** Options for selecting stage definitions by mode. */
export interface GetProjectStageDefinitionsOptions {
  /** Include stages not active in the mode (for not_applicable materialization). */
  includeNotApplicable?: boolean;
}

/**
 * Insert-ready row shaped for the Drizzle `project_stages` table. Tenant id is
 * carried explicitly (the table duplicates it per row). Not a DB call.
 */
export interface MaterializedProjectStage {
  projectId: string;
  tenantId: string;
  stageId: ProjectStageId;
  stageOrder: number;
  status: ProjectStageStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for {@link materializeProjectStages}. */
export interface MaterializeProjectStagesInput {
  projectId: string;
  tenantId: string;
  mode: ProjectMode;
  /** When true, also emit RFP/Quick-BoM-only stages as `not_applicable`. */
  includeNotApplicable?: boolean;
}

/**
 * Stage definitions for a mode, sorted by stable global order. Defaults to the
 * active stages only; pass `includeNotApplicable` to get the full canonical set.
 */
export function getProjectStageDefinitions(
  mode: ProjectMode,
  options: GetProjectStageDefinitionsOptions = {}
): readonly ProjectStageDefinition[] {
  const { includeNotApplicable = false } = options;
  const selected = includeNotApplicable
    ? PROJECT_STAGE_DEFINITIONS
    : PROJECT_STAGE_DEFINITIONS.filter((def) => def.activeInModes.includes(mode));
  return [...selected].sort((a, b) => a.order - b.order);
}

/** The active top-level stages for a mode, sorted by global order. */
export function getActiveProjectStageDefinitions(
  mode: ProjectMode
): readonly ProjectStageDefinition[] {
  return getProjectStageDefinitions(mode);
}

/** True if the stage is an active top-level review stage in the given mode. */
export function isProjectStageApplicable(
  mode: ProjectMode,
  stageId: ProjectStageId
): boolean {
  const def = PROJECT_STAGE_DEFINITIONS.find((d) => d.stageId === stageId);
  return def ? def.activeInModes.includes(mode) : false;
}

/**
 * Materialize the per-Project stage rows for a mode. Active stages start
 * `not_started`; stages included only via `includeNotApplicable` are
 * `not_applicable`. Pure: returns plain objects, performs no DB access.
 */
export function materializeProjectStages(
  input: MaterializeProjectStagesInput
): MaterializedProjectStage[] {
  const { projectId, tenantId, mode, includeNotApplicable = false } = input;
  const now = new Date();
  return getProjectStageDefinitions(mode, { includeNotApplicable }).map((def) => ({
    projectId,
    tenantId,
    stageId: def.stageId,
    stageOrder: def.order,
    status: def.activeInModes.includes(mode)
      ? ("not_started" as const)
      : ("not_applicable" as const),
    createdAt: now,
    updatedAt: now,
  }));
}
