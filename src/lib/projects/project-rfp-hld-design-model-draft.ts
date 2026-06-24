/**
 * Tenant-scoped RFP HLD design-model draft SERVICE (Stage 6D-004).
 *
 * Produces exactly ONE reviewable (status `needs_review`) `hld_design_model`
 * artifact on the existing `hld_design_delta_review` stage, and only after a
 * chain of deterministic gates passes. The flow is fail-closed: verify the
 * project within its tenant, locate the latest approved `hld_source_bundle`
 * with the Stage 6C readiness helper, assemble the Stage 6D-002 deterministic
 * candidate input from that exact approved bundle, hand it to the Stage 6D-003
 * injected drafting executor boundary, then HARD-GATE whatever the executor
 * returns with the Stage 6C fail-closed model/source-compatibility validator
 * BEFORE any persistence. The executor output is candidate-only and untrusted;
 * it is never persisted unless it validates against the deterministic contract.
 *
 * This module reads only Project state through the Project stores (project +
 * artifact stores). It reads NO raw RFP/PDF/DOCX/XLSX file, storage path,
 * evidence store, file store, parser, or legacy runtime code; constructs NO
 * provider adapter and imports NO provider SDK; and makes NO pricing, SKU,
 * catalog, configuration, topology, scope, or design-approval authority
 * decision. It adds no route, UI, review/approval service, or final-output
 * (document/HTML/draw.io/diagram/proposal) generation. Pricing authority and
 * configuration authority stay with their own approved upstream artifacts.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import {
  getRfpHldDesignModelReadinessReport,
  validateRfpHldDesignModelSourceCompatibility,
  type RfpHldDesignModelBlockedCode,
  type RfpHldDesignModelSourceBundleSummary,
} from "@/lib/projects/project-rfp-hld-design-model-readiness";
import {
  buildRfpHldDesignModelCandidateInput,
  type RfpHldDesignModelCandidateInputBlockedReason,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import {
  draftRfpHldDesignModelCandidate,
  getConfiguredRfpHldDesignModelDraftingExecutor,
  type RfpHldDesignModelDraftingExecutor,
} from "@/lib/projects/project-rfp-hld-design-model-drafting-executor";
import {
  RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

const HLD_STAGE: ProjectStageId = "hld_design_delta_review";
const DESIGN_MODEL_TYPE: ProjectArtifactType = "hld_design_model";

/** Lean wrong-mode project projection; tenantId is never surfaced. */
export interface RfpHldDesignModelDraftProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable created-artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpHldDesignModelDraftArtifactSummary {
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

/** Lean draft-payload summary: provenance and counts only, never raw bodies. */
export interface RfpHldDesignModelDraftPayloadSummary {
  payloadKind: typeof RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND;
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

/** Input for {@link createRfpHldDesignModelDraft}. */
export interface CreateRfpHldDesignModelDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** Optional fixed timestamp for deterministic tests; defaults to now. */
  createdAt?: Date;
  /**
   * The injected Stage 6D-003 executor. When the property is absent the
   * configured factory is used; it currently returns null, so the service fails
   * safely as `drafting_unavailable` and writes nothing. An explicit null is the
   * same unavailable seam.
   */
  executor?: RfpHldDesignModelDraftingExecutor | null;
}

/** Discriminated result of {@link createRfpHldDesignModelDraft}. */
export type CreateRfpHldDesignModelDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignModelDraftProjectSummary }
  | { status: "blocked"; code: RfpHldDesignModelBlockedCode; messages: string[] }
  | { status: "invalid_source_bundle_payload"; errors: string[] }
  | {
      status: "candidate_input_blocked";
      reason: RfpHldDesignModelCandidateInputBlockedReason;
    }
  | { status: "drafting_unavailable" }
  | { status: "drafting_failed"; error: "hld_design_model_drafting_failed" }
  | { status: "invalid_draft_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDesignModelDraftArtifactSummary;
      sourceBundle: RfpHldDesignModelSourceBundleSummary;
      payloadSummary: RfpHldDesignModelDraftPayloadSummary;
    };

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toProjectSummary(project: Project): RfpHldDesignModelDraftProjectSummary {
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
): RfpHldDesignModelDraftArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/** Lean counts/provenance projection over an already-validated draft payload. */
function toPayloadSummary(
  payload: RfpHldDesignModelPayload
): RfpHldDesignModelDraftPayloadSummary {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: payload.createdBy,
    createdAt: payload.createdAt,
    sourceHldSourceBundleArtifactId: payload.sourceHldSourceBundleArtifactId,
    sourceBundleVersion: payload.sourceBundleVersion,
    sourceArtifactCount: payload.sourceArtifactIds.length,
    coveredDomainCount: payload.coveredDomains.length,
    excludedDomainCount: payload.excludedDomains.length,
    sourceReferenceCount: payload.sourceReferences.length,
    designSectionCount: payload.designSections.length,
    topologyNodeCount: payload.topology.nodes.length,
    topologyLinkCount: payload.topology.links.length,
    topologyZoneCount: payload.topology.zones.length,
    diagramIntentCount: payload.diagramIntents.length,
    validationFindingCount: payload.validationFindings.length,
  };
}

