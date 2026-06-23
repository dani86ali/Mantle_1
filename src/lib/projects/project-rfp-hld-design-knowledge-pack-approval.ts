/**
 * RFP HLD design knowledge-pack review/approval service (Stage 6A.1a).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Records one approve/reject decision against the EXACT `design_knowledge_pack`
 * artifact version named by the caller. It loads the Project and the exact artifact,
 * gates on rfp mode, the design_knowledge_pack type within the hld_design_delta_review
 * stage, and reviewable status, then persists exactly one approval via
 * createProjectApproval (its only mutation; it never creates an artifact version).
 *
 * Because an approved pack becomes design-readiness authority, APPROVAL also
 * re-validates the exact persisted payload against the local domain + section
 * contract before recording. A REJECTION may be recorded even when the payload is
 * malformed (rejecting a bad pack is the point). This service runs no AI and makes
 * no SKU/pricing/catalog/validation/config/design decision: it imports the project
 * store, the artifact store, the approval store, the pure approval helper, the
 * domain-readiness contract, and the local knowledge-pack contract only - no file/
 * evidence store, no fs/path, no route or UI module. Summaries are lean and
 * serializable (ISO dates, copied arrays, no payload, no tenantId).
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import { RFP_HLD_DESIGN_DOMAIN_DEFINITIONS } from "@/lib/projects/project-rfp-hld-domain-readiness";
import {
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_SECTIONS,
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_SOURCE,
  type RfpHldDesignKnowledgePackSectionId,
} from "@/lib/projects/project-rfp-hld-design-knowledge-pack";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

/** The only artifact type / stage this RFP review path may approve or reject. */
const KNOWLEDGE_PACK_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "design_knowledge_pack";
const KNOWLEDGE_PACK_STAGE_ID: ProjectArtifact["stageId"] =
  "hld_design_delta_review";

const SECTION_IDS: readonly RfpHldDesignKnowledgePackSectionId[] =
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_SECTIONS.map((s) => s.sectionId);

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

/** The exact keys a normalized persisted payload may carry. */
const ALLOWED_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  "payloadKind",
  "source",
  "createdBy",
  "createdAt",
  "domain",
  "title",
  ...SECTION_IDS,
  "entryCount",
  "sectionCounts",
]);

/** Input for {@link reviewRfpHldDesignKnowledgePackArtifact}. */
export interface ReviewRfpHldDesignKnowledgePackArtifactInput {
  tenantId: string;
  projectId: string;
  /** The exact artifact version under review; identity is this id only. */
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  /** Defaults to now downstream (via the materializer) when omitted. */
  decidedAt?: Date;
  note?: string;
}

/** Lean serializable project projection returned on wrong_mode; no tenantId. */
export interface RfpHldDesignKnowledgePackReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpHldDesignKnowledgePackReviewArtifactSummary {
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

/** Discriminated result of {@link reviewRfpHldDesignKnowledgePackArtifact}. */
export type ReviewRfpHldDesignKnowledgePackArtifactResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldDesignKnowledgePackReviewProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_design_knowledge_pack";
      artifact: RfpHldDesignKnowledgePackReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpHldDesignKnowledgePackReviewArtifactSummary;
    }
  | {
      status: "invalid_design_knowledge_pack_payload";
      artifact: RfpHldDesignKnowledgePackReviewArtifactSummary;
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      /** Pre-approval summary of the exact reviewed artifact version. */
      artifact: RfpHldDesignKnowledgePackReviewArtifactSummary;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonblankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** A list section is valid when it is an array of nonblank strings (may be empty). */
function isValidSection(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => isNonblankString(entry));
}

function toProjectSummary(
  project: Project
): RfpHldDesignKnowledgePackReviewProjectSummary {
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
): RfpHldDesignKnowledgePackReviewArtifactSummary {
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

/**
 * Re-validate the EXACT persisted payload against the local domain + section
 * contract: the normalized shape the creation contract emits is the only
 * acceptable input for an approval. Returns false (deterministic, content never
 * leaked) on any deviation - tampered domain/source/kind, malformed section,
 * miscount, or unexpected keys. This is the design-authority gate, not a type check.
 */
function isPersistedKnowledgePackPayloadValid(payload: unknown): boolean {
  if (!isPlainRecord(payload)) return false;
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) return false;
  }
  if (payload.payloadKind !== RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND) {
    return false;
  }
  if (payload.source !== RFP_HLD_DESIGN_KNOWLEDGE_PACK_SOURCE) return false;
  if (typeof payload.domain !== "string" || !KNOWN_DOMAINS.has(payload.domain)) {
    return false;
  }
  if (!isNonblankString(payload.title)) return false;
  if (!isNonblankString(payload.createdBy)) return false;
  if (!isNonblankString(payload.createdAt)) return false;

  const sectionCounts = payload.sectionCounts;
  if (!isPlainRecord(sectionCounts)) return false;
  if (Object.keys(sectionCounts).length !== SECTION_IDS.length) return false;

  let entryCount = 0;
  for (const sectionId of SECTION_IDS) {
    const section = payload[sectionId];
    if (!isValidSection(section)) return false;
    if (sectionCounts[sectionId] !== section.length) return false;
    entryCount += section.length;
  }
  if (entryCount === 0) return false;
  if (payload.entryCount !== entryCount) return false;

  return true;
}

/**
 * Review (approve/reject) one EXACT design_knowledge_pack artifact version, tenant
 * scoped on every store call. Validates nonblank artifactId then decidedBy before
 * any store call. Gates in order: project existence, rfp mode, exact artifact
 * existence, design_knowledge_pack type in the hld_design_delta_review stage,
 * reviewable status. An APPROVAL additionally re-validates the exact persisted
 * payload (blocking with invalid_design_knowledge_pack_payload, content never
 * leaked); a REJECTION skips that gate so a malformed pack can still be rejected.
 * On a passing path it persists exactly one approval (the only mutation) and
 * returns the approval, the post-decision artifact/stage statuses, and the
 * pre-approval artifact summary. Unexpected errors bubble; only a null
 * createProjectApproval maps to approval_failed.
 */
export async function reviewRfpHldDesignKnowledgePackArtifact(
  input: ReviewRfpHldDesignKnowledgePackArtifactInput
): Promise<ReviewRfpHldDesignKnowledgePackArtifactResult> {
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }
  if (!input.decidedBy || input.decidedBy.trim() === "") {
    throw new Error("decidedBy is required.");
  }

  const { tenantId, projectId, artifactId, decision, decidedBy } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== KNOWLEDGE_PACK_ARTIFACT_TYPE ||
    artifact.stageId !== KNOWLEDGE_PACK_STAGE_ID
  ) {
    return {
      status: "artifact_not_design_knowledge_pack",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

  // Approving promotes the pack to design-readiness authority, so the exact
  // persisted payload must re-validate. Rejection needs no such gate.
  if (
    decision === "approved" &&
    !isPersistedKnowledgePackPayloadValid(artifact.payload)
  ) {
    return {
      status: "invalid_design_knowledge_pack_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  // Captured before the approval transitions statuses.
  const artifactSummary = toArtifactSummary(artifact);

  const created = await createProjectApproval({
    tenantId,
    projectId,
    artifactId: artifact.id,
    decision,
    decidedBy,
    ...(input.decidedAt !== undefined ? { decidedAt: input.decidedAt } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  });
  if (created === null) return { status: "approval_failed" };

  return {
    status: "ok",
    approval: created.approval,
    artifactStatus: created.artifactStatus,
    stageStatus: created.stageStatus,
    artifact: artifactSummary,
  };
}
