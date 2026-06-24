/**
 * RFP HLD design-model inspection read model (Stage 6D-005a).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Read-only inspection over `hld_design_model` artifacts on the
 * `hld_design_delta_review` stage. List returns lean counts-only summaries plus a
 * read-only design-model readiness probe (the pure Stage 6C readiness helper,
 * summarized to its stable status/blockedCode/messages/sourceBundle/expectedSource
 * fields only - never a payload body). Detail validates the persisted payload with
 * the Stage 6C contract and returns a sanitized whitelist of the design-model
 * contract fields only. It writes nothing, creates no artifact or approval, runs no
 * AI, prices nothing, resolves no SKU/catalog, makes no configuration/design
 * decision, renders no diagram/document, and never surfaces tenant ids, file
 * paths, storage paths, raw document text, or upstream payload bodies. Imports
 * exactly: project + artifact stores, the Stage 6C contract, the pure Stage 6C
 * readiness helper, and canonical project types - nothing else.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifacts,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import {
  validateRfpHldDesignModelPayload,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  getRfpHldDesignModelReadinessReport,
  type RfpHldDesignModelBlockedCode,
  type RfpHldDesignModelExpectedSource,
  type RfpHldDesignModelSourceBundleSummary,
} from "@/lib/projects/project-rfp-hld-design-model-readiness";
import type { Project, ProjectArtifact } from "@/types/project";

const DESIGN_MODEL_TYPE: ProjectArtifact["type"] = "hld_design_model";
const DESIGN_MODEL_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";

// ---- project + artifact summaries ------------------------------------------

export interface RfpHldDesignModelInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Lean artifact metadata: no payload body and no source arrays. */
export interface RfpHldDesignModelInspectionArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ---- list payload summary (counts/provenance only, no body) ----------------

export interface RfpHldDesignModelInspectionPayloadSummary {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  sourceHldSourceBundleArtifactId: string;
  sourceBundleVersion: number;
  sourceArtifactCount: number;
  coveredDomainCount: number;
  excludedDomainCount: number;
  sourceReferenceCount: number;
  designSectionCount: number;
  topologyNodeCount: number;
  topologyLinkCount: number;
  topologyZoneCount: number;
  diagramIntentCount: number;
  validationFindingCount: number;
}

export interface RfpHldDesignModelInspectionListItem
  extends RfpHldDesignModelInspectionArtifactSummary {
  payloadSummary: RfpHldDesignModelInspectionPayloadSummary;
}

// ---- readiness probe (helper summaries only, never a payload body) ----------

export type RfpHldDesignModelInspectionReadiness =
  | {
      status: "ready";
      sourceBundle: RfpHldDesignModelSourceBundleSummary;
      expectedSource: RfpHldDesignModelExpectedSource;
    }
  | {
      status: "blocked";
      blockedCode?: RfpHldDesignModelBlockedCode;
      messages: string[];
    };

// ---- detail (sanitized whitelist of the contract fields only) --------------

export type RfpHldDesignModelInspectionDetail = RfpHldDesignModelPayload;

// ---- list result -----------------------------------------------------------

export interface LoadRfpHldDesignModelListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldDesignModelListResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignModelInspectionProjectSummary }
  | {
      status: "ok";
      project: RfpHldDesignModelInspectionProjectSummary;
      artifacts: RfpHldDesignModelInspectionListItem[];
      artifactCount: number;
      designModelReadiness: RfpHldDesignModelInspectionReadiness;
    };

// ---- detail result ---------------------------------------------------------

export interface LoadRfpHldDesignModelDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldDesignModelDetailResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignModelInspectionProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_design_model";
      artifact: RfpHldDesignModelInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpHldDesignModelInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldDesignModelInspectionProjectSummary;
      artifact: RfpHldDesignModelInspectionArtifactSummary;
      designModel: RfpHldDesignModelInspectionDetail;
    };

// ---- helpers ---------------------------------------------------------------

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function toProjectSummary(
  project: Project
): RfpHldDesignModelInspectionProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldDesignModelInspectionArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

