/**
 * Deterministic RFP HLD source-bundle assembler service (Stage 6B-002).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Compiles ONE reviewable `hld_source_bundle` artifact (status `needs_review`) on
 * the existing `hld_design_delta_review` stage. The bundle is a REFERENCE
 * compilation over already-approved Project authorities (evidence package,
 * requirements baseline, compliance matrix, gate-authorized configuration source,
 * HLD intake, approved HLD readiness snapshot) plus approved design knowledge
 * packs per covered technical domain. It carries NO SKU/pricing/catalog/topology/
 * scope/design authority and invents no design facts; configuration authority
 * stays the approved Project artifact and its gate.
 *
 * The assembler recomputes current HLD readiness, the BoQ/configuration gate, and
 * domain readiness with the existing pure helpers and fails closed on any drift,
 * then validates the compiled payload with the Stage 6B-001 contract before
 * returning/persisting. It runs no AI and makes no pricing/SKU/catalog decision.
 * Imports exactly: project/file/artifact stores, the pure readiness / BoQ / domain
 * helpers, the Stage 6B-001 contract, and canonical project types - no fs/path,
 * no parser, no AI/provider, no pricing/SKU/catalog/config service, no route/UI.
 */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import {
  createProjectArtifactVersion,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import {
  getRfpHldReadinessReport,
  type RfpHldReadinessReport,
} from "@/lib/projects/project-rfp-hld-readiness";
import { getRfpBoqReadinessReport } from "@/lib/projects/project-rfp-boq-readiness";
import {
  getRfpHldDomainReadinessReport,
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  RFP_HLD_SOURCE_BUNDLE_NO_BOQ_EXCEPTION_MARKER,
  RFP_HLD_SOURCE_BUNDLE_READINESS_SNAPSHOT_PAYLOAD_KIND,
  validateRfpHldSourceBundlePayload,
  type RfpHldSourceBundleAuthorityReference,
  type RfpHldSourceBundleConfigurationAuthority,
  type RfpHldSourceBundleDesignKnowledgePackReference,
  type RfpHldSourceBundlePayload,
  type RfpHldSourceBundleStatementEntry,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

const SOURCE_BUNDLE_TYPE: ProjectArtifactType = "hld_source_bundle";
const HLD_STAGE: ProjectStageId = "hld_design_delta_review";

/** Stable blocked codes; every fail-closed branch maps to exactly one. */
export type RfpHldSourceBundleBlockedCode =
  | "hld_readiness_not_ready"
  | "missing_readiness_snapshot"
  | "stale_readiness_snapshot"
  | "configuration_gate_unsatisfied"
  | "no_boq_exception_with_boq"
  | "configuration_source_mismatch"
  | "missing_domain_knowledge_pack"
  | "missing_authority_artifact";

/** Pure input over supplied Project rows; no DB, no I/O. */
export interface BuildRfpHldSourceBundleDraftInput {
  projectId: string;
  files: readonly ProjectFile[];
  artifacts: readonly ProjectArtifact[];
  createdBy: string;
  /** Optional fixed timestamp for deterministic tests; defaults to now. */
  createdAt?: Date;
}

/** Discriminated result of {@link buildRfpHldSourceBundleDraft}. */
export type BuildRfpHldSourceBundleDraftResult =
  | { status: "ok"; payload: RfpHldSourceBundlePayload }
  | { status: "blocked"; code: RfpHldSourceBundleBlockedCode; messages: string[] }
  | { status: "invalid_payload"; errors: string[] };

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Latest version of `type` for the project, only when that latest is approved. */
function latestApproved(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  type: ProjectArtifactType
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const a of artifacts) {
    if (a.projectId !== projectId || a.type !== type) continue;
    if (latest === undefined || a.version > latest.version) latest = a;
  }
  return latest !== undefined && latest.status === "approved" ? latest : undefined;
}

function byId(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  id: string | undefined
): ProjectArtifact | undefined {
  if (id === undefined) return undefined;
  return artifacts.find((a) => a.projectId === projectId && a.id === id);
}

/** Build a plain authority reference from a resolved approved artifact. */
function toAuthorityRef(
  artifact: ProjectArtifact,
  artifactType: ProjectArtifactType,
  stageId: ProjectStageId,
  payloadKind?: string
): RfpHldSourceBundleAuthorityReference {
  return {
    artifactId: artifact.id,
    artifactType,
    stageId,
    status: "approved",
    version: artifact.version,
    ...(payloadKind !== undefined ? { payloadKind } : {}),
  };
}

/**
 * Fail closed unless the approved readiness snapshot still proves the current
 * ready inputs: ready status, empty missingInputs, named source fields present,
 * its payload source ids equal current readiness, and the artifact row source ids
 * equal the persisted payload source ids. Returns an error message, or null.
 */
function checkReadinessSnapshot(
  snapshot: ProjectArtifact,
  readiness: RfpHldReadinessReport
): string | null {
  const p = snapshot.payload;
  if (payloadString(p, "payloadKind") !== RFP_HLD_SOURCE_BUNDLE_READINESS_SNAPSHOT_PAYLOAD_KIND) {
    return "Readiness snapshot has the wrong payload kind.";
  }
  if (payloadString(p, "readinessStatus") !== "ready") {
    return "Readiness snapshot did not record a ready status.";
  }
  if (!Array.isArray(p.missingInputs) || p.missingInputs.length !== 0) {
    return "Readiness snapshot still records missing inputs.";
  }
  const named: ReadonlyArray<[string, string | undefined]> = [
    ["sourceEvidencePackageArtifactId", readiness.sourceEvidencePackageArtifactId],
    ["sourceRequirementsBaselineArtifactId", readiness.sourceRequirementsBaselineArtifactId],
    ["sourceComplianceMatrixArtifactId", readiness.sourceComplianceMatrixArtifactId],
    ["sourceConfigurationArtifactId", readiness.sourceConfigurationArtifactId],
    ["sourceHldIntakeArtifactId", readiness.sourceHldIntakeArtifactId],
  ];
  for (const [key, current] of named) {
    const recorded = payloadString(p, key);
    if (recorded === undefined) return `Readiness snapshot is missing ${key}.`;
    if (recorded !== current) {
      return "Readiness snapshot named sources no longer match the current ready inputs.";
    }
  }
  const payloadIds = p.sourceArtifactIds;
  if (!Array.isArray(payloadIds) || !arraysEqual(payloadIds, readiness.sourceArtifactIds)) {
    return "Readiness snapshot source ids no longer match the current ready inputs.";
  }
  if (!arraysEqual(snapshot.sourceArtifactIds, payloadIds)) {
    return "Readiness snapshot artifact source ids do not match its payload.";
  }
  return null;
}

/** Deterministic, non-inventing statement from an engineer-authored assumption. */
function toAssumptionEntry(
  assumption: RfpHldReadinessReport["assumptions"][number],
  intakeArtifactId: string
): RfpHldSourceBundleStatementEntry {
  const label = assumption.label.trim() !== "" ? assumption.label : assumption.fieldId;
  return {
    id: `assumption-${assumption.fieldId}`,
    statement: assumption.note ?? `${label} marked ${assumption.status} during HLD intake.`,
    sourceArtifactId: intakeArtifactId,
  };
}

/**
 * Pure assembler: compile a validated `hld_source_bundle` payload from supplied
 * Project rows, or a fail-closed blocked/invalid result. Makes no I/O.
 */
export function buildRfpHldSourceBundleDraft(
  input: BuildRfpHldSourceBundleDraftInput
): BuildRfpHldSourceBundleDraftResult {
  const { projectId, files, artifacts, createdBy } = input;
  const createdAt = (input.createdAt ?? new Date()).toISOString();

  // 1. Current HLD readiness must be ready over the live inputs.
  const readiness = getRfpHldReadinessReport({ projectId, files, artifacts });
  if (!readiness.canCreateReadinessSnapshot) {
    return { status: "blocked", code: "hld_readiness_not_ready", messages: readiness.validationMessages };
  }

  // 2. Latest approved HLD readiness snapshot, still matching the ready inputs.
  const snapshot = latestApproved(artifacts, projectId, "hld_readiness_snapshot");
  if (snapshot === undefined) {
    return {
      status: "blocked",
      code: "missing_readiness_snapshot",
      messages: ["An approved HLD readiness snapshot is required before the source bundle."],
    };
  }
  const snapshotError = checkReadinessSnapshot(snapshot, readiness);
  if (snapshotError !== null) {
    return { status: "blocked", code: "stale_readiness_snapshot", messages: [snapshotError] };
  }

  // 3. Recompute the BoQ/configuration gate; require a gate-authorized source.
  const boq = getRfpBoqReadinessReport({ projectId, files, artifacts });
  const gate = boq.configurationGate;
  const hasBoq = boq.hasBoqFiles;
  const configId = hasBoq
    ? gate.approvedConfigurationExpansionArtifactId
    : gate.noBoqExceptionArtifactId;
  const configArtifact = byId(artifacts, projectId, configId);
  if (!gate.satisfied || configArtifact === undefined || configArtifact.status !== "approved") {
    return { status: "blocked", code: "configuration_gate_unsatisfied", messages: [gate.message] };
  }
  const isException =
    payloadString(configArtifact.payload, "payloadKind") ===
    RFP_HLD_SOURCE_BUNDLE_NO_BOQ_EXCEPTION_MARKER;
  if (isException && hasBoq) {
    return {
      status: "blocked",
      code: "no_boq_exception_with_boq",
      messages: ["A no-BoQ service-only exception cannot authorize a project that has BoQ input."],
    };
  }

  // 4. The compliance matrix must cite the gate-authorized configuration source.
  const compliance = byId(artifacts, projectId, readiness.sourceComplianceMatrixArtifactId);
  if (compliance === undefined) {
    return {
      status: "blocked",
      code: "missing_authority_artifact",
      messages: ["The approved compliance matrix could not be resolved."],
    };
  }
  if (payloadString(compliance.payload, "sourceConfigurationExpansionArtifactId") !== configArtifact.id) {
    return {
      status: "blocked",
      code: "configuration_source_mismatch",
      messages: ["The compliance matrix configuration source does not match the gate-authorized configuration."],
    };
  }

  // 5. Domain coverage: every claimed technical domain needs an approved pack.
  const domain = getRfpHldDomainReadinessReport({ projectId, artifacts });
  if (domain.missingKnowledgePackDomains.length > 0) {
    return {
      status: "blocked",
      code: "missing_domain_knowledge_pack",
      messages: domain.missingKnowledgePackDomains.map(
        (d) => `Missing approved design knowledge pack for ${d}.`
      ),
    };
  }
  const designKnowledgePackRefs: RfpHldSourceBundleDesignKnowledgePackReference[] =
    domain.knowledgePackSummaries.map((pack) => ({
      artifactId: pack.artifactId,
      artifactType: "design_knowledge_pack",
      stageId: "hld_design_delta_review",
      status: "approved",
      version: pack.version,
      payloadKind: RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
      domain: pack.domain,
    }));
  const coveredDomains: RfpHldDesignDomain[] = domain.knowledgePackSummaries.map((p) => p.domain);
  const claimed = new Set<RfpHldDesignDomain>(domain.claimedDomains);
  const excludedDomains: RfpHldDesignDomain[] = RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.filter(
    (d) => !claimed.has(d.domain)
  ).map((d) => d.domain);

  // 6. Resolve the remaining required authority artifacts.
  const evidence = byId(artifacts, projectId, readiness.sourceEvidencePackageArtifactId);
  const requirements = byId(artifacts, projectId, readiness.sourceRequirementsBaselineArtifactId);
  const intake = byId(artifacts, projectId, readiness.sourceHldIntakeArtifactId);
  if (evidence === undefined || requirements === undefined || intake === undefined) {
    return {
      status: "blocked",
      code: "missing_authority_artifact",
      messages: ["A required approved authority artifact could not be resolved."],
    };
  }

  const configurationAuthority: RfpHldSourceBundleConfigurationAuthority = {
    artifactId: configArtifact.id,
    artifactType: "configuration_expansion",
    stageId: "configuration_expansion_review",
    status: "approved",
    version: configArtifact.version,
    sourceKind: isException ? "no_boq_service_only_exception" : "configuration_expansion",
    ...(isException ? { payloadKind: RFP_HLD_SOURCE_BUNDLE_NO_BOQ_EXCEPTION_MARKER } : {}),
  };

  // 7. Compile the reference bundle. Source ids = every referenced authority/pack.
  const referencedIds = [
    evidence.id,
    requirements.id,
    compliance.id,
    configArtifact.id,
    intake.id,
    snapshot.id,
    ...designKnowledgePackRefs.map((ref) => ref.artifactId),
  ];

  const payload: RfpHldSourceBundlePayload = {
    payloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    createdBy,
    createdAt,
    sourceArtifactIds: [...referencedIds],
    lineage: {
      compiledFromReadinessSnapshotArtifactId: snapshot.id,
      compiledArtifactIds: [...referencedIds],
    },
    authorities: {
      evidencePackage: toAuthorityRef(evidence, "evidence_package", "intake_package_review"),
      requirementsBaseline: toAuthorityRef(
        requirements,
        "requirements_baseline",
        "requirements_baseline_review"
      ),
      complianceMatrix: toAuthorityRef(compliance, "compliance_matrix", "compliance_matrix_review"),
      configurationAuthority,
      hldIntake: toAuthorityRef(intake, "hld_intake", HLD_STAGE),
      hldReadinessSnapshot: toAuthorityRef(
        snapshot,
        "hld_readiness_snapshot",
        HLD_STAGE,
        RFP_HLD_SOURCE_BUNDLE_READINESS_SNAPSHOT_PAYLOAD_KIND
      ),
    },
    designKnowledgePackRefs,
    coveredDomains,
    missingDomains: [],
    excludedDomains,
    assumptions: readiness.assumptions.map((a) => toAssumptionEntry(a, intake.id)),
    constraints: [],
    warnings: [],
    blockers: [],
    validation: { status: "passed", checkedAt: createdAt },
  };

  const result = validateRfpHldSourceBundlePayload(payload);
  if (!result.valid) return { status: "invalid_payload", errors: result.errors };
  return { status: "ok", payload };
}

// ---- tenant-scoped draft creation wrapper ----------------------------------

/** Input for {@link createRfpHldSourceBundleDraft}. */
export interface CreateRfpHldSourceBundleDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** Optional fixed timestamp for deterministic tests; defaults to now. */
  createdAt?: Date;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
export interface RfpHldSourceBundleProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload body. */
export interface RfpHldSourceBundleArtifactSummary {
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

/** Lean payload summary: provenance and counts only, never raw bodies. */
export interface RfpHldSourceBundlePayloadSummary {
  payloadKind: typeof RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  sourceArtifactCount: number;
  coveredDomainCount: number;
  excludedDomainCount: number;
  designKnowledgePackCount: number;
  assumptionCount: number;
  warningCount: number;
  blockerCount: number;
}

/** Discriminated result of {@link createRfpHldSourceBundleDraft}. */
export type CreateRfpHldSourceBundleDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldSourceBundleProjectSummary }
  | { status: "blocked"; code: RfpHldSourceBundleBlockedCode; messages: string[] }
  | { status: "invalid_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldSourceBundleArtifactSummary;
      payloadSummary: RfpHldSourceBundlePayloadSummary;
    };

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toProjectSummary(project: Project): RfpHldSourceBundleProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): RfpHldSourceBundleArtifactSummary {
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

function toPayloadSummary(payload: RfpHldSourceBundlePayload): RfpHldSourceBundlePayloadSummary {
  return {
    payloadKind: payload.payloadKind,
    createdBy: payload.createdBy,
    createdAt: payload.createdAt,
    sourceArtifactCount: payload.sourceArtifactIds.length,
    coveredDomainCount: payload.coveredDomains.length,
    excludedDomainCount: payload.excludedDomains.length,
    designKnowledgePackCount: payload.designKnowledgePackRefs.length,
    assumptionCount: payload.assumptions.length,
    warningCount: payload.warnings.length,
    blockerCount: payload.blockers.length,
  };
}

/**
 * Create exactly ONE `needs_review` `hld_source_bundle` on `hld_design_delta_review`,
 * tenant-scoped, only when the pure assembler returns a validated payload. The
 * project is verified within its tenant (not_found / wrong_mode, lean summary that
 * never leaks tenantId). Blocked/invalid assembler results are surfaced and write
 * nothing. On success exactly one artifact is written with empty sourceFileIds and
 * sourceArtifactIds exactly equal to the payload source ids; lean summaries are
 * returned and the full payload body stays in the persisted artifact.
 */
export async function createRfpHldSourceBundleDraft(
  input: CreateRfpHldSourceBundleDraftInput
): Promise<CreateRfpHldSourceBundleDraftResult> {
  const projectId = asTrimmed(input.projectId);
  const createdBy = asTrimmed(input.createdBy);
  if (projectId === "") throw new Error("HLD source bundle requires a projectId.");
  if (createdBy === "") throw new Error("HLD source bundle requires a createdBy.");

  const project = await getProjectById(input.tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const [files, artifacts] = await Promise.all([
    listProjectFiles(input.tenantId, projectId),
    listProjectArtifacts(input.tenantId, projectId),
  ]);

  const built = buildRfpHldSourceBundleDraft({
    projectId,
    files,
    artifacts,
    createdBy,
    ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
  });
  if (built.status === "blocked") {
    return { status: "blocked", code: built.code, messages: built.messages };
  }
  if (built.status === "invalid_payload") {
    return { status: "invalid_payload", errors: built.errors };
  }

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId: input.tenantId,
    stageId: HLD_STAGE,
    type: SOURCE_BUNDLE_TYPE,
    status: "needs_review",
    payload: built.payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: built.payload.sourceArtifactIds,
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(built.payload),
  };
}
