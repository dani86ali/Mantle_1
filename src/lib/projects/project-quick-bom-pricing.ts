/**
 * Quick BoM pricing service: create a `priced_boq` DRAFT artifact (status
 * `needs_review`) from one already-approved, reviewed (non-draft)
 * `configuration_expansion` artifact. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 9, 11A,
 * section 19 task 8j). Canonical shapes: src/types/project.ts.
 *
 * Scope (Prompt 92) is the single product step "approved configuration_expansion ->
 * priced_boq draft". It verifies the Project (not_found / wrong_mode) and requires
 * the Project-owned `pricingConfig` to exist (pricing_config_missing) BEFORE loading
 * any artifact or pricing, then delegates the load+price+persist to the existing
 * deterministic {@link createPricedBoqArtifact}. That delegate reads exactly one
 * approved configuration_expansion artifact, enforces the Project-approval and
 * approved-rule-pack gates, prices its acceptedLines, and persists ONE `needs_review`
 * `priced_boq` artifact ready for the existing exact-artifact approval flow.
 *
 * AUTHORITY BOUNDARY: pricing is deterministic. The Project-owned `pricingConfig` is
 * the only margin/markup/VAT/rounding authority (copied fresh per call), and the
 * committed Honeywell MVP demo SAR price fixture is the ONLY unit-price source for
 * this MVP demo wiring. That fixture is TEMPORARY demo pricing authority only: not
 * production Cisco pricing, not broad Cisco-general pricing, not runtime AI pricing,
 * not catalog lookup, not replacement authority, and it authorizes no silent SKU
 * substitution. Missing prices stay missing_price warnings inside the priced_boq
 * payload; this service never invents or substitutes a price. Pricing approval stays
 * the existing exact-artifact approval flow - this service approves nothing. The
 * caller supplies no price map, pricingConfig, tenantId, projectId, artifactId, or
 * approver: every authority is the tenant session, the route params, the Project, or
 * the committed fixture.
 *
 * It does NO catalog lookup, SKU replacement, rule-pack work, configuration expansion,
 * normalization, SKU review, staleness propagation, stage-status update, export,
 * upload, or approval creation, and imports no artifact/approval store, DB schema,
 * pricing math, the pure priced-boq helper, catalog, config-expansion, Mantle/export,
 * runner, engine, coordinator, adapter, or AI module. It translates the delegate's
 * known failures into discriminated statuses, re-throws anything unexpected for the
 * route to map to a safe 500, returns lean serializable summaries only (never the
 * full payload, priced lines, amounts, or the per-SKU price map), and never mutates
 * its input, the Project, the pricingConfig, the fixture map, or the delegate result.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createPricedBoqArtifact,
  type CreatePricedBoqArtifactResult,
  type PricedBoqArtifactPayload,
  type PricingAuthorityTrace,
  type ConfigurationAuthorityTrace,
} from "@/lib/projects/priced-boq-artifact";
import { getHoneywellDemoUnitListPriceSarBySku } from "@/lib/projects/honeywell-demo-pricing-fixture";
import { getHoneywellDemoPricingAuthorityProfile } from "@/lib/projects/honeywell-demo-pricing-authority";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectPricingConfig,
  ProjectStageId,
} from "@/types/project";

/**
 * Exact messages thrown by {@link createPricedBoqArtifact} and the pure pricing
 * helpers it composes. They are private to those modules, so this wrapper mirrors the
 * literals deliberately to translate them into safe statuses without importing or
 * editing them.
 */
const MISSING_EXPANSION_MESSAGE = "Configuration expansion artifact not found.";
const WRONG_EXPANSION_TYPE_MESSAGE = "Artifact is not a configuration_expansion artifact.";
const INVALID_EXPANSION_PAYLOAD_MESSAGE = "Configuration expansion artifact payload is invalid.";
const EXPANSION_NOT_APPROVED_MESSAGE = "Configuration expansion artifact must be approved before pricing.";
const RULE_PACK_NOT_APPROVED_MESSAGE = "Configuration expansion artifact requires an approved rule pack.";
// A bad accepted-line quantity is a malformed configuration_expansion payload, not a
// pricing-config or demo-fixture fault.
const QUANTITY_MESSAGE = "quantity must be a finite nonnegative number.";
// Project pricing-config guard messages (validateProjectPricingConfig in pricing.ts).
const PRICING_CONFIG_MESSAGES: readonly string[] = [
  "Pricing currency must be SAR.",
  "Pricing mode must be margin or markup.",
  "Margin ratePercent must be a finite number from 0 up to, but not including, 100.",
  "Markup ratePercent must be a finite number from 0 to 100.",
  "VAT ratePercent must be a finite number from 0 to 100.",
  "roundingDecimals must be an integer from 0 to 6.",
];
// A malformed demo-fixture price entry is a server-side fixture fault, not a Project
// or caller fault (the caller supplies no prices).
const NON_SAR_PRICE_MESSAGE = "Accepted SKU price must be in SAR.";
const UNIT_LIST_MESSAGE = "unitListPriceSar must be a finite nonnegative number.";

