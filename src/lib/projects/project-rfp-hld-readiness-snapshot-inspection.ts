/**
 * RFP HLD readiness snapshot inspection read model (Stage 6.4b).
 *
 * Read-only inspection over `hld_readiness_snapshot` artifacts on
 * `hld_design_delta_review`. List returns lean counts-only summaries. Detail
 * returns a sanitized snapshot object with unknown domains and malformed entries
 * filtered out. Writes nothing, runs no AI, reads no file/evidence stores, makes
 * no pricing/SKU/catalog/config/design decision, and never surfaces tenant ids,
 * file paths, storage paths, or raw source bodies.
 */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import {
  getProjectArtifactById,
  listProjectArtifacts,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import { RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-readiness-snapshot";
import {
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";
import {
  getRfpHldReadinessReport,
  type RfpHldReadinessReport,
} from "@/lib/projects/project-rfp-hld-readiness";

const SNAPSHOT_TYPE: ProjectArtifact["type"] = "hld_readiness_snapshot";
const SNAPSHOT_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";
const KNOWN_DOMAINS = new Set<string>(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

// ---- project summary -------------------------------------------------------

export interface RfpHldReadinessSnapshotInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

// ---- artifact summary (no sourceFileIds / sourceArtifactIds in list) -------

export interface RfpHldReadinessSnapshotInspectionArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ---- list payload summary (counts only, no sourceArtifactIds or messages) --

export interface RfpHldReadinessSnapshotInspectionPayloadSummary {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  readinessStatus: string;
  sourceArtifactCount: number;
  coveredDomainCount: number;
  excludedDomainCount: number;
  assumptionCount: number;
  missingInputCount: number;
  validationMessageCount: number;
}

export interface RfpHldReadinessSnapshotInspectionListItem
  extends RfpHldReadinessSnapshotInspectionArtifactSummary {
  payloadSummary: RfpHldReadinessSnapshotInspectionPayloadSummary;
}

export interface LoadRfpHldReadinessSnapshotListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldReadinessSnapshotListResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldReadinessSnapshotInspectionProjectSummary;
    }
  | {
      status: "ok";
      project: RfpHldReadinessSnapshotInspectionProjectSummary;
      artifacts: RfpHldReadinessSnapshotInspectionListItem[];
      artifactCount: number;
      readiness: RfpHldReadinessReport;
    };

// ---- detail types ----------------------------------------------------------

export interface RfpHldReadinessSnapshotInspectionAssumption {
  fieldId: string;
  label: string;
  status: "unknown" | "not_applicable";
  note?: string;
}

export interface RfpHldReadinessSnapshotInspectionDomainReadiness {
  claimedDomains: RfpHldDesignDomain[];
  coveredDomains: RfpHldDesignDomain[];
  excludedDomains: RfpHldDesignDomain[];
  requiredKnowledgePackDomains: RfpHldDesignDomain[];
  missingKnowledgePackDomains: RfpHldDesignDomain[];
}

export interface RfpHldReadinessSnapshotInspectionDetail {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  readinessStatus: string;
  sourceArtifactIds: string[];
  sourceEvidencePackageArtifactId?: string;
  sourceRequirementsBaselineArtifactId?: string;
  sourceComplianceMatrixArtifactId?: string;
  sourceConfigurationArtifactId?: string;
  sourceHldIntakeArtifactId?: string;
  coveredDomains: RfpHldDesignDomain[];
  excludedDomains: RfpHldDesignDomain[];
  domainReadiness: RfpHldReadinessSnapshotInspectionDomainReadiness;
  assumptions: RfpHldReadinessSnapshotInspectionAssumption[];
  missingInputs: string[];
  validationMessages: string[];
}

export interface LoadRfpHldReadinessSnapshotDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldReadinessSnapshotDetailResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldReadinessSnapshotInspectionProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_readiness_snapshot";
      artifact: RfpHldReadinessSnapshotInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpHldReadinessSnapshotInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldReadinessSnapshotInspectionProjectSummary;
      artifact: RfpHldReadinessSnapshotInspectionArtifactSummary;
      snapshot: RfpHldReadinessSnapshotInspectionDetail;
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

function asNonblankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function filterDomains(value: unknown): RfpHldDesignDomain[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (d): d is RfpHldDesignDomain => typeof d === "string" && KNOWN_DOMAINS.has(d)
  );
}

function filterStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === "string");
}

const ASSUMPTION_STATUSES = new Set(["unknown", "not_applicable"]);

function toAssumption(
  entry: unknown
): RfpHldReadinessSnapshotInspectionAssumption | undefined {
  if (!isPlainRecord(entry)) return undefined;
  const status = entry.status;
  if (typeof status !== "string" || !ASSUMPTION_STATUSES.has(status)) return undefined;
  const note = asNonblankString(entry.note);
  return {
    fieldId: asString(entry.fieldId),
    label: asString(entry.label),
    status: status as "unknown" | "not_applicable",
    ...(note !== undefined ? { note } : {}),
  };
}

function toDomainReadiness(
  value: unknown
): RfpHldReadinessSnapshotInspectionDomainReadiness {
  const r = toRecord(value);
  return {
    claimedDomains: filterDomains(r.claimedDomains),
    coveredDomains: filterDomains(r.coveredDomains),
    excludedDomains: filterDomains(r.excludedDomains),
    requiredKnowledgePackDomains: filterDomains(r.requiredKnowledgePackDomains),
    missingKnowledgePackDomains: filterDomains(r.missingKnowledgePackDomains),
  };
}

