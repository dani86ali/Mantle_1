/**
 * Read-only GENERATED HLD document CANDIDATE download service (Stage 6I-G-B).
 *
 * This is the manual-edit handoff for a reviewable generated `hld_document`
 * artifact. It is intentionally separate from the approved-final download path:
 * it never selects final authority, approves, closes HLD, exports, creates a TP,
 * mutates artifacts/approvals, calls a provider, reads raw customer files, or makes
 * pricing/SKU/catalog/configuration decisions. The caller supplies only tenant,
 * project, and artifact ids; the service resolves and revalidates that exact
 * artifact before returning the validated draw.io XML bytes.
 *
 * Non-ok outcomes return only lean summaries and stable status codes. They never
 * include the payload body or draw.io XML. The served filename is server-derived
 * (`BOMATIC-HLD-candidate-v<artifactVersion>.drawio`) and never uses a caller or
 * uploaded raw filename.
 */
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { getProjectById } from "@/lib/db/project-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  RFP_HLD_DOCUMENT_SOURCE_MODE_GENERATED,
  type RfpHldDocumentPayload,
} from "@/lib/projects/project-rfp-hld-document";
import {
  evaluateRfpHldDocumentSourceChain,
  type RfpHldDocumentStaleCode,
} from "@/lib/projects/project-rfp-hld-document-source-chain";
import type { Project, ProjectArtifact } from "@/types/project";

const HLD_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";
const HLD_DOCUMENT_TYPE: ProjectArtifact["type"] = "hld_document";
const REVIEWABLE_GENERATED_STATUS: ProjectArtifact["status"] = "needs_review";

export const RFP_HLD_DOCUMENT_CANDIDATE_MIME =
  "application/vnd.jgraph.mxfile" as const;

export interface LoadProjectRfpHldDocumentCandidateDownloadInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export interface RfpHldDocumentCandidateDownloadProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDocumentCandidateDownloadArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDocumentCandidateDownloadPayloadSummary {
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
  sourceHldDiagramOutputArtifactId: string;
  sourceHldDocumentModelArtifactId: string;
  sourceBundleVersion: number;
  sourceModelVersion: number;
  sourceDiagramVersion: number;
  sourceDiagramOutputVersion: number;
  sourceDocumentModelVersion: number;
}

export type LoadProjectRfpHldDocumentCandidateDownloadResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldDocumentCandidateDownloadProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_document";
      project: RfpHldDocumentCandidateDownloadProjectSummary;
      artifact: RfpHldDocumentCandidateDownloadArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      project: RfpHldDocumentCandidateDownloadProjectSummary;
      artifact: RfpHldDocumentCandidateDownloadArtifactSummary;
    }
  | {
      status: "invalid_payload";
      project: RfpHldDocumentCandidateDownloadProjectSummary;
      artifact: RfpHldDocumentCandidateDownloadArtifactSummary;
    }
  | {
      status: "stale_source_chain";
      project: RfpHldDocumentCandidateDownloadProjectSummary;
      artifact: RfpHldDocumentCandidateDownloadArtifactSummary;
      staleCode: RfpHldDocumentStaleCode;
    }
  | {
      status: "not_generated_candidate";
      project: RfpHldDocumentCandidateDownloadProjectSummary;
      artifact: RfpHldDocumentCandidateDownloadArtifactSummary;
    }
  | {
      status: "ok";
      bytes: Uint8Array;
      mimeType: typeof RFP_HLD_DOCUMENT_CANDIDATE_MIME;
      filename: string;
      contentLength: number;
      project: RfpHldDocumentCandidateDownloadProjectSummary;
      artifact: RfpHldDocumentCandidateDownloadArtifactSummary;
      payloadSummary: RfpHldDocumentCandidateDownloadPayloadSummary;
    };

function toIso(value: Date): string {
  return value.toISOString();
}

function toProjectSummary(
  project: Project
): RfpHldDocumentCandidateDownloadProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: toIso(project.createdAt),
    updatedAt: toIso(project.updatedAt),
  };
}

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldDocumentCandidateDownloadArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: toIso(artifact.createdAt),
    updatedAt: toIso(artifact.updatedAt),
  };
}

