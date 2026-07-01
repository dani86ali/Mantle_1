/**
 * Neutral source-chain evaluator for final RFP HLD documents (Stage 6H-0I-B).
 *
 * Re-validates one persisted final `hld_document` upload against the Stage 6H-0I-A
 * payload contract, then re-ties it through the approved source bundle, approved
 * HLD design model, active HLD design review, approved diagram, and approved
 * document model. This module is read-only: it mutates nothing, imports no
 * approval store, routes, AI/provider, catalog, pricing, configuration, or raw-file
 * modules, and never exposes payload bodies or draw.io XML in invalid/stale arms.
 */
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import {
  validateRfpHldDocumentPayload,
  type RfpHldDocumentPayload,
} from "@/lib/projects/project-rfp-hld-document";
import {
  validateRfpHldDocumentModelPayload,
  type RfpHldDocumentModelPayload,
} from "@/lib/projects/project-rfp-hld-document-model";
import { validateRfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  validateRfpHldDesignModelPayload,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  validateRfpHldDiagramDraftPayload,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";
import type {
  ProjectArtifact,
  ProjectArtifactStatus,
} from "@/types/project";

const HLD_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";
const SOURCE_BUNDLE_TYPE: ProjectArtifact["type"] = "hld_source_bundle";
const MODEL_TYPE: ProjectArtifact["type"] = "hld_design_model";
const REVIEW_TYPE: ProjectArtifact["type"] = "hld_design_model_review";
const DIAGRAM_TYPE: ProjectArtifact["type"] = "hld_diagram";
const DOCUMENT_MODEL_TYPE: ProjectArtifact["type"] = "hld_document_model";
const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

/** Stable sub-reason for a stale source-chain approval block (never leaks payload). */
export type RfpHldDocumentStaleCode =
  | "source_artifact_ids_mismatch"
  | "source_document_model_unavailable"
  | "source_document_model_invalid"
  | "source_bundle_unavailable"
  | "source_bundle_invalid"
  | "source_model_unavailable"
  | "source_model_invalid"
  | "source_diagram_unavailable"
  | "source_diagram_invalid"
  | "source_review_unavailable"
  | "source_chain_mismatch"
  | "source_version_mismatch";

/**
 * Neutral outcome of the shared final-`hld_document` source-chain evaluator. It is
 * caller-agnostic: `valid` carries the re-validated payload for downstream use,
 * `invalid_payload` marks a payload that fails the Stage 6H-0I-A contract, and
 * `stale` carries a stable code when the approved source chain no longer resolves.
 */
export type RfpHldDocumentSourceChainOutcome =
  | { kind: "valid"; payload: RfpHldDocumentPayload }
  | { kind: "invalid_payload" }
  | { kind: "stale"; staleCode: RfpHldDocumentStaleCode };

function sameOrdered(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isApprovedTypeOnStage(
  artifact: ProjectArtifact | null,
  projectId: string,
  type: ProjectArtifact["type"]
): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === type &&
    artifact.stageId === HLD_STAGE &&
    artifact.status === "approved"
  );
}

function isActiveReviewOnStage(
  artifact: ProjectArtifact | null,
  projectId: string
): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === REVIEW_TYPE &&
    artifact.stageId === HLD_STAGE &&
    ACTIVE_REVIEW_STATUSES.has(artifact.status)
  );
}

/**
 * Shared, caller-agnostic source-chain evaluator for a persisted final
 * `hld_document` upload. Reads the artifact store but mutates nothing, and never
 * leaks any payload body or drawio XML. Approval and final-authority services wrap
 * this so their fail-closed source-chain semantics stay identical.
 */