function toListPayloadSummary(
  payload: unknown
): RfpHldDesignModelInspectionPayloadSummary {
  const r = toRecord(payload);
  const topo = toRecord(r.topology);
  return {
    payloadKind: asString(r.payloadKind),
    createdBy: asString(r.createdBy),
    createdAt: asString(r.createdAt),
    sourceHldSourceBundleArtifactId: asString(r.sourceHldSourceBundleArtifactId),
    sourceBundleVersion: asNumber(r.sourceBundleVersion),
    sourceArtifactCount: countArray(r.sourceArtifactIds),
    coveredDomainCount: countArray(r.coveredDomains),
    excludedDomainCount: countArray(r.excludedDomains),
    sourceReferenceCount: countArray(r.sourceReferences),
    designSectionCount: countArray(r.designSections),
    topologyNodeCount: countArray(topo.nodes),
    topologyLinkCount: countArray(topo.links),
    topologyZoneCount: countArray(topo.zones),
    diagramIntentCount: countArray(r.diagramIntents),
    validationFindingCount: countArray(r.validationFindings),
  };
}

function toReadiness(
  projectId: string,
  artifacts: readonly ProjectArtifact[]
): RfpHldDesignModelInspectionReadiness {
  const report = getRfpHldDesignModelReadinessReport({ projectId, artifacts });
  if (
    report.status === "ready" &&
    report.sourceBundle !== undefined &&
    report.expectedSource !== undefined
  ) {
    return {
      status: "ready",
      sourceBundle: {
        artifactId: report.sourceBundle.artifactId,
        version: report.sourceBundle.version,
        status: report.sourceBundle.status,
        sourceArtifactIds: [...report.sourceBundle.sourceArtifactIds],
        coveredDomains: [...report.sourceBundle.coveredDomains],
        excludedDomains: [...report.sourceBundle.excludedDomains],
      },
      expectedSource: {
        sourceHldSourceBundleArtifactId:
          report.expectedSource.sourceHldSourceBundleArtifactId,
        sourceBundleVersion: report.expectedSource.sourceBundleVersion,
        sourceBundlePayloadKind: report.expectedSource.sourceBundlePayloadKind,
        sourceArtifactIds: [...report.expectedSource.sourceArtifactIds],
        coveredDomains: [...report.expectedSource.coveredDomains],
        excludedDomains: [...report.expectedSource.excludedDomains],
      },
    };
  }
  return {
    status: "blocked",
    ...(report.blockedCode !== undefined ? { blockedCode: report.blockedCode } : {}),
    messages: [...report.messages],
  };
}

/**
 * Reconstruct a clean detail by explicitly picking only the whitelisted contract
 * fields, dropping any arbitrary/leakable extra keys. Validation has already
 * proven the contract shape; every nested value here is a structured design
 * reference (ids, labels, domains), never a tenant id, file path, or raw body.
 */
