/**
 * Tenant-scoped deterministic RFP HLD DIAGRAM OUTPUT generation service (Stage 6I-B).
 *
 * Produces exactly ONE internal, reviewable (`needs_review`) `hld_diagram_output`
 * artifact on the existing `hld_design_delta_review` stage. The output is a pure,
 * deterministic layout projection of a single approved `hld_diagram`, gated by the
 * Stage 6F generation-readiness service and the full HLD source chain. It is engineer
 * review material only: it produces NO draw.io XML/SVG/HTML/Mermaid, no rendered or
 * downloadable output, no final HLD document, technical proposal, export, or customer
 * deliverable; it approves nothing and carries NO SKU/pricing/catalog/configuration/
 * provider/AI authority. It is internal/reviewable, NOT final HLD authority.
 *
 * The flow is fail-closed: verify the project within its tenant, run the final-HLD
 * authority regeneration guard (writing nothing when blocked), run the Stage 6F
 * readiness gate and proceed only when ready, resolve the approved model/bundle/review
 * ids from the readiness technical audit ONLY (never from client input), re-load and
 * re-gate each artifact, re-validate each upstream payload, prove the full source
 * chain, select the newest current approved `hld_diagram` whose payload and chain tie
 * back to that exact model/bundle/review, derive a deterministic layout from the
 * diagram payload alone, HARD-GATE the derived output with the Stage 6I-A contract
 * validator BEFORE any write, and persist exactly one artifact. Only lean summaries
 * are returned - never a diagram/output payload body or the tenant id.
 *
 * It reads only Project state through the project/artifact stores plus the read-only
 * readiness service. It reads NO raw RFP/PDF/DOCX/XLSX file, storage path, evidence
 * store, or parser; constructs NO provider adapter and imports NO provider SDK; and
 * makes NO pricing/SKU/catalog/configuration decision.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import { loadRfpHldGenerationReadiness } from "@/lib/projects/project-rfp-hld-generation-readiness";
import {
  evaluateRfpHldFinalAuthorityRegenerationGuard,
  type RfpHldFinalAuthorityRegenerationSummary,
} from "@/lib/projects/project-rfp-hld-final-authority-regeneration-guard";
import { validateRfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";
import { validateRfpHldDesignModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import { validateRfpHldDesignModelReviewPayload } from "@/lib/projects/project-rfp-hld-design-model-review";
import {
  validateRfpHldDiagramDraftPayload,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";
import {
  RFP_HLD_DIAGRAM_OUTPUT_FORMAT,
  RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND,
  validateRfpHldDiagramOutputPayload,
  type RfpHldDiagramOutputLink,
  type RfpHldDiagramOutputNode,
  type RfpHldDiagramOutputPayload,
  type RfpHldDiagramOutputZone,
} from "@/lib/projects/project-rfp-hld-diagram-output";
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
const OUTPUT_TYPE: ProjectArtifactType = "hld_diagram_output";

/** Active advisory-review status boundary, mirroring the Stage 6F readiness gate. */
const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

/**
 * Current-output status boundary: an existing `hld_diagram_output` in any of these
 * states blocks creating another current output. Rejected/stale/failed/missing/
 * not_applicable outputs do NOT block a fresh create.
 */
const CURRENT_OUTPUT_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

const OUTPUT_TITLE = "HLD Topology Diagram Output";

// Deterministic grid geometry constants (bounded, positive).
const MARGIN = 40;
const NODE_W = 160;
const NODE_H = 60;
const GAP_X = 80;
const GAP_Y = 80;
const ROW_H = NODE_H + GAP_Y;
const ZONE_W = 200;
const ZONE_H = 60;
const GRID_SIZE = 10;

// ---------------------------------------------------------------------------
// Result + summary shapes (lean, serializable, never carry a payload body / tenant)
// ---------------------------------------------------------------------------

export interface RfpHldDiagramOutputProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDiagramOutputArtifactSummary {
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

export interface RfpHldDiagramOutputPayloadSummary {
  payloadKind: typeof RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND;
  outputFormat: typeof RFP_HLD_DIAGRAM_OUTPUT_FORMAT;
  diagramType: "topology";
  title: string;
  nodeCount: number;
  linkCount: number;
  zoneCount: number;
  validationFindingCount: number;
  sourceArtifactIds: string[];
  sourceHldDiagramArtifactId: string;
  sourceDiagramVersion: number;
  canvasWidth: number;
  canvasHeight: number;
}

/** Stable precondition sub-reason when a readiness-approved chain fails re-gating. */
export type RfpHldDiagramOutputPreconditionCode =
  | "readiness_audit_incomplete"
  | "approved_model_unavailable"
  | "source_bundle_unavailable"
  | "review_unavailable"
  | "approved_model_invalid"
  | "source_bundle_invalid"
  | "review_invalid"
  | "source_chain_mismatch"
  | "approved_diagram_unavailable";

export interface CreateRfpHldDiagramOutputInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** Optional fixed timestamp for deterministic callers/tests; defaults to now. */
  createdAt?: Date;
}

export type CreateRfpHldDiagramOutputResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDiagramOutputProjectSummary }
  | {
      status: "final_hld_already_approved";
      finalAuthority: RfpHldFinalAuthorityRegenerationSummary;
    }
  | { status: "readiness_blocked"; readinessStatus: string; nextAction: string }
  | { status: "precondition_failed"; code: RfpHldDiagramOutputPreconditionCode }
  | { status: "current_output_exists"; artifact: RfpHldDiagramOutputArtifactSummary }
  | { status: "invalid_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDiagramOutputArtifactSummary;
      payloadSummary: RfpHldDiagramOutputPayloadSummary;
    };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function sameOrdered(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toProjectSummary(project: Project): RfpHldDiagramOutputProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): RfpHldDiagramOutputArtifactSummary {
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

function toPayloadSummary(p: RfpHldDiagramOutputPayload): RfpHldDiagramOutputPayloadSummary {
  return {
    payloadKind: p.payloadKind,
    outputFormat: p.outputFormat,
    diagramType: p.diagramType,
    title: p.title,
    nodeCount: p.nodes.length,
    linkCount: p.links.length,
    zoneCount: p.zones.length,
    validationFindingCount: p.validationFindings.length,
    sourceArtifactIds: p.sourceArtifactIds.slice(),
    sourceHldDiagramArtifactId: p.sourceHldDiagramArtifactId,
    sourceDiagramVersion: p.sourceDiagramVersion,
    canvasWidth: p.canvas.width,
    canvasHeight: p.canvas.height,
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

function isActiveReviewOnStage(artifact: ProjectArtifact | null, projectId: string): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === REVIEW_TYPE &&
    artifact.stageId === HLD_STAGE &&
    ACTIVE_REVIEW_STATUSES.has(artifact.status)
  );
}

/**
 * Prove the full bundle/model/review source chain (rows + payloads). Returns null when
 * the chain is intact, or the precondition code that must block generation. Reads no
 * upstream payload body beyond the coarse source pointers it must tie together.
 */
function proveUpstreamSourceChain(input: {
  model: ProjectArtifact;
  review: ProjectArtifact;
  modelId: string;
  bundleId: string;
  reviewId: string;
}): RfpHldDiagramOutputPreconditionCode | null {
  const { model, review, modelId, bundleId, reviewId } = input;
  const modelPayload = rec(model.payload);
  const reviewPayload = rec(review.payload);
  const modelSourceIds = Array.isArray(modelPayload.sourceArtifactIds)
    ? (modelPayload.sourceArtifactIds as unknown[])
    : [];

  // model row -> exactly [bundle]; model payload -> bundle.
  if (!sameOrdered(model.sourceArtifactIds, [bundleId])) return "source_chain_mismatch";
  if (str(modelPayload.sourceHldSourceBundleArtifactId) !== bundleId) {
    return "source_chain_mismatch";
  }
  if (!sameOrdered(modelSourceIds, [bundleId])) return "source_chain_mismatch";

  // review row + payload -> exactly [model, bundle]; payload pointers -> model/bundle.
  if (!sameOrdered(review.sourceArtifactIds, [modelId, bundleId])) return "source_chain_mismatch";
  const reviewSourceIds = Array.isArray(reviewPayload.sourceArtifactIds)
    ? (reviewPayload.sourceArtifactIds as unknown[])
    : [];
  if (!sameOrdered(reviewSourceIds, [modelId, bundleId])) return "source_chain_mismatch";
  if (str(reviewPayload.sourceHldDesignModelArtifactId) !== modelId) return "source_chain_mismatch";
  if (str(reviewPayload.sourceHldSourceBundleArtifactId) !== bundleId) return "source_chain_mismatch";

  return null;
}

/**
 * True when a diagram row is the current approved `hld_diagram` whose row source ids,
 * validated payload, coarse source pointers, and model version all tie back to the
 * exact readiness-selected model/bundle/review chain.
 */
function isCurrentApprovedDiagram(
  row: ProjectArtifact,
  projectId: string,
  ctx: { modelId: string; bundleId: string; reviewId: string; modelVersion: number }
): boolean {
  if (!isApprovedTypeOnStage(row, projectId, DIAGRAM_TYPE)) return false;
  if (!sameOrdered(row.sourceArtifactIds, [ctx.modelId, ctx.bundleId, ctx.reviewId])) return false;
  if (!validateRfpHldDiagramDraftPayload(row.payload).valid) return false;
  const p = row.payload as unknown as RfpHldDiagramDraftPayload;
  return (
    p.sourceHldDesignModelArtifactId === ctx.modelId &&
    p.sourceHldSourceBundleArtifactId === ctx.bundleId &&
    p.sourceReviewArtifactId === ctx.reviewId &&
    p.sourceModelVersion === ctx.modelVersion
  );
}

// ---------------------------------------------------------------------------
// Pure deterministic output-layout builder (exported for focused testing)
// ---------------------------------------------------------------------------

/**
 * Project an approved diagram payload into a deterministic internal layout output.
 * Node/link/zone ids and labels are preserved verbatim; diagram link fromNodeId/
 * toNodeId become output sourceNodeId/targetNodeId; every element carries the coarse
 * single-source provenance [diagram.id]. Output nodes carry NO nodeType. No draw.io
 * XML/markup, provider call, or pricing/SKU/catalog/config decision is produced. The
 * caller must HARD-GATE the returned payload with the Stage 6I-A contract validator
 * before any persistence; the builder assumes the diagram payload is contract-valid.
 */
export function buildRfpHldDiagramOutputPayload(input: {
  diagram: ProjectArtifact;
  createdBy: string;
  createdAt: string;
}): RfpHldDiagramOutputPayload {
  const diagramPayload = input.diagram.payload as unknown as RfpHldDiagramDraftPayload;
  const diagramId = input.diagram.id;
  const sourceRefIds = [diagramId];

  const cols = Math.max(1, Math.ceil(Math.sqrt(diagramPayload.nodes.length)));
  const nodesOriginX = MARGIN + ZONE_W + GAP_X;

  const nodes: RfpHldDiagramOutputNode[] = diagramPayload.nodes.map((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: n.id,
      label: n.label,
      ...(n.zoneId !== undefined ? { zoneId: n.zoneId } : {}),
      geometry: {
        x: nodesOriginX + col * (NODE_W + GAP_X),
        y: MARGIN + row * ROW_H,
        width: NODE_W,
        height: NODE_H,
      },
      sourceRefIds: [...sourceRefIds],
    };
  });

  const zones: RfpHldDiagramOutputZone[] = diagramPayload.zones.map((z, i) => ({
    id: z.id,
    label: z.label,
    geometry: {
      x: MARGIN,
      y: MARGIN + i * ROW_H,
      width: ZONE_W,
      height: ZONE_H,
    },
    sourceRefIds: [...sourceRefIds],
  }));

  const links: RfpHldDiagramOutputLink[] = diagramPayload.links.map((l) => ({
    id: l.id,
    sourceNodeId: l.fromNodeId,
    targetNodeId: l.toNodeId,
    ...(l.label !== undefined ? { label: l.label } : {}),
    sourceRefIds: [...sourceRefIds],
  }));

  const nodeRows = Math.ceil(diagramPayload.nodes.length / cols);
  const canvasWidth = nodesOriginX + cols * (NODE_W + GAP_X) + MARGIN;
  const canvasHeight = MARGIN + Math.max(nodeRows, zones.length, 1) * ROW_H + MARGIN;

  return {
    payloadKind: RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    sourceArtifactIds: [diagramId],
    sourceHldDiagramArtifactId: diagramId,
    sourceDiagramVersion: input.diagram.version,
    outputFormat: RFP_HLD_DIAGRAM_OUTPUT_FORMAT,
    diagramType: "topology",
    title: OUTPUT_TITLE,
    canvas: { width: canvasWidth, height: canvasHeight, gridSize: GRID_SIZE },
    zones,
    nodes,
    links,
    validationFindings: [],
  };
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Create exactly ONE internal `needs_review` `hld_diagram_output` on the
 * `hld_design_delta_review` stage, tenant-scoped, only after every gate passes.
 * Throws on blank projectId or createdBy before any store call. Source ids come from
 * the Stage 6F readiness report, never from input; the diagram is selected from the
 * store, never accepted from a client. Never approves anything and never produces
 * draw.io XML/markup, a rendered/downloadable output, or a final HLD document.
 */
export async function createRfpHldDiagramOutputDraft(
  input: CreateRfpHldDiagramOutputInput
): Promise<CreateRfpHldDiagramOutputResult> {
  const projectId = str(input.projectId).trim();
  const createdBy = str(input.createdBy).trim();
  if (projectId === "") throw new Error("HLD diagram output requires a projectId.");
  if (createdBy === "") throw new Error("HLD diagram output requires a createdBy.");

  const { tenantId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  // Stop before any readiness/source-chain work once an approved final HLD authority
  // already exists; never regenerate downstream from it.
  const guard = await evaluateRfpHldFinalAuthorityRegenerationGuard({ tenantId, projectId });
  if (guard.blocked) {
    return { status: "final_hld_already_approved", finalAuthority: guard.finalAuthority };
  }

  const readiness = await loadRfpHldGenerationReadiness({ tenantId, projectId });
  if (readiness.status !== "ready" || readiness.ready !== true) {
    return {
      status: "readiness_blocked",
      readinessStatus: readiness.status,
      nextAction: readiness.nextAction,
    };
  }

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
  if (!isActiveReviewOnStage(review, projectId)) {
    return { status: "precondition_failed", code: "review_unavailable" };
  }

  const modelArtifact = model as ProjectArtifact;
  const bundleArtifact = bundle as ProjectArtifact;
  const reviewArtifact = review as ProjectArtifact;

  if (!validateRfpHldDesignModelPayload(modelArtifact.payload).valid) {
    return { status: "precondition_failed", code: "approved_model_invalid" };
  }
  if (!validateRfpHldSourceBundlePayload(bundleArtifact.payload).valid) {
    return { status: "precondition_failed", code: "source_bundle_invalid" };
  }
  if (!validateRfpHldDesignModelReviewPayload(reviewArtifact.payload).valid) {
    return { status: "precondition_failed", code: "review_invalid" };
  }

  const chainCode = proveUpstreamSourceChain({
    model: modelArtifact,
    review: reviewArtifact,
    modelId,
    bundleId,
    reviewId,
  });
  if (chainCode !== null) return { status: "precondition_failed", code: chainCode };

  // Select the newest approved diagram whose payload + chain match the current
  // model/bundle/review. Never accept a diagram id from client input.
  const diagramRows = await listProjectArtifactsByType(tenantId, projectId, DIAGRAM_TYPE);
  const ctx = { modelId, bundleId, reviewId, modelVersion: modelArtifact.version };
  const diagram = diagramRows
    .filter((row) => isCurrentApprovedDiagram(row, projectId, ctx))
    .sort((a, b) => b.version - a.version || b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (diagram === undefined) {
    return { status: "precondition_failed", code: "approved_diagram_unavailable" };
  }

  // HARD GATE: never create a second current output. List existing outputs and
  // block if any is on this stage/project and in a current status. Rejected/stale/
  // failed/missing/wrong-stage/wrong-project outputs do not block. No write occurs.
  const existingOutputs = await listProjectArtifactsByType(tenantId, projectId, OUTPUT_TYPE);
  const currentOutput = existingOutputs
    .filter(
      (row) =>
        row.projectId === projectId &&
        row.type === OUTPUT_TYPE &&
        row.stageId === HLD_STAGE &&
        CURRENT_OUTPUT_STATUSES.has(row.status)
    )
    .sort((a, b) => b.version - a.version || b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (currentOutput !== undefined) {
    return { status: "current_output_exists", artifact: toArtifactSummary(currentOutput) };
  }

  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const payload = buildRfpHldDiagramOutputPayload({ diagram, createdBy, createdAt });

  // HARD GATE: the derived output must validate before any persistence.
  const validation = validateRfpHldDiagramOutputPayload(payload);
  if (!validation.ok) {
    return { status: "invalid_payload", errors: [...validation.errors] };
  }

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: HLD_STAGE,
    type: OUTPUT_TYPE,
    status: "needs_review",
    payload: payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [diagram.id],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}