/**
 * Pricing-source boundary block surfaced on every priced_boq payload summary. It
 * records that the unit prices came from the TEMPORARY Honeywell MVP demo fixture and
 * carry demo authority only - never production, AI, catalog, or replacement authority.
 */
const PRICING_SOURCE = {
  source: "honeywell_mvp_demo_pricing_fixture",
  scope: "honeywell_mvp_demo_only",
  currency: "SAR",
  demoFixtureAuthority: true,
  productionPricingAuthority: false,
  runtimeAiPricing: false,
  runtimeCatalogLookup: false,
  replacementAuthority: false,
  silentSkuSubstitution: false,
} as const;

/** Input for {@link createProjectQuickBomPricedBoq}. */
export interface CreateProjectQuickBomPricedBoqInput {
  tenantId: string;
  projectId: string;
  /** The exact approved, reviewed configuration_expansion artifact to price. */
  configurationExpansionArtifactId: string;
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export interface QuickBomPricingProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface QuickBomPricingArtifactSummary {
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

/** Deterministic priced-BoQ roll-up counts/totals (no per-line detail). */
export type QuickBomPricingSummary = PricedBoqArtifactPayload["summary"];

/** The pricing-source boundary block carried on the payload summary. */
export type QuickBomPricingSourceSummary = typeof PRICING_SOURCE;

/**
 * Serializable priced-payload summary: provenance ids/versions, the copied source
 * file ids, the copied pricingConfig, the pricing-source boundary, the line count,
 * and the pricing summary. The full priced lines, amounts, and per-SKU price map are
 * never surfaced.
 */
export interface QuickBomPricingPayloadSummary {
  sourceConfigurationExpansionArtifactId: string;
  sourceConfigurationExpansionArtifactVersion: number;
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceFileIds: string[];
  pricingConfig: ProjectPricingConfig;
  pricingSource: QuickBomPricingSourceSummary;
  /** Copied pricing authority trace from the artifact payload; present only when the artifact carries one. */
  pricingAuthority?: PricingAuthorityTrace;
  /**
   * Copied configuration authority trace from the priced_boq artifact payload;
   * present only when the source configuration_expansion artifact carried one.
   * Configuration authority only - separate from pricingAuthority and pricingSource.
   */
  configurationAuthority?: ConfigurationAuthorityTrace;
  lineCount: number;
  summary: QuickBomPricingSummary;
}

/** Discriminated result of {@link createProjectQuickBomPricedBoq}. */
export type CreateProjectQuickBomPricedBoqResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: QuickBomPricingProjectSummary }
  | { status: "pricing_config_missing" }
  | { status: "configuration_expansion_not_found" }
  | { status: "artifact_not_configuration_expansion" }
  | { status: "invalid_configuration_expansion_payload" }
  | { status: "configuration_expansion_not_approved" }
  | { status: "rule_pack_not_approved" }
  | { status: "invalid_project_pricing_config" }
  | { status: "invalid_demo_pricing_fixture" }
  | {
      status: "ok";
      artifact: QuickBomPricingArtifactSummary;
      payloadSummary: QuickBomPricingPayloadSummary;
      pricingSummary: QuickBomPricingSummary;
    };

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): QuickBomPricingProjectSummary {
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

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(artifact: ProjectArtifact): QuickBomPricingArtifactSummary {
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

/** Fresh copy of the priced-BoQ summary (counts plus a fresh totals object). */
function copyPricingSummary(summary: QuickBomPricingSummary): QuickBomPricingSummary {
  return { ...summary, totals: { ...summary.totals } };
}

/**
 * Project the priced payload to a lean summary: provenance ids/versions, the copied
 * source file ids, a fresh copy of the pricingConfig, a fresh pricing-source boundary
 * block, the line count, and a fresh copy of the pricing summary. The full priced
 * lines, amounts, and per-SKU price map are never surfaced.
 */
function toPayloadSummary(payload: PricedBoqArtifactPayload): QuickBomPricingPayloadSummary {
  return {
    sourceConfigurationExpansionArtifactId: payload.sourceConfigurationExpansionArtifactId,
    sourceConfigurationExpansionArtifactVersion: payload.sourceConfigurationExpansionArtifactVersion,
    sourceNormalizedBoqArtifactId: payload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: payload.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: payload.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: payload.sourceSkuResolutionArtifactVersion,
    sourceFileIds: [...payload.sourceFileIds],
    pricingConfig: { ...payload.pricingConfig },
    pricingSource: { ...PRICING_SOURCE },
    ...(payload.pricingAuthority !== undefined
      ? { pricingAuthority: { ...payload.pricingAuthority, boundary: { ...payload.pricingAuthority.boundary } } }
      : {}),
    ...(payload.configurationAuthority !== undefined
      ? {
          configurationAuthority: {
            ...payload.configurationAuthority,
            dispositionSummary: { ...payload.configurationAuthority.dispositionSummary },
          },
        }
      : {}),
    lineCount: payload.lineCount,
    summary: copyPricingSummary(payload.summary),
  };
}

/** Translate a known delegate/pricing error into a safe status, or null if unexpected. */
function translateDelegateError(
  message: string
): CreateProjectQuickBomPricedBoqResult | null {
  if (message === MISSING_EXPANSION_MESSAGE) return { status: "configuration_expansion_not_found" };
  if (message === WRONG_EXPANSION_TYPE_MESSAGE) return { status: "artifact_not_configuration_expansion" };
  if (message === INVALID_EXPANSION_PAYLOAD_MESSAGE) return { status: "invalid_configuration_expansion_payload" };
  if (message === EXPANSION_NOT_APPROVED_MESSAGE) return { status: "configuration_expansion_not_approved" };
  if (message === RULE_PACK_NOT_APPROVED_MESSAGE) return { status: "rule_pack_not_approved" };
  if (message === QUANTITY_MESSAGE) return { status: "invalid_configuration_expansion_payload" };
  if (PRICING_CONFIG_MESSAGES.includes(message)) return { status: "invalid_project_pricing_config" };
  if (message === NON_SAR_PRICE_MESSAGE) return { status: "invalid_demo_pricing_fixture" };
  if (message === UNIT_LIST_MESSAGE) return { status: "invalid_demo_pricing_fixture" };
  return null;
}

/**
 * Price one already-approved, reviewed Quick BoM `configuration_expansion` artifact
 * into a new `needs_review` `priced_boq` artifact, tenant-scoped on every store/
 * service call. It verifies the Project within its tenant (not_found / wrong_mode,
 * lean summary), then requires the Project-owned `pricingConfig` to exist
 * (pricing_config_missing) BEFORE any artifact load or pricing. For a Project with a
 * pricingConfig it delegates the load+price+persist to {@link createPricedBoqArtifact}
 * - passing a FRESH copy of the Project pricingConfig and the committed Honeywell MVP
 * demo SAR price map as the only unit-price source - translating that service's known
 * failures into safe statuses and re-throwing anything unexpected. On success it
 * returns lean, serializable summaries of the created artifact, its payload (no
 * lines/amounts/price map), and the pricing counts. The input, Project, pricingConfig,
 * fixture map, and delegate result are never mutated.
 */
export async function createProjectQuickBomPricedBoq(
  input: CreateProjectQuickBomPricedBoqInput
): Promise<CreateProjectQuickBomPricedBoqResult> {
  const { tenantId, projectId, configurationExpansionArtifactId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "quick_bom") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }
  if (!project.pricingConfig) {
    return { status: "pricing_config_missing" };
  }

  // Pricing authority: the Project-owned config (copied fresh so the delegate cannot
  // reach the live Project object) and the demo fixture price map (a fresh deep copy
  // from its getter) are the ONLY pricing inputs; the caller supplies no price/config.
  const pricingConfig: ProjectPricingConfig = { ...project.pricingConfig };
  const unitListPriceSarBySku = getHoneywellDemoUnitListPriceSarBySku();

  // Build a lean pricing authority trace from the approved Honeywell demo profile.
  // This is provenance only and does not change pricing math or the price source.
  const profile = getHoneywellDemoPricingAuthorityProfile();
  const pricingAuthority: PricingAuthorityTrace = {
    profileId: profile.profileId,
    scope: profile.scope,
    approvalRecordId: profile.approvalRecordId,
    activeSource: profile.activeSource,
    activeSourceFixtureId: profile.activeSourceFixtureId,
    activeSourceStatus: profile.activeSourceStatus,
    activeSourceWorkbookPath: profile.activeSourceWorkbookPath,
    activeSourceSheetName: profile.activeSourceSheetName,
    currency: profile.currency,
    pricedSkuCount: profile.pricedSkuCount,
    missingPriceSkuCount: profile.missingPriceSkuCount,
    boundary: { ...profile.boundary },
  };

  let result: CreatePricedBoqArtifactResult;
  try {
    result = await createPricedBoqArtifact({
      tenantId,
      projectId,
      configurationExpansionArtifactId,
      pricingConfig,
      unitListPriceSarBySku,
      pricingAuthority,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const translated = translateDelegateError(message);
    if (translated) return translated;
    throw error;
  }

  return {
    status: "ok",
    artifact: toArtifactSummary(result.artifact),
    payloadSummary: toPayloadSummary(result.payload),
    pricingSummary: copyPricingSummary(result.payload.summary),
  };
}
