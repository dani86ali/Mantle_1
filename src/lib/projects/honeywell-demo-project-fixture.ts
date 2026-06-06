/**
 * Honeywell Quick BoM DEMO Project fixture (Prompt 78). DEMO-ONLY: seeds the one
 * canonical Honeywell quick_bom demo Project end to end through existing Project
 * stores/services (createProject -> normalized_boq + draft/reviewed sku_resolution ->
 * configuration_expansion -> priced_boq -> Mantle export_package, approving each gated
 * step in turn and leaving the export package needs_review). NOT a reusable production
 * seeder - never seed real customer Projects. Authority stays split (11A.1): approved
 * rule pack + explicit review drive configuration; the committed demo pricing fixture
 * (demo authority only, not production Cisco pricing) + demo config drive pricing; no
 * catalog/AI/fuzzy/substitution/replacement, and the two optics stay standalone customer
 * lines. Source of truth: MVP_CANONICAL_PROJECT_STATE.md (sections 11, 11A).
 */
import { createProject } from "@/lib/db/project-store";
import { createProjectArtifactVersion } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { createReviewedSkuResolutionArtifact } from "@/lib/projects/sku-resolution-review-artifact";
import { createConfigurationExpansionArtifact } from "@/lib/projects/config-expansion-artifact";
import { createPricedBoqArtifact } from "@/lib/projects/priced-boq-artifact";
import { createMantleExportArtifact } from "@/lib/projects/mantle-export-artifact";
import { loadProjectQuickBomWorkspace, type ProjectQuickBomWorkspaceResult } from "@/lib/projects/project-quick-bom-workspace";
import { getHoneywellMvpConfigExpansionRulePack } from "@/lib/projects/honeywell-config-expansion-rule-pack";
import { buildConfigurationExpansionDraft } from "@/lib/projects/config-expansion";
import { getHoneywellDemoMantleCategoryByAcceptedSku, getHoneywellDemoUnitListPriceSarBySku } from "@/lib/projects/honeywell-demo-pricing-fixture";
import type { SkuResolutionArtifactPayload } from "@/lib/projects/sku-resolution-artifact";
import type { SkuResolutionReviewAction } from "@/lib/projects/sku-resolution-review";
import type { CanonicalBoqLine, Project, ProjectApproval, ProjectArtifact, ProjectPricingConfig, SkuResolutionDecision } from "@/types/project";

/** Synthetic source-file id: the demo fixture persists no real customer upload. */
const DEMO_SOURCE_FILE_ID = "honeywell-demo-boq-file";
const DEMO_SOURCE_FILE_NAME = "Honeywell_BoQ.xlsx";
const DEFAULT_PROJECT_NAME = "Honeywell Quick BoM Demo";
const DEFAULT_CUSTOMER_NAME = "Honeywell";

/** Customer Honeywell BoQ rows in customer order: [lineNumber, SKU, quantity]. */
const DEMO_BOQ_ROWS: ReadonlyArray<readonly [number, string, number]> = [
  [1, "CW9178I-CFG", 12],
  [2, "CISCO-NETWORK-SUB", 1],
  [3, "C9300X-48HX-A", 7],
  [4, "C9300L-24P-4X-A", 6],
  [5, "SFP-10G-LR-S=", 12],
  [6, "SFP-10/25G-LR-S=", 14],
  [7, "CP-7841-K9=", 59],
];

/** Deterministic demo pricing config (SAR, markup 0, VAT 15, 2 decimals). */
const DEMO_PRICING_CONFIG: ProjectPricingConfig = { currency: "SAR", mode: "markup", ratePercent: 0, vatRatePercent: 15, roundingDecimals: 2 };
// catalogSource is typed to the single LOCAL_CATALOG_SOURCE literal; inlined so the fixture imports no catalog module (no real lookup).
const CATALOG_SOURCE = "local_stc_historical_mock" as const;

/** Input for {@link createHoneywellQuickBomDemoProjectFixture}. Demo-only. */
export interface CreateHoneywellQuickBomDemoProjectFixtureInput {
  tenantId: string;
  /** Required nonblank human actor for every seeded review/approval. */
  decidedBy: string;
  /** Required nonblank Mantle workbook output path. */
  outputPath: string;
  projectName?: string;
  customerName?: string;
  /** Reused for every seeded approval/review; captured once when omitted. */
  decidedAt?: Date;
  projectIdLabel?: string;
  dealId?: string;
  priceList?: string;
}