function toPayloadSummary(
  payload: RfpHldDocumentPayload
): RfpHldDocumentCandidateDownloadPayloadSummary {
  return {
    payloadKind: payload.payloadKind,
    sourceMode: payload.sourceMode,
    title: payload.title,
    uploadedFileName: payload.uploadedFileName,
    drawioXmlLength: payload.drawioXml.length,
    authorityKind: payload.finalAuthority.authorityKind,
    effectiveWhenArtifactStatus: payload.finalAuthority.effectiveWhenArtifactStatus,
    supersedesArtifactIds: [...payload.supersedesArtifactIds],
    sourceHldSourceBundleArtifactId: payload.sourceHldSourceBundleArtifactId,
    sourceHldDesignModelArtifactId: payload.sourceHldDesignModelArtifactId,
    sourceHldDiagramArtifactId: payload.sourceHldDiagramArtifactId,
    sourceHldDiagramOutputArtifactId: payload.sourceHldDiagramOutputArtifactId as string,
    sourceHldDocumentModelArtifactId: payload.sourceHldDocumentModelArtifactId,
    sourceBundleVersion: payload.sourceBundleVersion,
    sourceModelVersion: payload.sourceModelVersion,
    sourceDiagramVersion: payload.sourceDiagramVersion,
    sourceDiagramOutputVersion: payload.sourceDiagramOutputVersion as number,
    sourceDocumentModelVersion: payload.sourceDocumentModelVersion,
  };
}

function buildCandidateFilename(version: number): string {
  const safeVersion =
    Number.isInteger(version) && version >= 1 ? version : 1;
  return `BOMATIC-HLD-candidate-v${safeVersion}.drawio`;
}

/**
 * Load one reviewable generated HLD document candidate for manual editing. The
 * exact artifact is tenant/project scoped and must still be a `needs_review`
 * generated `hld_document` on the HLD stage with a valid source chain.
 */
export async function loadProjectRfpHldDocumentCandidateDownload(
  input: LoadProjectRfpHldDocumentCandidateDownloadInput
): Promise<LoadProjectRfpHldDocumentCandidateDownloadResult> {
  const { tenantId, projectId, artifactId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };

  const projectSummary = toProjectSummary(project);
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: projectSummary };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null || artifact.projectId !== projectId) {
    return { status: "artifact_not_found" };
  }

  const artifactSummary = toArtifactSummary(artifact);
  if (artifact.stageId !== HLD_STAGE || artifact.type !== HLD_DOCUMENT_TYPE) {
    return {
      status: "artifact_not_hld_document",
      project: projectSummary,
      artifact: artifactSummary,
    };
  }

  if (
    artifact.status !== REVIEWABLE_GENERATED_STATUS ||
    !isArtifactReviewable(artifact)
  ) {
    return {
      status: "artifact_not_reviewable",
      project: projectSummary,
      artifact: artifactSummary,
    };
  }

  const sourceChain = await evaluateRfpHldDocumentSourceChain(
    tenantId,
    projectId,
    artifact
  );

  if (sourceChain.kind === "invalid_payload") {
    return {
      status: "invalid_payload",
      project: projectSummary,
      artifact: artifactSummary,
    };
  }
  if (sourceChain.kind === "stale") {
    return {
      status: "stale_source_chain",
      project: projectSummary,
      artifact: artifactSummary,
      staleCode: sourceChain.staleCode,
    };
  }

  const payload = sourceChain.payload;
  if (payload.sourceMode !== RFP_HLD_DOCUMENT_SOURCE_MODE_GENERATED) {
    return {
      status: "not_generated_candidate",
      project: projectSummary,
      artifact: artifactSummary,
    };
  }

  const bytes = new TextEncoder().encode(payload.drawioXml);
  return {
    status: "ok",
    bytes,
    mimeType: RFP_HLD_DOCUMENT_CANDIDATE_MIME,
    filename: buildCandidateFilename(artifact.version),
    contentLength: bytes.byteLength,
    project: projectSummary,
    artifact: artifactSummary,
    payloadSummary: toPayloadSummary(payload),
  };
}