/**
 * Create exactly ONE `needs_review` `hld_design_model` on `hld_design_delta_review`,
 * tenant-scoped, only after every deterministic gate passes. Throws on blank
 * programmer inputs before any store call. Verifies the project within its tenant
 * (not_found / wrong_mode, lean summary that never leaks tenantId); locates the
 * latest approved source bundle via the Stage 6C readiness helper (blocked on its
 * stable code/messages); builds the Stage 6D-002 candidate input from that exact
 * approved bundle; invokes the Stage 6D-003 executor boundary (drafting_unavailable
 * when none is configured, drafting_failed without exposing a thrown detail); and
 * HARD-GATES the untrusted executor payload with the Stage 6C fail-closed validator
 * (invalid_draft_payload with deterministic errors) BEFORE persisting. On success
 * exactly one artifact is written with empty sourceFileIds and sourceArtifactIds
 * equal to [the approved source-bundle id]; only lean summaries are returned. Reads
 * no raw documents/files/evidence; makes no pricing/SKU/catalog/config/design
 * authority decision; persists only on a valid draft.
 */
export async function createRfpHldDesignModelDraft(
  input: CreateRfpHldDesignModelDraftInput
): Promise<CreateRfpHldDesignModelDraftResult> {
  const projectId = asTrimmed(input.projectId);
  const createdBy = asTrimmed(input.createdBy);
  if (projectId === "") throw new Error("HLD design-model draft requires a projectId.");
  if (createdBy === "") throw new Error("HLD design-model draft requires a createdBy.");

  const project = await getProjectById(input.tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifacts = await listProjectArtifacts(input.tenantId, projectId);

  // Locate the latest approved hld_source_bundle; fail closed on the readiness code.
  const readiness = getRfpHldDesignModelReadinessReport({ projectId, artifacts });
  if (readiness.status !== "ready" || readiness.sourceBundle === undefined) {
    return {
      status: "blocked",
      code: readiness.blockedCode ?? "missing_source_bundle",
      messages: [...readiness.messages],
    };
  }

  // Resolve the exact approved source-bundle artifact readiness identified.
  const sourceBundleArtifactId = readiness.sourceBundle.artifactId;
  const sourceBundleArtifact = artifacts.find((a) => a.id === sourceBundleArtifactId);
  if (sourceBundleArtifact === undefined) {
    return {
      status: "blocked",
      code: "missing_source_bundle",
      messages: ["The approved hld_source_bundle could not be resolved."],
    };
  }

  // Stage 6D-002 deterministic candidate input from that one approved bundle.
  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const candidate = buildRfpHldDesignModelCandidateInput({
    projectId,
    artifact: sourceBundleArtifact,
    createdBy,
    createdAt,
  });
  if (candidate.status === "invalid_source_bundle_payload") {
    return { status: "invalid_source_bundle_payload", errors: [...candidate.errors] };
  }
  if (candidate.status === "blocked") {
    return { status: "candidate_input_blocked", reason: candidate.reason };
  }

  // Stage 6D-003 injected executor boundary; absent factory => unavailable.
  const executor =
    input.executor !== undefined
      ? input.executor
      : getConfiguredRfpHldDesignModelDraftingExecutor();
  let drafting;
  try {
    drafting = await draftRfpHldDesignModelCandidate({
      candidateInput: candidate.bundle,
      executor,
    });
  } catch {
    // The thrown detail (provider error, prompt, stack) is never surfaced.
    return { status: "drafting_failed", error: "hld_design_model_drafting_failed" };
  }
  if (drafting.status === "unavailable") {
    return { status: "drafting_unavailable" };
  }

  // HARD GATE: the untrusted candidate payload must validate against the
  // deterministic model/source-compatibility contract before any persistence.
  const compatibility = validateRfpHldDesignModelSourceCompatibility({
    payload: drafting.draft.payload,
    sourceBundleArtifact,
  });
  if (!compatibility.valid) {
    return { status: "invalid_draft_payload", errors: [...compatibility.errors] };
  }

  // Validated: safe to persist exactly one reviewable artifact.
  const validatedPayload = drafting.draft.payload as RfpHldDesignModelPayload;
  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId: input.tenantId,
    stageId: HLD_STAGE,
    type: DESIGN_MODEL_TYPE,
    status: "needs_review",
    payload: drafting.draft.payload as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [sourceBundleArtifactId],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    sourceBundle: {
      ...readiness.sourceBundle,
      sourceArtifactIds: [...readiness.sourceBundle.sourceArtifactIds],
      coveredDomains: [...readiness.sourceBundle.coveredDomains],
      excludedDomains: [...readiness.sourceBundle.excludedDomains],
    },
    payloadSummary: toPayloadSummary(validatedPayload),
  };
}