export async function evaluateRfpHldDocumentSourceChain(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<RfpHldDocumentSourceChainOutcome> {
  if (!validateRfpHldDocumentPayload(artifact.payload).valid) {
    return { kind: "invalid_payload" };
  }

  const payload = artifact.payload as unknown as RfpHldDocumentPayload;
  const bundleId = payload.sourceHldSourceBundleArtifactId;
  const modelId = payload.sourceHldDesignModelArtifactId;
  const diagramId = payload.sourceHldDiagramArtifactId;
  const documentModelId = payload.sourceHldDocumentModelArtifactId;
  const expectedSourceIds = [bundleId, modelId, diagramId, documentModelId];

  if (
    !sameOrdered(artifact.sourceArtifactIds, expectedSourceIds) ||
    !sameOrdered(payload.sourceArtifactIds, expectedSourceIds)
  ) {
    return { kind: "stale", staleCode: "source_artifact_ids_mismatch" };
  }

  const bundle = await getProjectArtifactById(tenantId, projectId, bundleId);
  if (!isApprovedTypeOnStage(bundle, projectId, SOURCE_BUNDLE_TYPE)) {
    return { kind: "stale", staleCode: "source_bundle_unavailable" };
  }
  if ((bundle as ProjectArtifact).version !== payload.sourceBundleVersion) {
    return { kind: "stale", staleCode: "source_version_mismatch" };
  }
  if (!validateRfpHldSourceBundlePayload((bundle as ProjectArtifact).payload).valid) {
    return { kind: "stale", staleCode: "source_bundle_invalid" };
  }

  const model = await getProjectArtifactById(tenantId, projectId, modelId);
  if (!isApprovedTypeOnStage(model, projectId, MODEL_TYPE)) {
    return { kind: "stale", staleCode: "source_model_unavailable" };
  }
  const modelArtifact = model as ProjectArtifact;
  if (modelArtifact.version !== payload.sourceModelVersion) {
    return { kind: "stale", staleCode: "source_version_mismatch" };
  }
  if (!sameOrdered(modelArtifact.sourceArtifactIds, [bundleId])) {
    return { kind: "stale", staleCode: "source_chain_mismatch" };
  }
  if (!validateRfpHldDesignModelPayload(modelArtifact.payload).valid) {
    return { kind: "stale", staleCode: "source_model_invalid" };
  }
  const modelPayload = modelArtifact.payload as unknown as RfpHldDesignModelPayload;
  if (
    modelPayload.sourceHldSourceBundleArtifactId !== bundleId ||
    !sameOrdered(modelPayload.sourceArtifactIds, [bundleId])
  ) {
    return { kind: "stale", staleCode: "source_chain_mismatch" };
  }

  const diagram = await getProjectArtifactById(tenantId, projectId, diagramId);
  if (!isApprovedTypeOnStage(diagram, projectId, DIAGRAM_TYPE)) {
    return { kind: "stale", staleCode: "source_diagram_unavailable" };
  }
  const diagramArtifact = diagram as ProjectArtifact;
  if (diagramArtifact.version !== payload.sourceDiagramVersion) {
    return { kind: "stale", staleCode: "source_version_mismatch" };
  }
  if (!validateRfpHldDiagramDraftPayload(diagramArtifact.payload).valid) {
    return { kind: "stale", staleCode: "source_diagram_invalid" };
  }
  const diagramPayload = diagramArtifact.payload as unknown as RfpHldDiagramDraftPayload;
  const reviewId = diagramPayload.sourceReviewArtifactId;
  if (!sameOrdered(diagramArtifact.sourceArtifactIds, [modelId, bundleId, reviewId])) {
    return { kind: "stale", staleCode: "source_chain_mismatch" };
  }
  if (
    diagramPayload.sourceHldDesignModelArtifactId !== modelId ||
    diagramPayload.sourceHldSourceBundleArtifactId !== bundleId
  ) {
    return { kind: "stale", staleCode: "source_chain_mismatch" };
  }
  if (diagramPayload.sourceModelVersion !== modelArtifact.version) {
    return { kind: "stale", staleCode: "source_version_mismatch" };
  }

  const review = await getProjectArtifactById(tenantId, projectId, reviewId);
  if (!isActiveReviewOnStage(review, projectId)) {
    return { kind: "stale", staleCode: "source_review_unavailable" };
  }
  if (!sameOrdered((review as ProjectArtifact).sourceArtifactIds, [modelId, bundleId])) {
    return { kind: "stale", staleCode: "source_chain_mismatch" };
  }

  const documentModel = await getProjectArtifactById(tenantId, projectId, documentModelId);
  if (!isApprovedTypeOnStage(documentModel, projectId, DOCUMENT_MODEL_TYPE)) {
    return { kind: "stale", staleCode: "source_document_model_unavailable" };
  }
  const documentModelArtifact = documentModel as ProjectArtifact;
  if (documentModelArtifact.version !== payload.sourceDocumentModelVersion) {
    return { kind: "stale", staleCode: "source_version_mismatch" };
  }
  if (!validateRfpHldDocumentModelPayload(documentModelArtifact.payload).valid) {
    return { kind: "stale", staleCode: "source_document_model_invalid" };
  }
  const documentModelPayload =
    documentModelArtifact.payload as unknown as RfpHldDocumentModelPayload;
  const docModelSources = [bundleId, modelId, diagramId];
  if (
    !sameOrdered(documentModelArtifact.sourceArtifactIds, docModelSources) ||
    !sameOrdered(documentModelPayload.sourceArtifactIds, docModelSources) ||
    documentModelPayload.sourceHldSourceBundleArtifactId !== bundleId ||
    documentModelPayload.sourceHldDesignModelArtifactId !== modelId ||
    documentModelPayload.sourceHldDiagramArtifactId !== diagramId ||
    documentModelPayload.sourceModelVersion !== modelArtifact.version ||
    documentModelPayload.sourceDiagramVersion !== diagramArtifact.version
  ) {
    return { kind: "stale", staleCode: "source_chain_mismatch" };
  }

  return { kind: "valid", payload };
}
