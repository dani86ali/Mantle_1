/** Read-only Quick BoM workspace read model: no mutation, pricing, export, runner, catalog, or AI. */
import { getProjectById } from "@/lib/db/project-store";
import { listProjectArtifacts } from "@/lib/db/project-artifact-store";
import { listProjectApprovals } from "@/lib/db/project-approval-store";
import {
  getQuickBomReadinessReport,
  type QuickBomReadinessReport,
} from "@/lib/projects/quick-bom-readiness";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectPricingConfig,
  ProjectStage,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

export interface ProjectSummary {
  id: string;
  tenantId: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  pricingConfig?: ProjectPricingConfig;
  /** Soft archive timestamp (QBM-LOG-006); absent when active. Read-only signal. */
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStageSummary {
  id: string;
  stageId: ProjectStageId;
  order: number;
  status: ProjectStageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactConfigAuthorityProvenance {
  scope: string;
  approvalRecordId: string;
  rulePackId: string;
  rulePackVersion: string;
  rulePackStatus: string;
  rulePackSourceScope: string;
  dispositionSummary: {
    expandByApprovedRulePackCount: number;
    preserveKnownRulePackChildCount: number;
    preserveStandaloneCustomerLineCount: number;
    deferUnknownRelationshipCount: number;
  };
  runtimeAi: boolean;
  replacementAuthority: boolean;
  skuSubstitutionAuthority: boolean;
  unknownRelationshipsDeferred: boolean;
  attachesOpticsUnderSwitches: boolean;
}

export interface ArtifactPricingAuthorityProvenance {
  profileId: string;
  scope: string;
  approvalRecordId: string;
  activeSource: string;
  activeSourceFixtureId: string;
  activeSourceStatus: string;
  currency: string;
  pricedSkuCount: number;
  missingPriceSkuCount: number;
  boundary: {
    deterministicPricingAuthority: boolean;
    demoFixtureAuthority: boolean;
    activeRuntimeSourceReadsExternalGplCsv: boolean;
    productionCiscoPricingAuthority: boolean;
    broadCiscoGeneralPricingAuthority: boolean;
    runtimeAiPricing: boolean;
    runtimeCatalogLookup: boolean;
    configurationAuthority: boolean;
    replacementAuthority: boolean;
    skuSubstitutionAuthority: boolean;
    silentSkuSubstitution: boolean;
    missingPricesReported: boolean;
  };
}

export interface ArtifactAuthorityProvenance {
  configurationAuthority?: ArtifactConfigAuthorityProvenance;
  pricingAuthority?: ArtifactPricingAuthorityProvenance;
}

export interface ProjectArtifactSummary {
  id: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  filePath?: string;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
  authorityProvenance?: ArtifactAuthorityProvenance;
}

export interface ProjectApprovalSummary {
  id: string;
  stageId: ProjectStageId;
  artifactId: string;
  artifactVersion: number;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt: string;
  note?: string;
}

export interface QuickBomSpineArtifacts {
  normalized_boq: ProjectArtifactSummary | null;
  sku_resolution: ProjectArtifactSummary | null;
  configuration_expansion: ProjectArtifactSummary | null;
  priced_boq: ProjectArtifactSummary | null;
  export_package: ProjectArtifactSummary | null;
}

export interface ProjectQuickBomWorkspace {
  project: ProjectSummary;
  stages: ProjectStageSummary[];
  artifacts: ProjectArtifactSummary[];
  spineArtifacts: QuickBomSpineArtifacts;
  approvals: ProjectApprovalSummary[];
  readiness: QuickBomReadinessReport;
}

export type ProjectQuickBomWorkspaceResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: ProjectSummary }
  | { status: "ok"; workspace: ProjectQuickBomWorkspace };

function iso(value: Date): string {
  return value.toISOString();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractConfigAuthority(
  payload: Record<string, unknown>
): ArtifactConfigAuthorityProvenance | undefined {
  const ca = payload["configurationAuthority"];
  if (!isRecord(ca)) return undefined;
  const ds = ca["dispositionSummary"];
  if (!isRecord(ds)) return undefined;
  if (
    ca["scope"] !== "honeywell_mvp_demo_only" ||
    typeof ca["approvalRecordId"] !== "string" ||
    typeof ca["rulePackId"] !== "string" ||
    typeof ca["rulePackVersion"] !== "string" ||
    ca["rulePackStatus"] !== "approved" ||
    typeof ca["rulePackSourceScope"] !== "string" ||
    ca["runtimeAi"] !== false ||
    ca["replacementAuthority"] !== false ||
    ca["skuSubstitutionAuthority"] !== false ||
    ca["unknownRelationshipsDeferred"] !== true ||
    ca["attachesOpticsUnderSwitches"] !== false ||
    !Number.isFinite(ds["expandByApprovedRulePackCount"]) ||
    !Number.isFinite(ds["preserveKnownRulePackChildCount"]) ||
    !Number.isFinite(ds["preserveStandaloneCustomerLineCount"]) ||
    !Number.isFinite(ds["deferUnknownRelationshipCount"])
  ) return undefined;
  return {
    scope: ca["scope"] as string,
    approvalRecordId: ca["approvalRecordId"] as string,
    rulePackId: ca["rulePackId"] as string,
    rulePackVersion: ca["rulePackVersion"] as string,
    rulePackStatus: ca["rulePackStatus"] as string,
    rulePackSourceScope: ca["rulePackSourceScope"] as string,
    dispositionSummary: {
      expandByApprovedRulePackCount: ds["expandByApprovedRulePackCount"] as number,
      preserveKnownRulePackChildCount: ds["preserveKnownRulePackChildCount"] as number,
      preserveStandaloneCustomerLineCount: ds["preserveStandaloneCustomerLineCount"] as number,
      deferUnknownRelationshipCount: ds["deferUnknownRelationshipCount"] as number,
    },
    runtimeAi: ca["runtimeAi"] as boolean,
    replacementAuthority: ca["replacementAuthority"] as boolean,
    skuSubstitutionAuthority: ca["skuSubstitutionAuthority"] as boolean,
    unknownRelationshipsDeferred: ca["unknownRelationshipsDeferred"] as boolean,
    attachesOpticsUnderSwitches: ca["attachesOpticsUnderSwitches"] as boolean,
  };
}

function extractPricingAuthority(
  payload: Record<string, unknown>
): ArtifactPricingAuthorityProvenance | undefined {
  const pa = payload["pricingAuthority"];
  if (!isRecord(pa)) return undefined;
  const b = pa["boundary"];
  if (!isRecord(b)) return undefined;
  if (
    pa["profileId"] !== "honeywell-mvp-demo-pricing-authority-profile" ||
    pa["scope"] !== "honeywell_mvp_demo_only" ||
    typeof pa["approvalRecordId"] !== "string" ||
    pa["activeSource"] !== "committed_honeywell_demo_pricing_fixture" ||
    typeof pa["activeSourceFixtureId"] !== "string" ||
    pa["activeSourceStatus"] !== "approved_demo_fixture" ||
    pa["currency"] !== "SAR" ||
    !Number.isFinite(pa["pricedSkuCount"]) ||
    !Number.isFinite(pa["missingPriceSkuCount"]) ||
    b["deterministicPricingAuthority"] !== true ||
    b["demoFixtureAuthority"] !== true ||
    b["activeRuntimeSourceReadsExternalGplCsv"] !== false ||
    b["productionCiscoPricingAuthority"] !== false ||
    b["broadCiscoGeneralPricingAuthority"] !== false ||
    b["runtimeAiPricing"] !== false ||
    b["runtimeCatalogLookup"] !== false ||
    b["configurationAuthority"] !== false ||
    b["replacementAuthority"] !== false ||
    b["skuSubstitutionAuthority"] !== false ||
    b["silentSkuSubstitution"] !== false ||
    b["missingPricesReported"] !== true
  ) return undefined;
  return {
    profileId: pa["profileId"] as string,
    scope: pa["scope"] as string,
    approvalRecordId: pa["approvalRecordId"] as string,
    activeSource: pa["activeSource"] as string,
    activeSourceFixtureId: pa["activeSourceFixtureId"] as string,
    activeSourceStatus: pa["activeSourceStatus"] as string,
    currency: pa["currency"] as string,
    pricedSkuCount: pa["pricedSkuCount"] as number,
    missingPriceSkuCount: pa["missingPriceSkuCount"] as number,
    boundary: {
      deterministicPricingAuthority: b["deterministicPricingAuthority"] as boolean,
      demoFixtureAuthority: b["demoFixtureAuthority"] as boolean,
      activeRuntimeSourceReadsExternalGplCsv: b["activeRuntimeSourceReadsExternalGplCsv"] as boolean,
      productionCiscoPricingAuthority: b["productionCiscoPricingAuthority"] as boolean,
      broadCiscoGeneralPricingAuthority: b["broadCiscoGeneralPricingAuthority"] as boolean,
      runtimeAiPricing: b["runtimeAiPricing"] as boolean,
      runtimeCatalogLookup: b["runtimeCatalogLookup"] as boolean,
      configurationAuthority: b["configurationAuthority"] as boolean,
      replacementAuthority: b["replacementAuthority"] as boolean,
      skuSubstitutionAuthority: b["skuSubstitutionAuthority"] as boolean,
      silentSkuSubstitution: b["silentSkuSubstitution"] as boolean,
      missingPricesReported: b["missingPricesReported"] as boolean,
    },
  };
}

function extractAuthorityProvenance(
  payload: Record<string, unknown>
): ArtifactAuthorityProvenance | undefined {
  const ca = extractConfigAuthority(payload);
  const pa = extractPricingAuthority(payload);
  if (ca === undefined && pa === undefined) return undefined;
  return {
    ...(ca !== undefined ? { configurationAuthority: ca } : {}),
    ...(pa !== undefined ? { pricingAuthority: pa } : {}),
  };
}

function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    tenantId: project.tenantId,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    ...(project.pricingConfig !== undefined
      ? { pricingConfig: { ...project.pricingConfig } }
      : {}),
    ...(project.archivedAt !== undefined
      ? { archivedAt: iso(project.archivedAt) }
      : {}),
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  };
}

