/**
 * Pure, read-only RFP HLD readiness report (Stage 6.4a foundation).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Evaluates whether an HLD readiness snapshot may be drafted by checking the
 * approved upstream Project authorities ONLY. It generates no HLD model, diagram,
 * document, or proposal; reads no raw RFP files; runs no AI; and makes no pricing,
 * SKU, catalog, validation, or configuration decision. Configuration authority is
 * delegated to the BoQ readiness gate; design-knowledge authority is delegated to
 * the domain readiness helper. This module only inspects approved artifact
 * type/version/status and the engineer-authored hld_intake answers.
 *
 * It imports exactly: canonical Project types, the pure BoQ readiness gate, and the
 * pure HLD domain readiness helper / domain definitions - so it cannot reach a DB,
 * filesystem, parser, artifact service, pricing, catalog, engine, or AI.
 */
import type {
  ProjectArtifact,
  ProjectArtifactType,
  ProjectFile,
} from "@/types/project";
import { getRfpBoqReadinessReport } from "@/lib/projects/project-rfp-boq-readiness";
import {
  getRfpHldDomainReadinessReport,
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";

/** Deterministic ids of the inputs the readiness chain checks. */
export type RfpHldReadinessInputId =
  | "evidence_package"
  | "requirements_baseline"
  | "compliance_matrix"
  | "configuration"
  | "hld_intake"
  | "design_knowledge_packs";

export type RfpHldReadinessStatus = "ready" | "blocked";

/** Sanitized assumption derived from an approved hld_intake unknown/NA answer. */
export interface RfpHldReadinessAssumption {
  fieldId: string;
  label: string;
  status: "unknown" | "not_applicable";
  note?: string;
}

/** Lean design-domain summary carried on the readiness report. */
export interface RfpHldReadinessDomainSummary {
  claimedDomains: RfpHldDesignDomain[];
  coveredDomains: RfpHldDesignDomain[];
  excludedDomains: RfpHldDesignDomain[];
  requiredKnowledgePackDomains: RfpHldDesignDomain[];
  missingKnowledgePackDomains: RfpHldDesignDomain[];
}

export interface GetRfpHldReadinessReportInput {
  projectId: string;
  files: readonly ProjectFile[];
  artifacts: readonly ProjectArtifact[];
}

export interface RfpHldReadinessReport {
  projectId: string;
  status: RfpHldReadinessStatus;
  canCreateReadinessSnapshot: boolean;
  /** Compiled source authority ids, populated only when ready; otherwise empty. */
  sourceArtifactIds: string[];
  sourceEvidencePackageArtifactId?: string;
  sourceRequirementsBaselineArtifactId?: string;
  sourceComplianceMatrixArtifactId?: string;
  sourceConfigurationArtifactId?: string;
  sourceHldIntakeArtifactId?: string;
  coveredDomains: RfpHldDesignDomain[];
  excludedDomains: RfpHldDesignDomain[];
  missingKnowledgePackDomains: RfpHldDesignDomain[];
  domainReadiness: RfpHldReadinessDomainSummary;
  assumptions: RfpHldReadinessAssumption[];
  missingInputs: RfpHldReadinessInputId[];
  validationMessages: string[];
}

/** Highest-version artifact for `projectId` of `type`; undefined if none. */
function latestArtifact(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  type: ProjectArtifactType
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.projectId !== projectId || artifact.type !== type) continue;
    if (latest === undefined || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

/** Id of the latest artifact of `type` only when its latest version is approved. */
function approvedLatestId(
  artifacts: readonly ProjectArtifact[],
  projectId: string,
  type: ProjectArtifactType
): string | undefined {
  const latest = latestArtifact(artifacts, projectId, type);
  return latest !== undefined && latest.status === "approved" ? latest.id : undefined;
}

/**
 * Derive sanitized assumptions from an approved hld_intake's unknown/NA answers.
 * Only engineer-authored field/label/status/notes are surfaced - never raw RFP
 * document text, paths, or answered values.
 */
function deriveAssumptions(
  intake: ProjectArtifact | undefined
): RfpHldReadinessAssumption[] {
  if (intake === undefined || intake.status !== "approved") return [];
  const answers = intake.payload.answers;
  if (!Array.isArray(answers)) return [];
  const out: RfpHldReadinessAssumption[] = [];
  for (const raw of answers) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const status = record.status;
    if (status !== "unknown" && status !== "not_applicable") continue;
    const fieldId = typeof record.fieldId === "string" ? record.fieldId.trim() : "";
    if (fieldId === "") continue;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const note =
      typeof record.notes === "string" && record.notes.trim() !== ""
        ? record.notes.trim()
        : undefined;
    out.push({ fieldId, label, status, ...(note !== undefined ? { note } : {}) });
  }
  return out;
}

export function getRfpHldReadinessReport(
  input: GetRfpHldReadinessReportInput
): RfpHldReadinessReport {
  const { projectId, files, artifacts } = input;

  // Configuration authority is delegated to the BoQ readiness gate; this module
  // never inspects pricing/SKU/catalog data itself.
  const configurationGate = getRfpBoqReadinessReport({
    projectId,
    files,
    artifacts,
  }).configurationGate;
  const configurationSourceId =
    configurationGate.approvedConfigurationExpansionArtifactId ??
    configurationGate.noBoqExceptionArtifactId;
  // Freshness spine: the gate can stay satisfied by an OLDER approved
  // configuration_expansion (or approved no-BoQ exception, itself a
  // configuration_expansion). HLD readiness must not proceed when a newer,
  // unapproved configuration_expansion supersedes it - so the latest
  // configuration_expansion must BE the gate's authorized approved source.
  const latestConfiguration = latestArtifact(
    artifacts,
    projectId,
    "configuration_expansion"
  );
  const configurationFresh =
    configurationGate.satisfied &&
    latestConfiguration !== undefined &&
    latestConfiguration.status === "approved" &&
    latestConfiguration.id === configurationSourceId;

  // Design-knowledge authority is delegated to the domain readiness helper.
  const domain = getRfpHldDomainReadinessReport({ projectId, artifacts });
  const claimed = new Set<RfpHldDesignDomain>(domain.claimedDomains);
  const excludedDomains = RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.filter(
    (d) => !claimed.has(d.domain)
  ).map((d) => d.domain);

  const evidenceId = approvedLatestId(artifacts, projectId, "evidence_package");
  const requirementsId = approvedLatestId(artifacts, projectId, "requirements_baseline");
  const complianceId = approvedLatestId(artifacts, projectId, "compliance_matrix");
  const intake = latestArtifact(artifacts, projectId, "hld_intake");
  const intakeId = intake !== undefined && intake.status === "approved" ? intake.id : undefined;

  const knowledgePacksReady = domain.missingKnowledgePackDomains.length === 0;

  const checks: ReadonlyArray<{
    id: RfpHldReadinessInputId;
    satisfied: boolean;
    message: string;
  }> = [
    {
      id: "evidence_package",
      satisfied: evidenceId !== undefined,
      message: "Approved evidence package is required before HLD readiness.",
    },
    {
      id: "requirements_baseline",
      satisfied: requirementsId !== undefined,
      message: "Approved requirements baseline is required before HLD readiness.",
    },
    {
      id: "compliance_matrix",
      satisfied: complianceId !== undefined,
      message: "Approved compliance matrix is required before HLD readiness.",
    },
    {
      id: "configuration",
      satisfied: configurationFresh,
      message: configurationFresh
        ? configurationGate.message
        : configurationGate.satisfied
          ? "A newer configuration expansion supersedes the approved one; the latest configuration expansion must be approved before HLD readiness."
          : configurationGate.message,
    },
    {
      id: "hld_intake",
      satisfied: intakeId !== undefined,
      message: "Approved HLD intake is required before HLD readiness.",
    },
    {
      id: "design_knowledge_packs",
      satisfied: knowledgePacksReady,
      message: knowledgePacksReady
        ? "All required design knowledge packs are approved."
        : `Missing approved design knowledge pack(s): ${domain.missingKnowledgePackDomains.join(", ")}.`,
    },
  ];

  const missingInputs = checks.filter((c) => !c.satisfied).map((c) => c.id);
  const canCreateReadinessSnapshot = missingInputs.length === 0;
  const status: RfpHldReadinessStatus = canCreateReadinessSnapshot ? "ready" : "blocked";

  const knowledgePackArtifactIds = domain.knowledgePackSummaries.map((s) => s.artifactId);
  const sourceArtifactIds = canCreateReadinessSnapshot
    ? [
        evidenceId!,
        requirementsId!,
        complianceId!,
        configurationSourceId!,
        intakeId!,
        ...knowledgePackArtifactIds,
      ]
    : [];

  const validationMessages = canCreateReadinessSnapshot
    ? ["HLD readiness is ready: all approved upstream authorities are in place."]
    : [
        "HLD readiness is blocked.",
        ...checks.filter((c) => !c.satisfied).map((c) => c.message),
      ];

  return {
    projectId,
    status,
    canCreateReadinessSnapshot,
    sourceArtifactIds,
    ...(evidenceId !== undefined ? { sourceEvidencePackageArtifactId: evidenceId } : {}),
    ...(requirementsId !== undefined
      ? { sourceRequirementsBaselineArtifactId: requirementsId }
      : {}),
    ...(complianceId !== undefined ? { sourceComplianceMatrixArtifactId: complianceId } : {}),
    ...(configurationSourceId !== undefined
      ? { sourceConfigurationArtifactId: configurationSourceId }
      : {}),
    ...(intakeId !== undefined ? { sourceHldIntakeArtifactId: intakeId } : {}),
    coveredDomains: domain.coveredDomains,
    excludedDomains,
    missingKnowledgePackDomains: domain.missingKnowledgePackDomains,
    domainReadiness: {
      claimedDomains: domain.claimedDomains,
      coveredDomains: domain.coveredDomains,
      excludedDomains,
      requiredKnowledgePackDomains: domain.requiredKnowledgePackDomains,
      missingKnowledgePackDomains: domain.missingKnowledgePackDomains,
    },
    assumptions: deriveAssumptions(intake),
    missingInputs,
    validationMessages,
  };
}