function toProjectSummary(
  project: Project
): RfpHldReadinessSnapshotInspectionProjectSummary {
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
): RfpHldReadinessSnapshotInspectionArtifactSummary {
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

function toPayloadSummary(
  payload: unknown
): RfpHldReadinessSnapshotInspectionPayloadSummary {
  const r = toRecord(payload);
  return {
    payloadKind: asString(r.payloadKind),
    createdBy: asString(r.createdBy),
    createdAt: asString(r.createdAt),
    readinessStatus: asString(r.readinessStatus),
    sourceArtifactCount: Array.isArray(r.sourceArtifactIds)
      ? r.sourceArtifactIds.length
      : 0,
    coveredDomainCount: Array.isArray(r.coveredDomains)
      ? r.coveredDomains.length
      : 0,
    excludedDomainCount: Array.isArray(r.excludedDomains)
      ? r.excludedDomains.length
      : 0,
    assumptionCount: Array.isArray(r.assumptions) ? r.assumptions.length : 0,
    missingInputCount: Array.isArray(r.missingInputs)
      ? r.missingInputs.length
      : 0,
    validationMessageCount: Array.isArray(r.validationMessages)
      ? r.validationMessages.length
      : 0,
  };
}

function isValidSnapshotPayload(r: Record<string, unknown>): boolean {
  return (
    r.payloadKind === RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND &&
    Array.isArray(r.sourceArtifactIds) &&
    Array.isArray(r.coveredDomains) &&
    Array.isArray(r.excludedDomains) &&
    isPlainRecord(r.domainReadiness) &&
    Array.isArray(r.assumptions) &&
    Array.isArray(r.missingInputs) &&
    Array.isArray(r.validationMessages)
  );
}

function toSnapshotDetail(
  r: Record<string, unknown>
): RfpHldReadinessSnapshotInspectionDetail {
  return {
    payloadKind: RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND,
    createdBy: asString(r.createdBy),
    createdAt: asString(r.createdAt),
    readinessStatus: asString(r.readinessStatus),
    sourceArtifactIds: filterStrings(r.sourceArtifactIds),
    ...(typeof r.sourceEvidencePackageArtifactId === "string"
      ? { sourceEvidencePackageArtifactId: r.sourceEvidencePackageArtifactId }
      : {}),
    ...(typeof r.sourceRequirementsBaselineArtifactId === "string"
      ? {
          sourceRequirementsBaselineArtifactId:
            r.sourceRequirementsBaselineArtifactId,
        }
      : {}),
    ...(typeof r.sourceComplianceMatrixArtifactId === "string"
      ? { sourceComplianceMatrixArtifactId: r.sourceComplianceMatrixArtifactId }
      : {}),
    ...(typeof r.sourceConfigurationArtifactId === "string"
      ? { sourceConfigurationArtifactId: r.sourceConfigurationArtifactId }
      : {}),
    ...(typeof r.sourceHldIntakeArtifactId === "string"
      ? { sourceHldIntakeArtifactId: r.sourceHldIntakeArtifactId }
      : {}),
    coveredDomains: filterDomains(r.coveredDomains),
    excludedDomains: filterDomains(r.excludedDomains),
    domainReadiness: toDomainReadiness(r.domainReadiness),
    assumptions: (r.assumptions as unknown[])
      .map(toAssumption)
      .filter((a): a is RfpHldReadinessSnapshotInspectionAssumption => a !== undefined),
    missingInputs: filterStrings(r.missingInputs),
    validationMessages: filterStrings(r.validationMessages),
  };
}

// ---- public API ------------------------------------------------------------

export async function loadRfpHldReadinessSnapshotList(
  input: LoadRfpHldReadinessSnapshotListInput
): Promise<LoadRfpHldReadinessSnapshotListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const [snapshotRows, allArtifacts, files] = await Promise.all([
    listProjectArtifactsByType(tenantId, projectId, SNAPSHOT_TYPE),
    listProjectArtifacts(tenantId, projectId),
    listProjectFiles(tenantId, projectId),
  ]);

  const artifacts = snapshotRows
    .filter((row) => row.type === SNAPSHOT_TYPE && row.stageId === SNAPSHOT_STAGE)
    .map((row) => ({
      ...toArtifactSummary(row),
      payloadSummary: toPayloadSummary(row.payload),
    }));

  const readiness = getRfpHldReadinessReport({
    projectId,
    files,
    artifacts: allArtifacts,
  });

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
    readiness,
  };
}

export async function loadRfpHldReadinessSnapshotDetail(
  input: LoadRfpHldReadinessSnapshotDetailInput
): Promise<LoadRfpHldReadinessSnapshotDetailResult> {
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
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== SNAPSHOT_TYPE ||
    artifact.stageId !== SNAPSHOT_STAGE
  ) {
    return {
      status: "artifact_not_hld_readiness_snapshot",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = toRecord(artifact.payload);
  if (!isValidSnapshotPayload(payload)) {
    return { status: "invalid_payload", artifact: toArtifactSummary(artifact) };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    snapshot: toSnapshotDetail(payload),
  };
}