function toStageSummary(stage: ProjectStage): ProjectStageSummary {
  return {
    id: stage.id,
    stageId: stage.stageId,
    order: stage.order,
    status: stage.status,
    createdAt: iso(stage.createdAt),
    updatedAt: iso(stage.updatedAt),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): ProjectArtifactSummary {
  const provenance = extractAuthorityProvenance(artifact.payload);
  return {
    id: artifact.id,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    ...(artifact.filePath !== undefined ? { filePath: artifact.filePath } : {}),
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: iso(artifact.createdAt),
    updatedAt: iso(artifact.updatedAt),
    ...(provenance !== undefined ? { authorityProvenance: provenance } : {}),
  };
}

function toApprovalSummary(approval: ProjectApproval): ProjectApprovalSummary {
  return {
    id: approval.id,
    stageId: approval.stageId,
    artifactId: approval.artifactId,
    artifactVersion: approval.artifactVersion,
    decision: approval.decision,
    decidedBy: approval.decidedBy,
    decidedAt: iso(approval.decidedAt),
    ...(approval.note !== undefined ? { note: approval.note } : {}),
  };
}

/** Highest-version artifact of `type`; undefined when none. By version, not order. */
function latestByType(
  artifacts: readonly ProjectArtifact[],
  type: ProjectArtifactType
): ProjectArtifact | undefined {
  let latest: ProjectArtifact | undefined;
  for (const artifact of artifacts) {
    if (artifact.type !== type) continue;
    if (latest === undefined || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

function spineSummary(
  artifacts: readonly ProjectArtifact[],
  type: ProjectArtifactType
): ProjectArtifactSummary | null {
  const latest = latestByType(artifacts, type);
  return latest === undefined ? null : toArtifactSummary(latest);
}

/**
 * Load the read-only Quick BoM workspace for one project, tenant-scoped on every
 * store call. Returns `not_found` when the project does not exist, `wrong_mode`
 * (with a project summary, and WITHOUT loading artifacts/approvals) when the
 * project is not a Quick BoM project, else `ok` with the serializable workspace.
 */
export async function loadProjectQuickBomWorkspace(
  tenantId: string,
  projectId: string
): Promise<ProjectQuickBomWorkspaceResult> {
  // Read-only inspection loader: archived Projects stay openable (QBM-LOG-006).
  const project = await getProjectById(tenantId, projectId, { includeArchived: true });
  if (project === null) return { status: "not_found" };
  if (project.mode !== "quick_bom") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const [artifacts, approvals] = await Promise.all([
    listProjectArtifacts(tenantId, projectId),
    listProjectApprovals(tenantId, projectId),
  ]);

  const workspace: ProjectQuickBomWorkspace = {
    project: toProjectSummary(project),
    stages: project.stages.map(toStageSummary),
    artifacts: artifacts.map(toArtifactSummary),
    spineArtifacts: {
      normalized_boq: spineSummary(artifacts, "normalized_boq"),
      sku_resolution: spineSummary(artifacts, "sku_resolution"),
      configuration_expansion: spineSummary(artifacts, "configuration_expansion"),
      priced_boq: spineSummary(artifacts, "priced_boq"),
      export_package: spineSummary(artifacts, "export_package"),
    },
    approvals: approvals.map(toApprovalSummary),
    readiness: getQuickBomReadinessReport({ projectId, artifacts }),
  };

  return { status: "ok", workspace };
}