function toModelDetail(
  p: RfpHldDesignModelPayload
): RfpHldDesignModelInspectionDetail {
  return {
    payloadKind: p.payloadKind,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    sourceArtifactIds: [...p.sourceArtifactIds],
    sourceHldSourceBundleArtifactId: p.sourceHldSourceBundleArtifactId,
    sourceBundleVersion: p.sourceBundleVersion,
    sourceBundlePayloadKind: p.sourceBundlePayloadKind,
    coveredDomains: [...p.coveredDomains],
    excludedDomains: [...p.excludedDomains],
    sourceReferences: p.sourceReferences.map((ref) => ({
      id: ref.id,
      kind: ref.kind,
      ...(ref.artifactId !== undefined ? { artifactId: ref.artifactId } : {}),
      ...(ref.domain !== undefined ? { domain: ref.domain } : {}),
      ...(ref.label !== undefined ? { label: ref.label } : {}),
    })),
    assumptionRefs: p.assumptionRefs.map((r) => ({ refId: r.refId })),
    constraintRefs: p.constraintRefs.map((r) => ({ refId: r.refId })),
    designSections: p.designSections.map((s) => ({
      id: s.id,
      domain: s.domain,
      title: s.title,
      sourceRefIds: [...s.sourceRefIds],
      decisions: s.decisions.map((d) => ({
        id: d.id,
        label: d.label,
        sourceRefIds: [...d.sourceRefIds],
      })),
    })),
    topology: {
      nodes: p.topology.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        nodeType: n.nodeType,
        ...(n.domain !== undefined ? { domain: n.domain } : {}),
        sourceRefIds: [...n.sourceRefIds],
      })),
      links: p.topology.links.map((l) => ({
        id: l.id,
        label: l.label,
        fromNodeId: l.fromNodeId,
        toNodeId: l.toNodeId,
        linkType: l.linkType,
        sourceRefIds: [...l.sourceRefIds],
      })),
      zones: p.topology.zones.map((z) => ({
        id: z.id,
        label: z.label,
        ...(z.domain !== undefined ? { domain: z.domain } : {}),
        nodeIds: [...z.nodeIds],
        sourceRefIds: [...z.sourceRefIds],
      })),
    },
    diagramIntents: p.diagramIntents.map((d) => ({
      id: d.id,
      title: d.title,
      intentType: d.intentType,
      sourceRefIds: [...d.sourceRefIds],
    })),
    traceability: {
      requirementRefs: p.traceability.requirementRefs.map((r) => ({ refId: r.refId })),
      complianceRefs: p.traceability.complianceRefs.map((r) => ({ refId: r.refId })),
      configurationRefs: p.traceability.configurationRefs.map((r) => ({ refId: r.refId })),
      sourceBundleRefs: p.traceability.sourceBundleRefs.map((r) => ({ refId: r.refId })),
    },
    validationFindings: p.validationFindings.map((f) => ({
      id: f.id,
      severity: f.severity,
      code: f.code,
      message: f.message,
      sourceRefIds: [...f.sourceRefIds],
    })),
    ...(p.engineerReview !== undefined
      ? {
          engineerReview: {
            status: p.engineerReview.status,
            requiredActions: [...p.engineerReview.requiredActions],
          },
        }
      : {}),
  };
}

// ---- public API ------------------------------------------------------------

/**
 * List `hld_design_model` artifacts (lean, counts-only) for a tenant's RFP
 * project, plus a read-only design-model readiness probe over the pure Stage 6C
 * helper. Reads only; creates no artifact or approval and never surfaces a full
 * payload body.
 */
export async function loadRfpHldDesignModelList(
  input: LoadRfpHldDesignModelListInput
): Promise<LoadRfpHldDesignModelListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const [modelRows, allArtifacts] = await Promise.all([
    listProjectArtifactsByType(tenantId, projectId, DESIGN_MODEL_TYPE),
    listProjectArtifacts(tenantId, projectId),
  ]);

  const artifacts = modelRows
    .filter(
      (row) =>
        row.projectId === projectId &&
        row.type === DESIGN_MODEL_TYPE &&
        row.stageId === DESIGN_MODEL_STAGE
    )
    .map((row) => ({
      ...toArtifactSummary(row),
      payloadSummary: toListPayloadSummary(row.payload),
    }));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
    designModelReadiness: toReadiness(projectId, allArtifacts),
  };
}

/**
 * Read the EXACT `hld_design_model` artifact named by id for engineer
 * inspection. Tenant/project scoped at the store boundary; the payload is gated
 * by the Stage 6C validator and returned as a sanitized whitelist only.
 */
export async function loadRfpHldDesignModelDetail(
  input: LoadRfpHldDesignModelDetailInput
): Promise<LoadRfpHldDesignModelDetailResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }

  const { tenantId, projectId, artifactId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  // Defense in depth on top of the tenant/project-scoped store lookup.
  if (artifact === null || artifact.projectId !== projectId) {
    return { status: "artifact_not_found" };
  }
  if (artifact.type !== DESIGN_MODEL_TYPE || artifact.stageId !== DESIGN_MODEL_STAGE) {
    return {
      status: "artifact_not_hld_design_model",
      artifact: toArtifactSummary(artifact),
    };
  }

  const validation = validateRfpHldDesignModelPayload(artifact.payload);
  if (!validation.valid) {
    return { status: "invalid_payload", artifact: toArtifactSummary(artifact) };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    designModel: toModelDetail(
      artifact.payload as unknown as RfpHldDesignModelPayload
    ),
  };
}