/** Everything the demo seeding produced, in canonical Quick BoM order. */
export interface HoneywellQuickBomDemoProjectFixtureResult {
  project: Project;
  normalizedBoqArtifact: ProjectArtifact;
  skuResolutionDraftArtifact: ProjectArtifact;
  skuResolutionReviewedArtifact: ProjectArtifact;
  configurationExpansionArtifact: ProjectArtifact;
  pricedBoqArtifact: ProjectArtifact;
  exportPackageArtifact: ProjectArtifact;
  approvals: { skuResolution: ProjectApproval; configurationExpansion: ProjectApproval; pricedBoq: ProjectApproval };
  workspace: ProjectQuickBomWorkspaceResult;
}

function demoBoqLine([row, sku, quantity]: readonly [number, string, number]): CanonicalBoqLine {
  return {
    sourceFormat: "format_2_number_part_qty", sourceFileId: DEMO_SOURCE_FILE_ID, sourceRowNumber: row, originalLineNumber: String(row),
    sku, description: sku, quantity, originalCells: { "#": String(row), "Part Number": sku, Qty: String(quantity) },
  };
}

/** Accepted SKU decision (each SKU accepted as itself) feeding the expansion draft. */
function acceptedSkuDecision([row, sku]: readonly [number, string, number]): SkuResolutionDecision {
  return { sourceFileId: DEMO_SOURCE_FILE_ID, sourceRowNumber: row, originalLineNumber: String(row), originalSku: sku, status: "accepted", suggestions: [], acceptedSku: sku };
}

/** Explicit accept action: acceptedSku equals the original SKU (no substitution). */
function acceptSkuAction([row, sku]: readonly [number, string, number], decidedBy: string, decidedAt: Date): SkuResolutionReviewAction {
  return { sourceFileId: DEMO_SOURCE_FILE_ID, sourceRowNumber: row, decision: "accept", acceptedSku: sku, decidedBy, decidedAt };
}

/** Draft sku_resolution payload: one exact same-SKU suggestion per customer row, unaccepted. */
function draftSkuResolutionPayload(normalized: ProjectArtifact): SkuResolutionArtifactPayload {
  const decisions: SkuResolutionDecision[] = DEMO_BOQ_ROWS.map(([row, sku]) => ({
    sourceFileId: DEMO_SOURCE_FILE_ID, sourceRowNumber: row, originalLineNumber: String(row), originalSku: sku,
    status: "needs_review",
    suggestions: [{ suggestedSku: sku, description: sku, source: "exact", rationale: "Exact same-SKU demo suggestion; human approval required before pricing." }],
  }));
  return {
    sourceNormalizedBoqArtifactId: normalized.id, sourceNormalizedBoqArtifactVersion: normalized.version,
    sourceFileIds: [DEMO_SOURCE_FILE_ID], lineCount: decisions.length, decisions,
    summary: { totalLines: decisions.length, needsReviewCount: decisions.length, unresolvedCount: 0, acceptedCount: 0, rejectedCount: 0, exactSuggestionCount: decisions.length, normalizedSuggestionCount: 0, ambiguousCount: 0, zeroPriceSuggestionCount: 0, catalogSource: CATALOG_SOURCE },
  };
}

/** Approve one exact artifact version; throw if the artifact is not found. */
async function approveArtifact(tenantId: string, projectId: string, artifactId: string, decidedBy: string, decidedAt: Date): Promise<ProjectApproval> {
  const result = await createProjectApproval({ tenantId, projectId, artifactId, decision: "approved", decidedBy, decidedAt });
  if (result === null) throw new Error("Demo fixture approval failed: artifact not found.");
  return result.approval;
}

/**
 * Seed the canonical Honeywell quick_bom DEMO Project end to end. DEMO-ONLY (not a
 * production seeder). Requires a nonblank decidedBy and outputPath - both are checked
 * before anything is created. The export_package is intentionally left needs_review.
 */
