/**
 * Pure Project artifact stale-propagation planning helpers.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical unions: src/types/project.ts (section 14, 15, 16).
 *
 * This module is PURE: it walks a hardcoded artifact dependency graph and
 * returns plain "planned update" objects describing which downstream artifacts
 * SHOULD be marked stale when an upstream artifact changes. It does NOT import
 * Drizzle, query the database, write rows, run approvals, or mutate its inputs.
 * Applying the plan (the actual status writes) belongs to later repository work.
 *
 * Staleness propagates by artifact TYPE for the MVP (section 16: "Upstream
 * changes automatically mark downstream artifacts stale"). Approved artifact
 * content stays frozen; this helper only plans a status transition to `stale`
 * and never touches payload/filePath/source references.
 */
import type {
  ProjectArtifactStatus,
  ProjectArtifactType,
} from "@/types/project";

/**
 * The MVP artifact dependency graph: each key maps to the artifact types
 * DIRECTLY downstream of it (edges point upstream -> downstream). Readonly so
 * the graph cannot be mutated through it.
 */
const ARTIFACT_DEPENDENCY_GRAPH: Readonly<
  Record<ProjectArtifactType, readonly ProjectArtifactType[]>
> = {
  input_package: ["normalized_boq", "requirements_baseline"],
  normalized_boq: ["sku_resolution", "priced_boq", "hld_design_delta"],
  sku_resolution: ["priced_boq"],
  requirements_baseline: ["compliance_matrix"],
  compliance_matrix: ["hld_design_delta", "technical_proposal"],
  hld_design_delta: ["technical_proposal"],
  priced_boq: ["technical_proposal", "export_package"],
  technical_proposal: ["export_package"],
  export_package: [],
};

/** Downstream artifact statuses that an upstream change marks stale. (section 14, 16) */
const STALE_ELIGIBLE_STATUSES: readonly ProjectArtifactStatus[] = [
  "generated",
  "needs_review",
  "approved",
  "rejected",
  "failed",
];

/**
 * Minimal artifact shape needed to plan stale updates. A structural subset of
 * {@link import("@/types/project").ProjectArtifact}, so callers may pass full
 * artifact rows directly.
 */
export interface ProjectArtifactForStaleness {
  id: string;
  projectId: string;
  type: ProjectArtifactType;
  version: number;
  status: ProjectArtifactStatus;
}

/**
 * A planned status transition to `stale` for one downstream artifact version.
 * A plain object only - never a DB query. The actual write happens later.
 */
export interface PlannedStaleArtifactUpdate {
  artifactId: string;
  projectId: string;
  type: ProjectArtifactType;
  version: number;
  previousStatus: ProjectArtifactStatus;
  nextStatus: "stale";
  changedArtifactId: string;
  changedArtifactType: ProjectArtifactType;
  updatedAt: Date;
}

/** Input for {@link planStaleArtifactUpdates}. */
export interface PlanStaleArtifactUpdatesInput {
  /** The artifact that changed; its downstream types drive the plan. */
  changedArtifact: ProjectArtifactForStaleness;
  /** Candidate pool; only same-project, downstream, latest-version rows count. */
  artifacts: readonly ProjectArtifactForStaleness[];
  /** Shared timestamp for every planned row. Defaults to now. */
  updatedAt?: Date;
}

/** Artifact types DIRECTLY downstream of `type` (immediate children). */
export function getDirectDownstreamArtifactTypes(
  type: ProjectArtifactType
): readonly ProjectArtifactType[] {
  return ARTIFACT_DEPENDENCY_GRAPH[type];
}

/**
 * All artifact types transitively downstream of `type`, unique, in
 * breadth-first discovery order (deterministic). Excludes `type` itself.
 */
export function getTransitiveDownstreamArtifactTypes(
  type: ProjectArtifactType
): readonly ProjectArtifactType[] {
  const result: ProjectArtifactType[] = [];
  const visited = new Set<ProjectArtifactType>();
  const queue: ProjectArtifactType[] = [...getDirectDownstreamArtifactTypes(type)];
  while (queue.length > 0) {
    const next = queue.shift() as ProjectArtifactType;
    if (visited.has(next)) continue;
    visited.add(next);
    result.push(next);
    queue.push(...getDirectDownstreamArtifactTypes(next));
  }
  return result;
}

/** True if `candidateType` is transitively downstream of `upstreamType`. */
export function isArtifactTypeDownstreamOf(
  upstreamType: ProjectArtifactType,
  candidateType: ProjectArtifactType
): boolean {
  return getTransitiveDownstreamArtifactTypes(upstreamType).includes(
    candidateType
  );
}

/**
 * True if an upstream change should mark this artifact stale. Eligible:
 * `generated`, `needs_review`, `approved`, `rejected`, `failed`. Skipped:
 * `missing`, `stale`, `not_applicable`.
 */
export function shouldMarkArtifactStale(
  artifact: Pick<ProjectArtifactForStaleness, "status">
): boolean {
  return STALE_ELIGIBLE_STATUSES.includes(artifact.status);
}

/**
 * Plan stale-status updates for the artifacts downstream of a changed artifact.
 *
 * Considers only artifacts in the SAME project as the changed artifact, excludes
 * the changed artifact itself, and for each transitively-downstream type plans
 * an update for the LATEST version (highest version number) of that type - and
 * only when that latest version is stale-eligible. Returns plain objects in
 * deterministic downstream-type order; never mutates its inputs and never
 * touches payload/filePath/source references.
 */
export function planStaleArtifactUpdates(
  input: PlanStaleArtifactUpdatesInput
): PlannedStaleArtifactUpdate[] {
  const { changedArtifact, artifacts } = input;
  const updatedAt = input.updatedAt ?? new Date();

  const downstreamTypes = getTransitiveDownstreamArtifactTypes(
    changedArtifact.type
  );

  const updates: PlannedStaleArtifactUpdate[] = [];
  for (const type of downstreamTypes) {
    let latest: ProjectArtifactForStaleness | undefined;
    for (const artifact of artifacts) {
      if (artifact.projectId !== changedArtifact.projectId) continue;
      if (artifact.id === changedArtifact.id) continue;
      if (artifact.type !== type) continue;
      if (!latest || artifact.version > latest.version) latest = artifact;
    }
    if (!latest || !shouldMarkArtifactStale(latest)) continue;
    updates.push({
      artifactId: latest.id,
      projectId: latest.projectId,
      type: latest.type,
      version: latest.version,
      previousStatus: latest.status,
      nextStatus: "stale",
      changedArtifactId: changedArtifact.id,
      changedArtifactType: changedArtifact.type,
      updatedAt,
    });
  }
  return updates;
}
