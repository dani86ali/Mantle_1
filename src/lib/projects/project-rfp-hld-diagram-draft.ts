/**
 * Tenant-scoped deterministic RFP HLD DIAGRAM DRAFT service (Stage 6G-A-001).
 *
 * Produces exactly ONE internal, reviewable (`needs_review`) `hld_diagram`
 * artifact on the existing `hld_design_delta_review` stage. The diagram draft is a
 * pure, deterministic projection of an approved `hld_design_model` topology, gated
 * by the Stage 6F generation-readiness service. It is advisory engineer review
 * material only: it produces NO final HLD document, HTML, draw.io/XML, Mermaid/SVG,
 * technical proposal, export, or customer deliverable, approves nothing, and
 * carries NO SKU/pricing/catalog/configuration/provider/AI authority.
 *
 * The flow is fail-closed: verify the project within its tenant, run the Stage 6F
 * readiness gate and proceed only when it is ready, resolve the approved
 * model/source-bundle/review ids from the readiness report (never from client
 * input), load and re-gate each artifact, validate the approved model payload,
 * derive nodes/links/zones deterministically from the model topology only,
 * HARD-GATE the assembled draft with the Stage 6G-A-001 contract validator BEFORE
 * any write, and persist exactly one artifact. Only lean, serializable summaries
 * are returned - never a model/diagram payload body or the tenant id.
 *
 * It reads only Project state through the project/artifact stores plus the
 * read-only readiness service. It reads NO raw RFP/PDF/DOCX/XLSX file, storage
 * path, evidence/file store, or parser; constructs NO provider adapter and imports
 * NO provider SDK; and makes NO pricing/SKU/catalog/configuration decision.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import { loadRfpHldGenerationReadiness } from "@/lib/projects/project-rfp-hld-generation-readiness";
import {
  validateRfpHldDesignModelPayload,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
  validateRfpHldDiagramDraftPayload,
  type RfpHldDiagramDraftDiagramType,
  type RfpHldDiagramDraftPayload,
  type RfpHldDiagramLink,
  type RfpHldDiagramNode,
  type RfpHldDiagramSourceReference,
  type RfpHldDiagramZone,
} from "@/lib/projects/project-rfp-hld-diagram";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const HLD_STAGE: ProjectStageId = "hld_design_delta_review";
const MODEL_TYPE: ProjectArtifactType = "hld_design_model";
const SOURCE_BUNDLE_TYPE: ProjectArtifactType = "hld_source_bundle";
const REVIEW_TYPE: ProjectArtifactType = "hld_design_model_review";
const DIAGRAM_TYPE: ProjectArtifactType = "hld_diagram";

const DEFAULT_DIAGRAM_TYPE: RfpHldDiagramDraftDiagramType = "topology";
const DIAGRAM_TITLE = "HLD Topology Diagram Draft";
const DIAGRAM_BUNDLE_REF_ID = "diagram-source-bundle";
const DIAGRAM_REVIEW_REF_ID = "diagram-source-review";

// ---------------------------------------------------------------------------
// Result + summary shapes (lean, serializable, never carry a payload body / tenant)
// ---------------------------------------------------------------------------

export interface RfpHldDiagramDraftProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDiagramDraftArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDiagramDraftPayloadSummary {
  payloadKind: typeof RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND;
  diagramType: RfpHldDiagramDraftDiagramType;
  title: string;
  nodeCount: number;
  linkCount: number;
  zoneCount: number;
  sourceReferenceCount: number;
  validationFindingCount: number;
  sourceHldDesignModelArtifactId: string;
  sourceHldSourceBundleArtifactId: string;
  sourceReviewArtifactId: string;
  sourceModelVersion: number;
}

/** Stable precondition sub-reason when a readiness-approved artifact fails re-gating. */
export type RfpHldDiagramDraftPreconditionCode =
  | "readiness_audit_incomplete"
  | "approved_model_unavailable"
  | "source_bundle_unavailable"
  | "review_unavailable"
  | "approved_model_invalid"
  | "source_ids_mismatch";

export interface CreateRfpHldDiagramDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** Only "topology" is supported in this slice; defaults to "topology". */
  diagramType?: RfpHldDiagramDraftDiagramType;
  /** Optional fixed timestamp for deterministic callers/tests; defaults to now. */
  createdAt?: Date;
}

export type CreateRfpHldDiagramDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDiagramDraftProjectSummary }
  | { status: "readiness_blocked"; readinessStatus: string; nextAction: string }
  | { status: "no_topology"; code: "no_diagram_topology" }
  | { status: "precondition_failed"; code: RfpHldDiagramDraftPreconditionCode }
  | { status: "invalid_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDiagramDraftArtifactSummary;
      payloadSummary: RfpHldDiagramDraftPayloadSummary;
    };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function sameOrdered(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toProjectSummary(project: Project): RfpHldDiagramDraftProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): RfpHldDiagramDraftArtifactSummary {
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

function toPayloadSummary(p: RfpHldDiagramDraftPayload): RfpHldDiagramDraftPayloadSummary {
  return {
    payloadKind: p.payloadKind,
    diagramType: p.diagramType,
    title: p.title,
    nodeCount: p.nodes.length,
    linkCount: p.links.length,
    zoneCount: p.zones.length,
    sourceReferenceCount: p.sourceReferences.length,
    validationFindingCount: p.validationFindings.length,
    sourceHldDesignModelArtifactId: p.sourceHldDesignModelArtifactId,
    sourceHldSourceBundleArtifactId: p.sourceHldSourceBundleArtifactId,
    sourceReviewArtifactId: p.sourceReviewArtifactId,
    sourceModelVersion: p.sourceModelVersion,
  };
}

function isApprovedTypeOnStage(
  artifact: ProjectArtifact | null,
  projectId: string,
  type: ProjectArtifactType
): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === type &&
    artifact.stageId === HLD_STAGE &&
    artifact.status === "approved"
  );
}

function isReviewOnStage(artifact: ProjectArtifact | null, projectId: string): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === REVIEW_TYPE &&
    artifact.stageId === HLD_STAGE
  );
}

// ---------------------------------------------------------------------------
// Pure deterministic diagram-draft builder (exported for focused testing)
// ---------------------------------------------------------------------------

/**
 * Project an approved design model's topology into a diagram draft payload. Ids,
 * labels, nodeType/linkType, and domain are preserved verbatim from the model; a
 * node receives a zoneId only when it belongs to exactly one model zone. Diagram
 * source references reuse the model's topology source-reference ids and point at
 * the approved model artifact only (plus coarse pointers to the source bundle and
 * review). No raw model/bundle/review body is copied. The caller must HARD-GATE
 * the returned payload with {@link validateRfpHldDiagramDraftPayload} before any
 * persistence; the builder assumes the model payload is already contract-valid.
 */
export function buildRfpHldDiagramDraftPayload(input: {
  model: ProjectArtifact;
  bundleId: string;
  reviewId: string;
  createdBy: string;
  createdAt: string;
  diagramType: RfpHldDiagramDraftDiagramType;
}): RfpHldDiagramDraftPayload {
  const modelPayload = input.model.payload as unknown as RfpHldDesignModelPayload;
  const topo = modelPayload.topology;
  const modelId = input.model.id;

  // node id -> the model zones that contain it.
  const zonesByNode = new Map<string, string[]>();
  for (const zone of topo.zones) {
    for (const nid of zone.nodeIds) {
      const list = zonesByNode.get(nid) ?? [];
      list.push(zone.id);
      zonesByNode.set(nid, list);
    }
  }

  const nodes: RfpHldDiagramNode[] = topo.nodes.map((n) => {
    const zoneIds = zonesByNode.get(n.id) ?? [];
    return {
      id: n.id,
      label: n.label,
      nodeType: n.nodeType,
      ...(isNonBlank(n.domain) ? { domain: n.domain } : {}),
      ...(zoneIds.length === 1 ? { zoneId: zoneIds[0] } : {}),
      sourceRefIds: [...n.sourceRefIds],
    };
  });

  const links: RfpHldDiagramLink[] = topo.links.map((l) => ({
    id: l.id,
    ...(isNonBlank(l.label) ? { label: l.label } : {}),
    fromNodeId: l.fromNodeId,
    toNodeId: l.toNodeId,
    linkType: l.linkType,
    sourceRefIds: [...l.sourceRefIds],
  }));

  const zones: RfpHldDiagramZone[] = topo.zones.map((z) => ({
    id: z.id,
    label: z.label,
    nodeIds: [...z.nodeIds],
    sourceRefIds: [...z.sourceRefIds],
  }));

  // Distinct model source-reference ids actually used by the topology, in
  // first-seen order across nodes, links, then zones.
  const usedRefIds: string[] = [];
  const seenRefIds = new Set<string>();
  const collect = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (!seenRefIds.has(id)) {
        seenRefIds.add(id);
        usedRefIds.push(id);
      }
    }
  };
  for (const n of nodes) collect(n.sourceRefIds);
  for (const l of links) collect(l.sourceRefIds);
  for (const z of zones) collect(z.sourceRefIds);

  const sourceReferences: RfpHldDiagramSourceReference[] = usedRefIds.map((refId) => ({
    id: refId,
    artifactId: modelId,
    artifactType: "hld_design_model",
    sourcePath: "hld_design_model:" + refId,
    label: "HLD design model source reference " + refId,
  }));
  sourceReferences.push({
    id: DIAGRAM_BUNDLE_REF_ID,
    artifactId: input.bundleId,
    artifactType: "hld_source_bundle",
    sourcePath: "hld_source_bundle",
    label: "Approved HLD source bundle",
  });
  sourceReferences.push({
    id: DIAGRAM_REVIEW_REF_ID,
    artifactId: input.reviewId,
    artifactType: "hld_design_model_review",
    sourcePath: "hld_design_model_review",
    label: "Deterministic HLD design model review",
  });

  return {
    payloadKind: RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    sourceArtifactIds: [modelId, input.bundleId, input.reviewId],
    sourceHldDesignModelArtifactId: modelId,
    sourceHldSourceBundleArtifactId: input.bundleId,
    sourceReviewArtifactId: input.reviewId,
    sourceModelVersion: input.model.version,
    diagramType: input.diagramType,
    title: DIAGRAM_TITLE,
    nodes,
    links,
    zones,
    sourceReferences,
    validationFindings: [],
  };
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Create exactly ONE internal `needs_review` `hld_diagram` draft on the
 * `hld_design_delta_review` stage, tenant-scoped, only after every gate passes.
 * Throws on blank projectId or createdBy before any store call. Returns explicit
 * result statuses for not_found, wrong_mode, readiness_blocked, no_topology (code
 * `no_diagram_topology`, writing nothing), precondition_failed (writing nothing),
 * invalid_payload (writing nothing), and ok. Source ids come from the Stage 6F
 * readiness report, never from input. Never approves anything and never produces a
 * final HLD document/HTML/draw.io/diagram-markup/proposal/export.
 */
