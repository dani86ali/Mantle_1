/**
 * RFP HLD intake-questionnaire CREATION service (Stage 6H-0D operational path).
 * Source of truth: the MVP canonical project state and active HLD agentic
 * authority-chain roadmap (Stage 6 HLD readiness).
 *
 * The operational path that turns the already-approved upstream RFP source chain
 * into ONE reviewable, candidate-only `hld_intake_questionnaire` artifact. It
 * fail-closes before any drafting unless every required approved input resolves and
 * proves its source chain: the project is rfp mode; a latest approved
 * evidence_package, requirements_baseline, and compliance_matrix exist; the
 * requirements baseline and the compliance matrix cite the approved evidence/
 * requirements/configuration chain; the RFP BoQ/configuration
 * readiness gate is satisfied and its authorized configuration source is the one the
 * compliance matrix used; HLD domain readiness has no missing design knowledge
 * packs; and every approved design knowledge pack compacts cleanly. Only then does
 * it build a transient, whitelisted drafting input (approved source refs, bounded
 * approved source-artifact CONTEXT, and approved design-knowledge content - never
 * raw file bytes, storage paths, tenant ids, provider data, pricing, priced BoQ,
 * SKU, catalog, or configuration decisions) and hand it to the configured OpenAI
 * candidate-drafting executor behind the existing boundary. OpenAI proposes
 * candidate questions ONLY; the boundary wraps and validates them, this service
 * re-validates the constructed payload, and only a passing candidate is persisted as
 * a single needs_review artifact for engineer review/edit. It performs no math,
 * pricing, SKU replacement, catalog lookup, configuration, validation authority, or
 * final design authority at runtime; it reads no raw file content and imports no
 * provider SDK, raw parser, pricing, SKU, catalog, or configuration-authority
 * module.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import { getRfpBoqReadinessReport } from "@/lib/projects/project-rfp-boq-readiness";
import { getRfpHldDomainReadinessReport } from "@/lib/projects/project-rfp-hld-domain-readiness";
import { selectRfpHldApprovedDesignKnowledgeContent } from "@/lib/projects/project-rfp-hld-design-knowledge-content";
import {
  draftRfpHldIntakeQuestionnaireCandidate,
  getConfiguredRfpHldIntakeQuestionnaireDraftingExecutor,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-executor";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_FORBIDDEN,
  type RfpHldIntakeQuestionnaireApprovedSourceContext,
  type RfpHldIntakeQuestionnaireDraftingInput,
  type RfpHldIntakeQuestionnaireDraftingSourceRef,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
  validateRfpHldIntakeQuestionnairePayload,
  type RfpHldIntakeQuestionnairePayload,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire";
import type { Project, ProjectArtifact } from "@/types/project";

const QUESTIONNAIRE_STAGE_ID: ProjectArtifact["stageId"] =
  "hld_design_delta_review";
const QUESTIONNAIRE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "hld_intake_questionnaire";

const EVIDENCE_PACKAGE_PAYLOAD_KIND = "rfp_evidence_package";
const REQUIREMENTS_BASELINE_PAYLOAD_KIND = "rfp_requirements_baseline";
const COMPLIANCE_MATRIX_PAYLOAD_KIND = "rfp_compliance_matrix";

const MAX_EXCERPTS = 5;
const MAX_EXCERPT_LEN = 240;

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpHldIntakeQuestionnaireCreateProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Lean serializable artifact summary; never carries the payload. */
export interface RfpHldIntakeQuestionnaireCreateArtifactSummary {
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

/** Lean provenance/count projection of the persisted candidate questionnaire. */
export interface RfpHldIntakeQuestionnaireCreatePayloadSummary {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  questionCount: number;
  sourceArtifactCount: number;
  sourceRefCount: number;
  validationStatus: string;
  validationFindingCount: number;
  payloadValid: boolean;
}

export interface CreateRfpHldIntakeQuestionnaireDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  createdAt?: Date;
}