export async function createHoneywellQuickBomDemoProjectFixture(
  input: CreateHoneywellQuickBomDemoProjectFixtureInput
): Promise<HoneywellQuickBomDemoProjectFixtureResult> {
  const { tenantId, decidedBy, outputPath } = input;
  if (decidedBy.trim() === "") throw new Error("decidedBy is required.");
  if (outputPath.trim() === "") throw new Error("outputPath is required.");

  // One timestamp for every seeded approval/review action (never re-read).
  const decidedAt = input.decidedAt ?? new Date();
  const projectName = input.projectName ?? DEFAULT_PROJECT_NAME;
  const customerName = input.customerName ?? DEFAULT_CUSTOMER_NAME;

  const project = await createProject({ tenantId, name: projectName, mode: "quick_bom", customerName, pricingConfig: DEMO_PRICING_CONFIG });

  const lines = DEMO_BOQ_ROWS.map(demoBoqLine);
  const normalizedBoqArtifact = await createProjectArtifactVersion({
    projectId: project.id, tenantId, stageId: "boq_format_validation", type: "normalized_boq", status: "generated",
    payload: { sourceFileId: DEMO_SOURCE_FILE_ID, sourceFileName: DEMO_SOURCE_FILE_NAME, lineCount: lines.length, sourceFormats: ["format_2_number_part_qty"], lines },
    sourceFileIds: [DEMO_SOURCE_FILE_ID], sourceArtifactIds: [],
  });

  const skuResolutionDraftArtifact = await createProjectArtifactVersion({
    projectId: project.id, tenantId, stageId: "sku_resolution", type: "sku_resolution", status: "needs_review",
    payload: draftSkuResolutionPayload(normalizedBoqArtifact),
    sourceFileIds: [DEMO_SOURCE_FILE_ID], sourceArtifactIds: [normalizedBoqArtifact.id],
  });

  const reviewed = await createReviewedSkuResolutionArtifact({
    tenantId, projectId: project.id, skuResolutionArtifactId: skuResolutionDraftArtifact.id,
    actions: DEMO_BOQ_ROWS.map((boqRow) => acceptSkuAction(boqRow, decidedBy, decidedAt)),
  });
  const skuResolutionReviewedArtifact = reviewed.artifact;
  const skuApproval = await approveArtifact(tenantId, project.id, skuResolutionReviewedArtifact.id, decidedBy, decidedAt);

  // Configuration authority: active approved Honeywell pack + explicit accept per expansion line (pricing authority stays separate, below).
  const rulePack = getHoneywellMvpConfigExpansionRulePack();
  const draft = buildConfigurationExpansionDraft({ lines, decisions: DEMO_BOQ_ROWS.map(acceptedSkuDecision), rulePack });
  const expansionDecisions = draft.lines.filter((line) => line.origin === "expansion").map((line) => ({ lineId: line.lineId, action: "accept" as const }));

  const configurationExpansion = await createConfigurationExpansionArtifact({
    tenantId, projectId: project.id,
    normalizedBoqArtifactId: normalizedBoqArtifact.id, skuResolutionArtifactId: skuResolutionReviewedArtifact.id,
    rulePackId: rulePack.rulePackId, rulePackVersion: rulePack.version, rulePackStatus: rulePack.status,
    lines: draft.lines, decisions: expansionDecisions, reviewedBy: decidedBy, reviewedAt: decidedAt.toISOString(),
  });
  const configurationExpansionArtifact = configurationExpansion.artifact;
  const ceApproval = await approveArtifact(tenantId, project.id, configurationExpansionArtifact.id, decidedBy, decidedAt);

  // Pricing authority: committed Honeywell demo pricing fixture + demo pricing config.
  const priced = await createPricedBoqArtifact({
    tenantId, projectId: project.id, configurationExpansionArtifactId: configurationExpansionArtifact.id,
    pricingConfig: DEMO_PRICING_CONFIG, unitListPriceSarBySku: getHoneywellDemoUnitListPriceSarBySku(),
  });
  const pricedBoqArtifact = priced.artifact;
  const pricedApproval = await approveArtifact(tenantId, project.id, pricedBoqArtifact.id, decidedBy, decidedAt);

  // Mantle export package is created needs_review and intentionally NOT approved here.
  const exported = await createMantleExportArtifact({
    tenantId, projectId: project.id, pricedBoqArtifactId: pricedBoqArtifact.id, outputPath,
    categoryByAcceptedSku: getHoneywellDemoMantleCategoryByAcceptedSku(),
    ...(input.projectIdLabel !== undefined ? { projectIdLabel: input.projectIdLabel } : {}),
    ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
    ...(input.priceList !== undefined ? { priceList: input.priceList } : {}),
  });

  const workspace = await loadProjectQuickBomWorkspace(tenantId, project.id);

  return {
    project, normalizedBoqArtifact, skuResolutionDraftArtifact, skuResolutionReviewedArtifact,
    configurationExpansionArtifact, pricedBoqArtifact, exportPackageArtifact: exported.artifact,
    approvals: { skuResolution: skuApproval, configurationExpansion: ceApproval, pricedBoq: pricedApproval },
    workspace,
  };
}
