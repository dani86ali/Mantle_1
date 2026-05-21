/**
 * Pure Project artifact versioning + insert-row materialization helpers.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical unions: src/types/project.ts (section 14, 15, 16).
 * Stage metadata: src/lib/projects/stages.ts.
 *
 * This module is PURE: it computes version numbers and returns insert-ready
 * plain objects shaped for the Drizzle `project_artifacts` table. It does NOT
 * import Drizzle, query the database, write rows, run approvals, propagate
 * staleness, or mutate its inputs. Those belong to later repository/API work.
 *
 * Versioning is per (projectId, type): the next version is one above the max
 * existing version for that pair, including approved versions. Approved
 * versions freeze (section 16); this module only exposes that as a predicate
 * and never performs the approval transition itself.
 */
import { PROJECT_STAGE_DEFINITIONS } from "./stages";
import type {
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

/** Statuses a freshly materialized artifact version may start in. (section 14) */
export type CreatableProjectArtifactStatus =
  | "generated"
  | "needs_review"
  | "failed";

const CREATABLE_ARTIFACT_STATUSES: readonly ProjectArtifactStatus[] = [
  "generated",
  "needs_review",
  "failed",
];

/**
 * Minimal shape needed to version against prior artifacts. A structural subset
 * of {@link import("@/types/project").ProjectArtifact}, so callers may pass
 * full artifact rows directly.
 */
export interface ExistingProjectArtifactVersion {
  projectId: string;
  type: ProjectArtifactType;
  version: number;
  status: ProjectArtifactStatus;
}

/**
 * Insert-ready row shaped for the Drizzle `project_artifacts` table. The `id`,
 * defaults, and timestamps that the DB generates are omitted/explicit here;
 * tenant id is carried explicitly (the table duplicates it per row). Not a DB
 * call.
 */
export interface MaterializedProjectArtifact {
  projectId: string;
  tenantId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  payload: Record<string, unknown>;
  filePath?: string;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Input for {@link materializeProjectArtifactVersion}. */
export interface MaterializeProjectArtifactVersionInput {
  projectId: string;
  tenantId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  /** Creation status; defaults to `generated`. Approved/stale/missing/not_applicable rejected. */
  status?: ProjectArtifactStatus;
  /** JSONB-shaped payload. Large generated files belong in `filePath`, not here. */
  payload?: Record<string, unknown>;
  filePath?: string;
  sourceFileIds?: string[];
  sourceArtifactIds?: string[];
  /** Prior versions to number against; only matching projectId + type count. */
  existingArtifacts?: readonly ExistingProjectArtifactVersion[];
}

/** Artifact kinds the given stage produces/consumes, per Prompt 3 metadata. */
export function getArtifactTypesForStage(
  stageId: ProjectStageId
): readonly ProjectArtifactType[] {
  const def = PROJECT_STAGE_DEFINITIONS.find((d) => d.stageId === stageId);
  if (!def) {
    throw new Error(`Unknown project stage id: ${stageId}`);
  }
  return def.artifactTypes;
}

/** True if `type` is produced/consumed by `stageId`. False for unknown stages. */
export function isArtifactTypeAllowedForStage(
  stageId: ProjectStageId,
  type: ProjectArtifactType
): boolean {
  const def = PROJECT_STAGE_DEFINITIONS.find((d) => d.stageId === stageId);
  return def ? def.artifactTypes.includes(type) : false;
}

/**
 * The highest-version artifact matching `projectId` + `type`, or undefined when
 * none exist. Artifacts from other projects or of other types are ignored.
 * Does not mutate the input array.
 */
export function getLatestArtifactVersion(
  existingArtifacts: readonly ExistingProjectArtifactVersion[],
  projectId: string,
  type: ProjectArtifactType
): ExistingProjectArtifactVersion | undefined {
  let latest: ExistingProjectArtifactVersion | undefined;
  for (const artifact of existingArtifacts) {
    if (artifact.projectId !== projectId || artifact.type !== type) continue;
    if (!latest || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

/**
 * The version number a new artifact of this projectId + type should take: 1 for
 * the first, otherwise max existing version + 1 (counting approved versions).
 */
export function getNextArtifactVersion(
  existingArtifacts: readonly ExistingProjectArtifactVersion[],
  projectId: string,
  type: ProjectArtifactType
): number {
  return (getLatestArtifactVersion(existingArtifacts, projectId, type)?.version ?? 0) + 1;
}

/** True only for approved artifact versions, which freeze. (section 16) */
export function isArtifactVersionFrozen(
  artifact: Pick<ExistingProjectArtifactVersion, "status">
): boolean {
  return artifact.status === "approved";
}

/**
 * Build a new insert-ready artifact row. Always creates a NEW version (never an
 * update): the version is computed from prior matching artifacts. The stage/type
 * pair is validated against stage metadata, and the creation status is limited
 * to {@link CreatableProjectArtifactStatus}. Source arrays are copied so the
 * caller cannot later mutate the returned row through its input arrays.
 */
export function materializeProjectArtifactVersion(
  input: MaterializeProjectArtifactVersionInput
): MaterializedProjectArtifact {
  const {
    projectId,
    tenantId,
    stageId,
    type,
    status = "generated",
    payload = {},
    filePath,
    sourceFileIds = [],
    sourceArtifactIds = [],
    existingArtifacts = [],
  } = input;

  if (!isArtifactTypeAllowedForStage(stageId, type)) {
    throw new Error(
      `Artifact type "${type}" is not allowed for stage "${stageId}".`
    );
  }
  if (!CREATABLE_ARTIFACT_STATUSES.includes(status)) {
    throw new Error(
      `Cannot create an artifact version with status "${status}"; allowed creation statuses are ${CREATABLE_ARTIFACT_STATUSES.join(
        ", "
      )}.`
    );
  }

  const now = new Date();
  return {
    projectId,
    tenantId,
    stageId,
    type,
    status,
    version: getNextArtifactVersion(existingArtifacts, projectId, type),
    payload,
    ...(filePath !== undefined ? { filePath } : {}),
    sourceFileIds: [...sourceFileIds],
    sourceArtifactIds: [...sourceArtifactIds],
    createdAt: now,
    updatedAt: now,
  };
}