export async function createRfpHldDiagramDraft(
  input: CreateRfpHldDiagramDraftInput
): Promise<CreateRfpHldDiagramDraftResult> {
  const projectId = str(input.projectId).trim();
  const createdBy = str(input.createdBy).trim();
  if (projectId === "") throw new Error("HLD diagram draft requires a projectId.");
  if (createdBy === "") throw new Error("HLD diagram draft requires a createdBy.");

  const { tenantId } = input;
  const diagramType = input.diagramType ?? DEFAULT_DIAGRAM_TYPE;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  // Stage 6F readiness is the only gate; proceed only when it is ready.
  const readiness = await loadRfpHldGenerationReadiness({ tenantId, projectId });
  if (readiness.status !== "ready" || readiness.ready !== true) {
    return {
      status: "readiness_blocked",
      readinessStatus: readiness.status,
      nextAction: readiness.nextAction,
    };
  }

  // Resolve the approved model/source-bundle/review ids from the readiness report
  // audit. Never accept ids from client input.
  const audit = readiness.technicalAudit;
  const modelId = str(audit?.approvedModelArtifactId).trim();
  const bundleId = str(audit?.sourceBundleArtifactId).trim();
  const reviewId = str(audit?.reviewArtifactId).trim();
  if (modelId === "" || bundleId === "" || reviewId === "") {
    return { status: "precondition_failed", code: "readiness_audit_incomplete" };
  }

  const model = await getProjectArtifactById(tenantId, projectId, modelId);
  if (!isApprovedTypeOnStage(model, projectId, MODEL_TYPE)) {
    return { status: "precondition_failed", code: "approved_model_unavailable" };
  }
  const bundle = await getProjectArtifactById(tenantId, projectId, bundleId);
  if (!isApprovedTypeOnStage(bundle, projectId, SOURCE_BUNDLE_TYPE)) {
    return { status: "precondition_failed", code: "source_bundle_unavailable" };
  }
  const review = await getProjectArtifactById(tenantId, projectId, reviewId);
  if (!isReviewOnStage(review, projectId)) {
    return { status: "precondition_failed", code: "review_unavailable" };
  }

  // The approved model payload must still pass its own contract.
  if (!validateRfpHldDesignModelPayload((model as ProjectArtifact).payload).valid) {
    return { status: "precondition_failed", code: "approved_model_invalid" };
  }

  // Defense in depth on top of readiness: the model points at exactly the bundle,
  // and the review points at exactly [model, bundle].
  const modelArtifact = model as ProjectArtifact;
  const reviewArtifact = review as ProjectArtifact;
  if (!sameOrdered(modelArtifact.sourceArtifactIds, [bundleId])) {
    return { status: "precondition_failed", code: "source_ids_mismatch" };
  }
  if (!sameOrdered(reviewArtifact.sourceArtifactIds, [modelId, bundleId])) {
    return { status: "precondition_failed", code: "source_ids_mismatch" };
  }

  // No topology nodes -> nothing to draw. Write nothing; do not invent nodes.
  const modelPayload = modelArtifact.payload as unknown as RfpHldDesignModelPayload;
  if (modelPayload.topology.nodes.length === 0) {
    return { status: "no_topology", code: "no_diagram_topology" };
  }

  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const payload = buildRfpHldDiagramDraftPayload({
    model: modelArtifact,
    bundleId,
    reviewId,
    createdBy,
    createdAt,
    diagramType,
  });

  // HARD GATE: the derived draft must validate before any persistence.
  const validation = validateRfpHldDiagramDraftPayload(payload);
  if (!validation.valid) {
    return { status: "invalid_payload", errors: [...validation.errors] };
  }

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: HLD_STAGE,
    type: DIAGRAM_TYPE,
    status: "needs_review",
    payload: payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [modelId, bundleId, reviewId],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}
