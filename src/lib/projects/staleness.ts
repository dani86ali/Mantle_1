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
 *
 * Chains rooted at input_package:
 * - Quick BoM: input_package -> normalized_boq -> sku_resolution ->
 *   configuration_expansion -> priced_boq -> export_package.
 * - RFP evidence: input_package -> extraction_delta -> evidence_package ->
 *   requirements_baseline -> compliance_matrix -> ... Requirements depend on
 *   the human-approved evidence_package, never directly on raw extraction.
 *
 * Stage 6 HLD readiness spine: the approved design inputs
 * (requirements_baseline, compliance_matrix, configuration_expansion) plus the
 * approved engineer design intake (hld_intake, a separate input root) feed
 * hld_readiness_snapshot, which feeds the deterministic hld_source_bundle (the
 * structured authority package compiled after readiness approval), which feeds
 * the hld_design_model, which feeds its advisory hld_design_model_review, which
 * feeds the hld_diagram and the structured hld_document_model; the diagram also
 * feeds hld_document_model, which feeds the future rendered hld_document, and an
 * approved hld_document can feed technical_proposal. A model change stales its
 * advisory review; a review change stales the diagram and the document model
 * without marking the model stale; a diagram change stales the document model;
 * and a document-model change stales the future hld_document. hld_document stays
 * a future rendered-output contract - only its staleness edges are declared
 * here, no generation behavior.
 *
 * Stage 6.3: design_knowledge_pack is an approved domain knowledge artifact
 * (solution patterns, validated topologies, design constraints) that feeds
 * hld_readiness_snapshot. Its payload schema is defined in a separate prompt.
 */
const ARTIFACT_DEPENDENCY_GRAPH: Readonly<
  Record<ProjectArtifactType, readonly ProjectArtifactType[]>
> = {
  input_package: ["normalized_boq", "extraction_delta"],
  extraction_delta: ["evidence_package"],
  evidence_package: ["requirements_baseline"],
  normalized_boq: ["sku_resolution", "hld_design_delta"],
  sku_resolution: ["configuration_expansion"],
  configuration_expansion: ["priced_boq", "hld_readiness_snapshot"],
  requirements_baseline: ["compliance_matrix", "hld_readiness_snapshot"],
  compliance_matrix: [
    "hld_design_delta",
    "technical_proposal",
    "hld_readiness_snapshot",
  ],
  hld_design_delta: ["technical_proposal"],
  priced_boq: ["technical_proposal", "export_package"],
  hld_intake: ["hld_readiness_snapshot"],
  design_knowledge_pack: ["hld_readiness_snapshot"],
  hld_readiness_snapshot: ["hld_source_bundle"],
  hld_source_bundle: ["hld_design_model"],
  hld_design_model: ["hld_design_model_review"],
  hld_design_model_review: ["hld_diagram", "hld_document_model"],
  // Request metadata only - not design authority and never an upstream of any
  // generated output, so it is a leaf with no downstream edges.
  hld_design_model_rebuild_request: [],
  hld_diagram: ["hld_document_model"],
  hld_document_model: ["hld_document"],
  hld_document: ["technical_proposal"],
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
