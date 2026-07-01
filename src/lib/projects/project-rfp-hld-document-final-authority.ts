/**
 * Tenant-scoped deterministic FINAL HLD document authority selector (Stage 6H-0I-B).
 *
 * Read-only lane that makes an approved SE MANUAL draw.io `hld_document` upload
 * discoverable as the active FINAL HLD authority. A manual upload becomes
 * runtime/customer HLD authority ONLY once its `hld_document` artifact is human
 * approved (Stage 6H-0I-A); this service selects the newest such approved upload and
 * re-proves it, without generating, exporting, downloading, or closing HLD.
 *
 * Considers only `hld_document` artifacts on the `hld_design_delta_review` stage with
 * status `approved`. It selects the newest deterministically (highest artifact
 * version, then latest createdAt) and re-validates it through the shared source-chain
 * evaluator so the persisted payload still holds and the approved
 * bundle/model/diagram/document-model chain still resolves. It NEVER falls back to
 * `hld_document_model`, `hld_diagram`, AI output, or raw source files: only an
 * approved final `hld_document` can be authority.
 *
 * When no approved final document exists it returns a fail-closed `not_finalized`
 * result, distinguishing a manual upload still pending review from no final HLD
 * document at all. When the newest approved document fails payload/source-chain
 * re-validation it returns a fail-closed `stale_final_authority` result - it does not
 * throw for ordinary invalid/stale state. Public summaries are lean and never carry
 * the drawio XML; only the internal `ok` result carries the full validated payload
 * (drawio XML included) for later export/close services.
 *
 * This service reads only Project state through the project/artifact stores. It reads
 * NO raw RFP/PDF/DOCX/XLSX file or storage path, constructs NO provider/AI adapter,
 * makes NO pricing/SKU/catalog/configuration decision, and mutates nothing.
 */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectArtifactsByType } from "@/lib/db/project-artifact-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  evaluateRfpHldDocumentSourceChain,
  type RfpHldDocumentStaleCode,
} from "@/lib/projects/project-rfp-hld-document-source-chain";
import type { RfpHldDocumentPayload } from "@/lib/projects/project-rfp-hld-document";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const DOCUMENT_TYPE: ProjectArtifactType = "hld_document";
const HLD_STAGE: ProjectStageId = "hld_design_delta_review";

/** The only recognised final-authority state: an approved SE manual draw.io upload. */
export const RFP_HLD_FINAL_AUTHORITY_STATUS = "approved_manual_drawio_upload" as const;

// ---------------------------------------------------------------------------
// Result + summary shapes (lean, serializable, never carry a payload body / tenant)
// ---------------------------------------------------------------------------

export interface RfpHldFinalAuthorityProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldFinalAuthorityArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifact["status"];
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lean payload summary. It NEVER carries the draw.io XML body. */
export interface RfpHldFinalAuthorityPayloadSummary {
  payloadKind: RfpHldDocumentPayload["payloadKind"];
  sourceMode: RfpHldDocumentPayload["sourceMode"];
  title: string;
  uploadedFileName: string;
  drawioXmlLength: number;
  authorityKind: RfpHldDocumentPayload["finalAuthority"]["authorityKind"];
  effectiveWhenArtifactStatus: RfpHldDocumentPayload["finalAuthority"]["effectiveWhenArtifactStatus"];
  supersedesArtifactIds: string[];
  sourceHldSourceBundleArtifactId: string;
  sourceHldDesignModelArtifactId: string;
  sourceHldDiagramArtifactId: string;
  sourceHldDocumentModelArtifactId: string;
  sourceBundleVersion: number;
  sourceModelVersion: number;
  sourceDiagramVersion: number;
  sourceDocumentModelVersion: number;
}

/** Stable blocker when no approved final HLD document is available yet. */
export type RfpHldFinalAuthorityNotFinalizedCode =
  | "no_final_hld_document"
  | "manual_upload_pending_review";

/** Stable blocker when an approved final document fails re-validation. */
export type RfpHldFinalAuthorityStaleCode =
  | "invalid_hld_document_payload"
  | RfpHldDocumentStaleCode;

export interface SelectRfpHldFinalAuthorityInput {
  tenantId: string;
  projectId: string;
}

export type SelectRfpHldFinalAuthorityResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldFinalAuthorityProjectSummary }
  | {
      status: "not_finalized";
      project: RfpHldFinalAuthorityProjectSummary;
      blockerCode: RfpHldFinalAuthorityNotFinalizedCode;
      latestArtifact?: RfpHldFinalAuthorityArtifactSummary;
    }
  | {
      status: "stale_final_authority";
      project: RfpHldFinalAuthorityProjectSummary;
      blockerCode: RfpHldFinalAuthorityStaleCode;
      artifact: RfpHldFinalAuthorityArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldFinalAuthorityProjectSummary;
      authority: {
        artifact: RfpHldFinalAuthorityArtifactSummary;
        payloadSummary: RfpHldFinalAuthorityPayloadSummary;
        finalAuthorityStatus: typeof RFP_HLD_FINAL_AUTHORITY_STATUS;
      };
      /** Full validated payload (drawio XML included) - internal, never routed. */
      payload: RfpHldDocumentPayload;
    };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function toProjectSummary(project: Project): RfpHldFinalAuthorityProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldFinalAuthorityArtifactSummary {
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

function toPayloadSummary(
  p: RfpHldDocumentPayload
): RfpHldFinalAuthorityPayloadSummary {
  return {
    payloadKind: p.payloadKind,
    sourceMode: p.sourceMode,
    title: p.title,
    uploadedFileName: p.uploadedFileName,
    drawioXmlLength: p.drawioXml.length,
    authorityKind: p.finalAuthority.authorityKind,
    effectiveWhenArtifactStatus: p.finalAuthority.effectiveWhenArtifactStatus,
    supersedesArtifactIds: p.supersedesArtifactIds.slice(),
    sourceHldSourceBundleArtifactId: p.sourceHldSourceBundleArtifactId,
    sourceHldDesignModelArtifactId: p.sourceHldDesignModelArtifactId,
    sourceHldDiagramArtifactId: p.sourceHldDiagramArtifactId,
    sourceHldDocumentModelArtifactId: p.sourceHldDocumentModelArtifactId,
    sourceBundleVersion: p.sourceBundleVersion,
    sourceModelVersion: p.sourceModelVersion,
    sourceDiagramVersion: p.sourceDiagramVersion,
    sourceDocumentModelVersion: p.sourceDocumentModelVersion,
  };
}

/** Newest by highest version, then latest createdAt. Never called on []. */
function selectNewest(artifacts: ProjectArtifact[]): ProjectArtifact {
  return artifacts.reduce((best, cur) => {
    if (cur.version !== best.version) return cur.version > best.version ? cur : best;
    return cur.createdAt.getTime() > best.createdAt.getTime() ? cur : best;
  });
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Select the active FINAL HLD authority for an RFP project, tenant scoped. Gates
 * project existence and rfp mode, then reads only `hld_document` artifacts. With no
 * approved final document it returns not_finalized (distinguishing a pending
 * reviewable manual upload from none at all); with the newest approved document it
 * re-proves the persisted payload + source chain, returning ok (carrying the full
 * validated payload internally) or a fail-closed stale_final_authority. It never
 * throws for ordinary invalid/stale state and never falls back off the approved
 * `hld_document` lane.
 */
export async function selectRfpHldFinalAuthority(
  input: SelectRfpHldFinalAuthorityInput
): Promise<SelectRfpHldFinalAuthorityResult> {
  const { tenantId, projectId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const documents = await listProjectArtifactsByType(tenantId, projectId, DOCUMENT_TYPE);
  const onStage = documents.filter(
    (a) => a.projectId === projectId && a.stageId === HLD_STAGE
  );
  const approved = onStage.filter((a) => a.status === "approved");

  if (approved.length === 0) {
    const pending = onStage.filter((a) => isArtifactReviewable(a));
    if (pending.length > 0) {
      return {
        status: "not_finalized",
        project: toProjectSummary(project),
        blockerCode: "manual_upload_pending_review",
        latestArtifact: toArtifactSummary(selectNewest(pending)),
      };
    }
    return {
      status: "not_finalized",
      project: toProjectSummary(project),
      blockerCode: "no_final_hld_document",
    };
  }

  const selected = selectNewest(approved);
  const outcome = await evaluateRfpHldDocumentSourceChain(tenantId, projectId, selected);
  if (outcome.kind === "invalid_payload") {
    return {
      status: "stale_final_authority",
      project: toProjectSummary(project),
      blockerCode: "invalid_hld_document_payload",
      artifact: toArtifactSummary(selected),
    };
  }
  if (outcome.kind === "stale") {
    return {
      status: "stale_final_authority",
      project: toProjectSummary(project),
      blockerCode: outcome.staleCode,
      artifact: toArtifactSummary(selected),
    };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    authority: {
      artifact: toArtifactSummary(selected),
      payloadSummary: toPayloadSummary(outcome.payload),
      finalAuthorityStatus: RFP_HLD_FINAL_AUTHORITY_STATUS,
    },
    payload: outcome.payload,
  };
}