export type CreateRfpHldIntakeQuestionnaireDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldIntakeQuestionnaireCreateProjectSummary }
  | { status: "blocked"; code: string; messages: string[] }
  | { status: "drafting_unavailable" }
  | { status: "drafting_failed" }
  | { status: "invalid_candidate_output"; errors: string[] }
  | { status: "invalid_payload"; errors: string[] }
  | {
      status: "ok";
      project: RfpHldIntakeQuestionnaireCreateProjectSummary;
      artifact: RfpHldIntakeQuestionnaireCreateArtifactSummary;
      payloadSummary: RfpHldIntakeQuestionnaireCreatePayloadSummary;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function sanitizeLine(value: unknown): string {
  return asString(value).replace(/\s+/g, " ").trim().slice(0, MAX_EXCERPT_LEN);
}

function toProjectSummary(
  project: Project
): RfpHldIntakeQuestionnaireCreateProjectSummary {
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
): RfpHldIntakeQuestionnaireCreateArtifactSummary {
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

/** Best (highest-version) approved artifact of a type with an expected payloadKind. */
function latestApproved(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  type: ProjectArtifact["type"],
  payloadKind: string
): ProjectArtifact | null {
  let best: ProjectArtifact | null = null;
  for (const artifact of artifacts) {
    if (
      artifact.projectId !== projectId ||
      artifact.type !== type ||
      artifact.status !== "approved" ||
      toRecord(artifact.payload).payloadKind !== payloadKind
    ) {
      continue;
    }
    if (best === null || artifact.version > best.version) best = artifact;
  }
  return best;
}

/** A closed source ref from an approved artifact; payloadKind falls back to the type. */
function toSourceRef(
  refId: string,
  artifact: ProjectArtifact,
  label: string
): RfpHldIntakeQuestionnaireDraftingSourceRef {
  const payloadKind = toRecord(artifact.payload).payloadKind;
  return {
    refId,
    artifactId: artifact.id,
    artifactType: artifact.type,
    stageId: artifact.stageId,
    status: "approved",
    version: artifact.version,
    payloadKind:
      typeof payloadKind === "string" && payloadKind.trim() !== ""
        ? payloadKind
        : artifact.type,
    label,
  };
}

/** A bounded, sanitized approved-artifact context block: counts + capped excerpts. */
function toApprovedSourceContext(
  sourceRefId: string,
  artifact: ProjectArtifact,
  artifactType: RfpHldIntakeQuestionnaireApprovedSourceContext["artifactType"],
  label: string,
  summary: string,
  excerpts: string[]
): RfpHldIntakeQuestionnaireApprovedSourceContext {
  const payloadKind = toRecord(artifact.payload).payloadKind;
  return {
    contextKind: "approved_project_artifact_context",
    sourceRefId,
    artifactId: artifact.id,
    artifactType,
    stageId: artifact.stageId,
    status: "approved",
    version: artifact.version,
    ...(typeof payloadKind === "string" && payloadKind.trim() !== ""
      ? { payloadKind }
      : {}),
    label,
    summary: sanitizeLine(summary),
    excerpts: excerpts
      .map(sanitizeLine)
      .filter((line) => line !== "")
      .slice(0, MAX_EXCERPTS),
  };
}

function blocked(
  code: string,
  ...messages: string[]
): CreateRfpHldIntakeQuestionnaireDraftResult {
  return { status: "blocked", code, messages };
}

/**
 * Create exactly one reviewable candidate `hld_intake_questionnaire` from the
 * approved upstream source chain. Fail-closes with a lean `blocked` result before
 * any drafting when a required approved input or source-chain proof is missing;
 * returns `drafting_unavailable` (no write) with no configured executor,
 * `drafting_failed` on an executor throw (no provider detail), `invalid_candidate_output`
 * on an untrusted candidate, and `invalid_payload` when the constructed payload
 * fails re-validation. On success it persists a single needs_review artifact whose
 * sourceArtifactIds equal the validated payload's and returns lean summaries only.
 */
export async function createRfpHldIntakeQuestionnaireDraft(
  input: CreateRfpHldIntakeQuestionnaireDraftInput
): Promise<CreateRfpHldIntakeQuestionnaireDraftResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (typeof input.createdBy !== "string" || input.createdBy.trim() === "") {
    throw new Error("createdBy is required.");
  }

  const tenantId = input.tenantId;
  const projectId = input.projectId;
  const createdBy = input.createdBy.trim();
  const createdAt = (input.createdAt ?? new Date()).toISOString();

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const [files, artifacts] = await Promise.all([
    listProjectFiles(tenantId, projectId),
    listProjectArtifacts(tenantId, projectId),
  ]);

  // Approved upstream chain: evidence -> requirements -> compliance.
  const evidence = latestApproved(
    artifacts,
    projectId,
    "evidence_package",
    EVIDENCE_PACKAGE_PAYLOAD_KIND
  );
  if (evidence === null) {
    return blocked(
      "missing_approved_evidence_package",
      "No approved evidence package is available."
    );
  }

  const requirements = latestApproved(
    artifacts,
    projectId,
    "requirements_baseline",
    REQUIREMENTS_BASELINE_PAYLOAD_KIND
  );
  if (requirements === null) {
    return blocked(
      "missing_approved_requirements_baseline",
      "No approved requirements baseline is available."
    );
  }
  const requirementsPayload = toRecord(requirements.payload);
  const requirementsCitedEvidence = asString(
    requirementsPayload.sourceEvidencePackageArtifactId
  );
  if (requirementsCitedEvidence !== evidence.id) {
    return blocked(
      "requirements_baseline_source_chain_mismatch",
      "The approved requirements baseline does not cite the approved evidence package."
    );
  }

  const compliance = latestApproved(
    artifacts,
    projectId,
    "compliance_matrix",
    COMPLIANCE_MATRIX_PAYLOAD_KIND
  );
  if (compliance === null) {
    return blocked(
      "missing_approved_compliance_matrix",
      "No approved compliance matrix is available."
    );
  }
  const compliancePayload = toRecord(compliance.payload);

  // BoQ/configuration readiness gate authorizes exactly one configuration source.
  const { configurationGate } = getRfpBoqReadinessReport({
    projectId,
    files,
    artifacts,
  });
  if (!configurationGate.satisfied) {
    return blocked("configuration_gate_unsatisfied", configurationGate.message);
  }
  const authorizedConfigId =
    configurationGate.approvedConfigurationExpansionArtifactId ??
    configurationGate.noBoqExceptionArtifactId ??
    "";
  if (authorizedConfigId === "") {
    return blocked(
      "missing_approved_configuration_source",
      "No approved configuration source is authorized by the readiness gate."
    );
  }
  const configuration = await getProjectArtifactById(
    tenantId,
    projectId,
    authorizedConfigId
  );
  if (
    configuration === null ||
    configuration.type !== "configuration_expansion" ||
    configuration.status !== "approved"
  ) {
    return blocked(
      "missing_approved_configuration_source",
      "The gate-authorized configuration source is not an approved configuration_expansion."
    );
  }

  // The compliance matrix must cite the approved requirements, evidence, and the
  // gate-authorized configuration source.
  if (
    asString(compliancePayload.sourceRequirementsBaselineArtifactId) !==
      requirements.id ||
    asString(compliancePayload.sourceEvidencePackageArtifactId) !== evidence.id
  ) {
    return blocked(
      "compliance_matrix_source_chain_mismatch",
      "The approved compliance matrix does not cite the approved requirements baseline and evidence package."
    );
  }
  if (
    asString(compliancePayload.sourceConfigurationExpansionArtifactId) !==
    authorizedConfigId
  ) {
    return blocked(
      "configuration_source_mismatch",
      "The approved compliance matrix does not cite the gate-authorized configuration source."
    );
  }

  // HLD domain readiness: every claimed technical domain must have an approved pack.
  const domainReadiness = getRfpHldDomainReadinessReport({ projectId, artifacts });
  if (domainReadiness.status !== "ready") {
    return {
      status: "blocked",
      code: "missing_design_knowledge_packs",
      messages: domainReadiness.messages.slice(),
    };
  }

  // Compact every approved design knowledge pack; a malformed pack blocks.
  const dkpRefs: RfpHldIntakeQuestionnaireDraftingSourceRef[] = [];
  const dkpContents: RfpHldIntakeQuestionnaireDraftingInput["designKnowledgePackContents"] =
    [];
  for (const summary of domainReadiness.knowledgePackSummaries) {
    const pack = artifacts.find(
      (a) => a.id === summary.artifactId && a.projectId === projectId
    );
    if (pack === undefined) {
      return blocked(
        "missing_design_knowledge_packs",
        `Approved design knowledge pack ${summary.artifactId} is unavailable.`
      );
    }
    const selected = selectRfpHldApprovedDesignKnowledgeContent(pack);
    if (selected.status !== "ok") {
      return {
        status: "blocked",
        code: "invalid_design_knowledge_pack_content",
        messages: selected.errors.slice(),
      };
    }
    dkpContents.push(selected.content);
    dkpRefs.push(toSourceRef(`dkp-${summary.domain}`, pack, summary.title));
  }

  // Build the transient, whitelisted drafting input (no raw bytes / handles / authority).
  const sourceRefs: RfpHldIntakeQuestionnaireDraftingSourceRef[] = [
    toSourceRef("source-evidence", evidence, "Approved evidence package"),
    toSourceRef("source-requirements", requirements, "Approved requirements baseline"),
    toSourceRef("source-compliance", compliance, "Approved compliance matrix"),
    toSourceRef("source-configuration", configuration, "Approved configuration source"),
    ...dkpRefs,
  ];
  const sourceArtifactIds: string[] = [];
  for (const ref of sourceRefs) {
    if (!sourceArtifactIds.includes(ref.artifactId)) {
      sourceArtifactIds.push(ref.artifactId);
    }
  }

  const evidencePayload = toRecord(evidence.payload);
  const configPayload = toRecord(configuration.payload);
  const configSummary = toRecord(configPayload.summary);
  const approvedSourceContexts: RfpHldIntakeQuestionnaireApprovedSourceContext[] = [
    toApprovedSourceContext(
      "source-evidence",
      evidence,
      "evidence_package",
      "Approved evidence package",
      `Approved evidence package with ${asCount(evidencePayload.evidenceCount)} evidence item(s) (${asCount(evidencePayload.textChunkCount)} text chunk(s), ${asCount(evidencePayload.tableEvidenceCount)} table(s)).`,
      []
    ),
    toApprovedSourceContext(
      "source-requirements",
      requirements,
      "requirements_baseline",
      "Approved requirements baseline",
      `Approved requirements baseline with ${asCount(requirementsPayload.requirementCount)} requirement(s).`,
      Array.isArray(requirementsPayload.requirements)
        ? requirementsPayload.requirements.map((r) => sanitizeLine(toRecord(r).text))
        : []
    ),
    toApprovedSourceContext(
      "source-compliance",
      compliance,
      "compliance_matrix",
      "Approved compliance matrix",
      `Approved compliance matrix with ${
        Array.isArray(compliancePayload.rows) ? compliancePayload.rows.length : 0
      } reviewed row(s).`,
      []
    ),
    toApprovedSourceContext(
      "source-configuration",
      configuration,
      "configuration_expansion",
      "Approved configuration source",
      `Approved configuration source with ${asCount(configPayload.lineCount)} accepted line(s) (${asCount(configSummary.totalAcceptedLineCount)} total accepted).`,
      []
    ),
  ];

  const draftingInput: RfpHldIntakeQuestionnaireDraftingInput = {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND,
    createdBy,
    createdAt,
    sourceArtifactIds: sourceArtifactIds.slice(),
    sourceRefs,
    approvedSourceContexts,
    designKnowledgePackContents: dkpContents,
    instructions: {
      candidateOnly: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY,
      targetPayloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND,
      forbidden: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_FORBIDDEN.slice(),
    },
  };

  // Candidate drafting through the existing OpenAI executor boundary (candidate-only).
  const executor = getConfiguredRfpHldIntakeQuestionnaireDraftingExecutor();
  if (executor === null) return { status: "drafting_unavailable" };

  const drafted = await draftRfpHldIntakeQuestionnaireCandidate({
    draftingInput,
    executor,
  });
  if (drafted.status === "unavailable") return { status: "drafting_unavailable" };
  if (drafted.status === "drafting_failed") return { status: "drafting_failed" };
  if (drafted.status === "invalid_candidate_output") {
    return { status: "invalid_candidate_output", errors: drafted.errors };
  }

  // Re-validate the constructed candidate payload before persisting.
  const candidate = drafted.questionnaire;
  const check = validateRfpHldIntakeQuestionnairePayload(candidate);
  if (!check.valid) {
    return { status: "invalid_payload", errors: check.errors };
  }

  const stored = await createProjectArtifactVersion({
    tenantId,
    projectId,
    stageId: QUESTIONNAIRE_STAGE_ID,
    type: QUESTIONNAIRE_ARTIFACT_TYPE,
    status: "needs_review",
    payload: candidate as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: candidate.sourceArtifactIds.slice(),
  });

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(stored),
    payloadSummary: toPayloadSummary(candidate),
  };
}

/** Lean provenance/count summary of the persisted candidate questionnaire. */
function toPayloadSummary(
  payload: RfpHldIntakeQuestionnairePayload
): RfpHldIntakeQuestionnaireCreatePayloadSummary {
  return {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_PAYLOAD_KIND,
    createdBy: payload.createdBy,
    createdAt: payload.createdAt,
    questionCount: payload.questions.length,
    sourceArtifactCount: payload.sourceArtifactIds.length,
    sourceRefCount: payload.sourceRefs.length,
    validationStatus: payload.validation.status,
    validationFindingCount: payload.validation.findingCount,
    payloadValid: validateRfpHldIntakeQuestionnairePayload(payload).valid,
  };
}
